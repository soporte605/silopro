import { Inject, Injectable } from '@nestjs/common';
import {
  generateShortCode,
  type Location,
  type LocationDetail,
  type locationInputSchema,
  type locationUpdateSchema,
  isCabinetCell,
} from '@silopro/contracts';
import {
  checkPlacement,
  type LocationKind,
  type LocationNodeRef,
  locationPath,
  MAX_LOCATION_DEPTH,
} from '@silopro/domain';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { OrgContext } from '../auth/request-context.js';
import { invalid, notFound, staleVersion } from '../common/http.js';
import { DbService, type Tx } from '../db/db.service.js';
import { cabinets, locations } from '../db/schema.js';
import { locationStock } from './stock-queries.js';

const MESSAGES: Record<string, string> = {
  ROOT_MUST_BE_WAREHOUSE: 'Una ubicación sin padre debe ser un almacén',
  CHILD_KIND_NOT_ALLOWED: 'Ese tipo de ubicación no puede ir dentro del padre indicado',
  MAX_DEPTH_EXCEEDED: 'Se superó la profundidad máxima de ubicaciones',
  CYCLE: 'Una ubicación no puede contenerse a sí misma',
};

const columns = {
  id: locations.id,
  kind: locations.kind,
  code: locations.code,
  name: locations.name,
  parentId: locations.parentId,
  path: locations.path,
  qrCode: locations.qrCode,
  maxItems: locations.maxItems,
  version: locations.version,
};

/**
 * Árbol de ubicaciones. Los cajones de los gabinetes también son ubicaciones;
 * los crea y archiva `CabinetsService` al guardar el diseño.
 */
@Injectable()
export class LocationsService {
  constructor(@Inject(DbService) private readonly dbs: DbService) {}

  /**
   * Renombra, mueve o fija la capacidad. Al mover o cambiar el código se
   * recalculan la ruta y la profundidad de todo el subárbol.
   */
  update(
    ctx: OrgContext,
    id: string,
    input: z.output<typeof locationUpdateSchema>,
  ): Promise<Location> {
    return this.dbs.tenant(ctx, async (tx) => {
      const [node] = await tx
        .select()
        .from(locations)
        .where(and(eq(locations.id, id), isNull(locations.archivedAt)))
        .for('update');
      if (!node) throw notFound('Ubicación');
      if (node.version !== input.version) throw staleVersion();
      const moved = node.parentId !== input.parentId || node.code !== input.code;
      if (moved && (await this.isManagedDrawer(tx, node))) {
        throw invalid(
          'Este cajón pertenece a un gabinete: su posición y código se cambian desde el editor',
        );
      }

      const chain = input.parentId ? await this.ancestors(tx, input.parentId) : [];
      if (node.parentId !== input.parentId) {
        const violation = checkPlacement({ id: node.id, kind: node.kind }, chain[0] ?? null, chain);
        if (violation) throw invalid(MESSAGES[violation.code] ?? 'Ubicación inválida', violation);
        const height = (await this.subtreeMaxDepth(tx, node.id)) - node.depth;
        if (chain.length + height + 1 > MAX_LOCATION_DEPTH) {
          throw invalid(MESSAGES['MAX_DEPTH_EXCEEDED']!, {
            code: 'MAX_DEPTH_EXCEEDED',
            max: MAX_LOCATION_DEPTH,
          });
        }
      }
      const path = locationPath([...chain.map((c) => c.code).reverse(), input.code]);
      const delta = chain.length - node.depth;
      await tx
        .update(locations)
        .set({
          name: input.name,
          code: input.code,
          parentId: input.parentId,
          path,
          depth: chain.length,
          ...(input.maxItems !== undefined ? { maxItems: input.maxItems } : {}),
          version: node.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(locations.id, id));
      if (path !== node.path || delta !== 0) {
        await tx.execute(sql`
          with recursive sub as (
            select id from locations where parent_id = ${id}
            union all
            select l.id from locations l join sub on l.parent_id = sub.id
          )
          update locations
            set path = ${path} || substr(path, ${node.path.length + 1}),
                depth = depth + ${delta}
            where id in (select id from sub)`);
      }
      return this.one(tx, id);
    });
  }

  /** Archiva la ubicación y todo lo que contiene, solo si no hay existencias. */
  archive(ctx: OrgContext, id: string): Promise<void> {
    return this.dbs.tenant(ctx, async (tx) => {
      const [node] = await tx
        .select()
        .from(locations)
        .where(and(eq(locations.id, id), isNull(locations.archivedAt)))
        .for('update');
      if (!node) throw notFound('Ubicación');
      if (await this.isManagedDrawer(tx, node)) {
        throw invalid('Los cajones de un gabinete se quitan fusionándolos desde el editor');
      }
      const subtree = sql`(
        with recursive sub as (
          select id from locations where id = ${id}
          union all
          select l.id from locations l join sub on l.parent_id = sub.id where l.archived_at is null
        ) select id from sub)`;
      const stocked = await tx.execute<{ path: string }>(sql`
        select distinct l.path from stock_levels sl join locations l on l.id = sl.location_id
        where sl.location_id in ${subtree} and (sl.on_hand <> 0 or sl.reserved <> 0)
        order by l.path limit 5`);
      if (stocked.rows.length) {
        const paths = stocked.rows.map((r) => r.path);
        throw invalid(
          `Hay existencias en: ${paths.join(', ')}. Muévalas o ajústelas antes de archivar.`,
          { code: 'LOCATION_HAS_STOCK', paths },
        );
      }
      await tx.execute(
        sql`update locations set archived_at = now(), updated_at = now() where id in ${subtree}`,
      );
    });
  }

  /** Ficha con su contenido; para cajones indica el gabinete que los contiene. */
  detail(ctx: OrgContext, id: string): Promise<LocationDetail> {
    return this.dbs.tenant(ctx, async (tx) => {
      const [row] = await tx
        .select({ ...columns, cabinetId: cabinets.id })
        .from(locations)
        .leftJoin(cabinets, eq(cabinets.locationId, locations.id))
        .where(and(eq(locations.id, id), isNull(locations.archivedAt)));
      if (!row) throw notFound('Ubicación');
      const loc = row;
      let parentCabinetId: string | null = null;
      if (loc.parentId) {
        const [cab] = await tx
          .select({ id: cabinets.id, style: cabinets.style })
          .from(cabinets)
          .where(eq(cabinets.locationId, loc.parentId));
        if (cab && isCabinetCell(cab, loc.kind)) parentCabinetId = cab.id;
      }
      const contents = await locationStock(tx, sql`d.id = ${id}`);
      return { ...loc, parentCabinetId, contents };
    });
  }

  list(ctx: OrgContext): Promise<Location[]> {
    return this.dbs.tenant(ctx, (tx) =>
      tx
        .select({ ...columns, cabinetId: cabinets.id })
        .from(locations)
        .leftJoin(cabinets, eq(cabinets.locationId, locations.id))
        .where(isNull(locations.archivedAt))
        .orderBy(asc(locations.path)),
    );
  }

  create(ctx: OrgContext, input: z.output<typeof locationInputSchema>): Promise<Location> {
    return this.dbs.tenant(ctx, (tx) => this.insert(tx, ctx, input));
  }

  /** Inserta una ubicación aplicando las reglas de jerarquía (reutilizable en otra transacción). */
  async insert(
    tx: Tx,
    ctx: OrgContext,
    input: z.output<typeof locationInputSchema>,
  ): Promise<Location & { depth: number }> {
    const chain = input.parentId ? await this.ancestors(tx, input.parentId) : [];
    const parent = chain[0] ?? null;
    const violation = checkPlacement({ kind: input.kind }, parent, chain);
    if (violation) throw invalid(MESSAGES[violation.code] ?? 'Ubicación inválida', violation);
    const path = locationPath([...chain.map((c) => c.code).reverse(), input.code]);
    const [row] = await tx
      .insert(locations)
      .values({
        organizationId: ctx.organizationId,
        parentId: input.parentId,
        kind: input.kind,
        code: input.code,
        name: input.name,
        path,
        depth: chain.length,
        qrCode: generateShortCode(),
      })
      .returning({ ...columns, depth: locations.depth });
    return { ...row!, cabinetId: null };
  }

  private async one(tx: Tx, id: string): Promise<Location> {
    const [row] = await tx
      .select({ ...columns, cabinetId: cabinets.id })
      .from(locations)
      .leftJoin(cabinets, eq(cabinets.locationId, locations.id))
      .where(eq(locations.id, id));
    return row!;
  }

  /** Un cajón creado por un gabinete con diseño: su código es su dirección. */
  private async isManagedDrawer(
    tx: Tx,
    node: { kind: LocationKind; parentId: string | null },
  ): Promise<boolean> {
    if (!node.parentId) return false;
    const [cab] = await tx
      .select({ style: cabinets.style })
      .from(cabinets)
      .where(eq(cabinets.locationId, node.parentId));
    return !!cab && isCabinetCell(cab, node.kind);
  }

  private async subtreeMaxDepth(tx: Tx, id: string): Promise<number> {
    const res = await tx.execute<{ max: number }>(sql`
      with recursive sub as (
        select id, depth from locations where id = ${id}
        union all
        select l.id, l.depth from locations l join sub on l.parent_id = sub.id
          where l.archived_at is null
      ) select max(depth)::int as max from sub`);
    return res.rows[0]?.max ?? 0;
  }

  /** Cadena desde el nodo hasta la raíz (nodo primero). */
  private async ancestors(tx: Tx, id: string): Promise<(LocationNodeRef & { code: string })[]> {
    const res = await tx.execute<{
      id: string;
      kind: LocationKind;
      parent_id: string | null;
      code: string;
    }>(sql`
      with recursive chain as (
        select id, kind, parent_id, code, 1 as depth from locations where id = ${id} and archived_at is null
        union all
        select l.id, l.kind, l.parent_id, l.code, chain.depth + 1 from locations l
          join chain on l.id = chain.parent_id where chain.depth < 20
      )
      select id, kind, parent_id, code from chain order by depth`);
    if (!res.rows.length) throw invalid('La ubicación padre no existe');
    return res.rows.map((r) => ({ id: r.id, kind: r.kind, parentId: r.parent_id, code: r.code }));
  }
}
