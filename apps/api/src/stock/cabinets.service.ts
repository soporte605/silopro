import { Inject, Injectable } from '@nestjs/common';
import {
  assertCanonicalLayout,
  type CabinetLayout,
  type Compartment,
  createGridLayout,
  LayoutError,
} from '@silopro/cabinet-engine';
import {
  type Cabinet,
  type CabinetCompartment,
  type cabinetInputSchema,
  type cabinetLayoutUpdateSchema,
  type CabinetStockEntry,
  type CabinetSummary,
  type CompartmentState,
  type compartmentUpdateSchema,
  generateShortCode,
} from '@silopro/contracts';
import { isLowStock, locationPath, MAX_LOCATION_DEPTH } from '@silopro/domain';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { OrgContext } from '../auth/request-context.js';
import { invalid, notFound, staleVersion } from '../common/http.js';
import { DbService, type Tx } from '../db/db.service.js';
import { iso, num, num0 } from '../db/mappers.js';
import { cabinets, locations, stockLevels } from '../db/schema.js';
import { LocationsService } from './locations.service.js';

type CabinetRow = typeof cabinets.$inferSelect;
type LocationRow = {
  id: string;
  code: string;
  name: string;
  path: string;
  qrCode: string;
  maxItems: number | null;
};

const drawerName = (address: string) => `Cajón ${address}`;

/**
 * Gabinetes con diseño guardado. El gabinete es una ubicación de tipo
 * `cabinet` y cada compartimento una ubicación hija de tipo `drawer` con la
 * dirección como código, de modo que las existencias se registran en cajones
 * igual que en cualquier otra ubicación.
 *
 * Al guardar un diseño (fusionar, dividir, redimensionar) se sincronizan los
 * cajones: los que desaparecen se archivan solo si están vacíos, y los que
 * reaparecen se restauran con su historial.
 */
@Injectable()
export class CabinetsService {
  constructor(
    @Inject(DbService) private readonly dbs: DbService,
    @Inject(LocationsService) private readonly locationsSvc: LocationsService,
  ) {}

  list(ctx: OrgContext): Promise<CabinetSummary[]> {
    return this.dbs.tenant(ctx, async (tx) => {
      const rows = await tx
        .select({
          c: cabinets,
          loc: { code: locations.code, name: locations.name, path: locations.path },
          occupied: sql<number>`(
            select count(distinct sl.location_id)::int from ${stockLevels} sl
            join ${locations} d on d.id = sl.location_id
            where d.parent_id = ${cabinets.locationId} and d.archived_at is null and sl.on_hand <> 0
          )`,
        })
        .from(cabinets)
        .innerJoin(locations, eq(locations.id, cabinets.locationId))
        .where(isNull(locations.archivedAt))
        .orderBy(asc(locations.path));
      return rows.map((r) => this.summary(r.c, r.loc, r.occupied));
    });
  }

  get(ctx: OrgContext, id: string): Promise<Cabinet> {
    return this.dbs.tenant(ctx, (tx) => this.load(tx, id));
  }

  create(ctx: OrgContext, input: z.output<typeof cabinetInputSchema>): Promise<Cabinet> {
    return this.dbs.tenant(ctx, async (tx) => {
      const loc = await this.locationsSvc.insert(tx, ctx, {
        kind: 'cabinet',
        code: input.code,
        name: input.name,
        parentId: input.parentId,
      });
      if (loc.depth + 1 >= MAX_LOCATION_DEPTH) {
        throw invalid('Se superó la profundidad máxima de ubicaciones');
      }
      const layout = createGridLayout({
        rows: input.rows,
        columns: input.columns,
        addressing: input.addressing,
        rowOrigin: input.rowOrigin,
      });
      const [cab] = await tx
        .insert(cabinets)
        .values({
          organizationId: ctx.organizationId,
          locationId: loc.id,
          rows: layout.rows,
          columns: layout.columns,
          addressing: layout.addressing,
          rowOrigin: layout.rowOrigin,
          compartments: layout.compartments,
        })
        .returning({ id: cabinets.id });
      await this.insertDrawers(tx, ctx, loc, layout.compartments);
      return this.load(tx, cab!.id);
    });
  }

  updateLayout(
    ctx: OrgContext,
    id: string,
    input: z.output<typeof cabinetLayoutUpdateSchema>,
  ): Promise<Cabinet> {
    return this.dbs.tenant(ctx, async (tx) => {
      const [cab] = await tx.select().from(cabinets).where(eq(cabinets.id, id)).for('update');
      if (!cab) throw notFound('Gabinete');
      if (cab.version !== input.version) throw staleVersion();
      const layout: CabinetLayout = {
        rows: input.rows,
        columns: input.columns,
        addressing: cab.addressing as CabinetLayout['addressing'],
        rowOrigin: cab.rowOrigin as CabinetLayout['rowOrigin'],
        compartments: input.compartments,
      };
      try {
        assertCanonicalLayout(layout);
      } catch (e) {
        if (e instanceof LayoutError) throw invalid(e.message, { code: e.code });
        throw e;
      }

      const [loc] = await tx
        .select({
          id: locations.id,
          code: locations.code,
          name: locations.name,
          path: locations.path,
          qrCode: locations.qrCode,
          depth: locations.depth,
        })
        .from(locations)
        .where(eq(locations.id, cab.locationId));
      const children = await tx
        .select({ id: locations.id, code: locations.code, archivedAt: locations.archivedAt })
        .from(locations)
        .where(and(eq(locations.parentId, cab.locationId), eq(locations.kind, 'drawer')));
      const wanted = new Set(layout.compartments.map((c) => c.id));
      const byCode = new Map(children.map((c) => [c.code, c]));

      const removed = children.filter((c) => !c.archivedAt && !wanted.has(c.code));
      if (removed.length) {
        const stocked = await tx
          .selectDistinct({ code: locations.code })
          .from(stockLevels)
          .innerJoin(locations, eq(locations.id, stockLevels.locationId))
          .where(
            and(
              inArray(
                stockLevels.locationId,
                removed.map((c) => c.id),
              ),
              sql`(${stockLevels.onHand} <> 0 or ${stockLevels.reserved} <> 0)`,
            ),
          )
          .orderBy(asc(locations.code));
        if (stocked.length) {
          const addresses = stocked.map((s) => s.code);
          throw invalid(
            `Estos cajones tienen existencias y desaparecerían: ${addresses.join(', ')}. Muévalas o ajústelas primero.`,
            { code: 'COMPARTMENT_HAS_STOCK', addresses },
          );
        }
        await tx
          .update(locations)
          .set({ archivedAt: new Date(), updatedAt: new Date() })
          .where(
            inArray(
              locations.id,
              removed.map((c) => c.id),
            ),
          );
      }

      const restored = children.filter((c) => c.archivedAt && wanted.has(c.code));
      if (restored.length) {
        await tx
          .update(locations)
          .set({ archivedAt: null, updatedAt: new Date() })
          .where(
            inArray(
              locations.id,
              restored.map((c) => c.id),
            ),
          );
      }
      await this.insertDrawers(
        tx,
        ctx,
        loc!,
        layout.compartments.filter((c) => !byCode.has(c.id)),
      );

      await tx
        .update(cabinets)
        .set({
          rows: layout.rows,
          columns: layout.columns,
          compartments: layout.compartments,
          version: cab.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(cabinets.id, id));
      return this.load(tx, id);
    });
  }

  /** Renombra un cajón o fija cuántos artículos distintos admite. */
  updateCompartment(
    ctx: OrgContext,
    id: string,
    compartmentId: string,
    input: z.output<typeof compartmentUpdateSchema>,
  ): Promise<Cabinet> {
    return this.dbs.tenant(ctx, async (tx) => {
      const [cab] = await tx
        .select({ locationId: cabinets.locationId })
        .from(cabinets)
        .where(eq(cabinets.id, id));
      if (!cab) throw notFound('Gabinete');
      const updated = await tx
        .update(locations)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.maxItems !== undefined ? { maxItems: input.maxItems } : {}),
          version: sql`${locations.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(locations.parentId, cab.locationId),
            eq(locations.kind, 'drawer'),
            eq(locations.code, compartmentId),
            isNull(locations.archivedAt),
          ),
        )
        .returning({ id: locations.id });
      if (!updated.length) throw notFound('Compartimento');
      return this.load(tx, id);
    });
  }

  stock(ctx: OrgContext, id: string): Promise<CabinetStockEntry[]> {
    return this.dbs.tenant(ctx, async (tx) => {
      const [cab] = await tx
        .select({ locationId: cabinets.locationId })
        .from(cabinets)
        .where(eq(cabinets.id, id));
      if (!cab) throw notFound('Gabinete');
      return this.stockOf(tx, cab.locationId);
    });
  }

  private async stockOf(tx: Tx, cabinetLocationId: string): Promise<CabinetStockEntry[]> {
    const res = await tx.execute<{
      location_id: string;
      item_id: string;
      sku: string;
      name: string;
      on_hand: string;
      symbol: string;
      min_stock: string | null;
      available: string;
    }>(sql`
      select sl.location_id, i.id as item_id, i.sku, i.name, sl.on_hand, u.symbol, i.min_stock,
        (select coalesce(sum(s2.on_hand - s2.reserved), 0) from stock_levels s2
          where s2.item_id = i.id) as available
      from stock_levels sl
      join locations d on d.id = sl.location_id
      join items i on i.id = sl.item_id
      join units u on u.id = i.unit_id
      where d.parent_id = ${cabinetLocationId} and d.archived_at is null
        and i.archived_at is null and sl.on_hand <> 0
      order by d.code, i.name`);
    return res.rows.map((r) => ({
      locationId: r.location_id,
      itemId: r.item_id,
      sku: r.sku,
      itemName: r.name,
      onHand: num0(r.on_hand),
      unitSymbol: r.symbol,
      lowStock: isLowStock(num0(r.available), num(r.min_stock)),
    }));
  }

  private async insertDrawers(
    tx: Tx,
    ctx: OrgContext,
    cabinetLoc: { id: string; path: string; depth: number },
    compartments: readonly Compartment[],
  ): Promise<void> {
    // Por lotes para no superar el límite de parámetros de PostgreSQL.
    for (let i = 0; i < compartments.length; i += 500) {
      await tx.insert(locations).values(
        compartments.slice(i, i + 500).map((c) => ({
          organizationId: ctx.organizationId,
          parentId: cabinetLoc.id,
          kind: 'drawer' as const,
          code: c.id,
          name: drawerName(c.address),
          path: locationPath([cabinetLoc.path, c.id]),
          depth: cabinetLoc.depth + 1,
          qrCode: generateShortCode(),
        })),
      );
    }
  }

  private async load(tx: Tx, id: string): Promise<Cabinet> {
    const [row] = await tx
      .select({
        c: cabinets,
        loc: {
          code: locations.code,
          name: locations.name,
          path: locations.path,
          qrCode: locations.qrCode,
        },
      })
      .from(cabinets)
      .innerJoin(locations, eq(locations.id, cabinets.locationId))
      .where(and(eq(cabinets.id, id), isNull(locations.archivedAt)));
    if (!row) throw notFound('Gabinete');
    const drawers: LocationRow[] = await tx
      .select({
        id: locations.id,
        code: locations.code,
        name: locations.name,
        path: locations.path,
        qrCode: locations.qrCode,
        maxItems: locations.maxItems,
      })
      .from(locations)
      .where(
        and(
          eq(locations.parentId, row.c.locationId),
          eq(locations.kind, 'drawer'),
          isNull(locations.archivedAt),
        ),
      );
    const byCode = new Map(drawers.map((d) => [d.code, d]));
    const stock = await this.stockOf(tx, row.c.locationId);
    const perLocation = new Map<string, { count: number; low: boolean }>();
    for (const s of stock) {
      const agg = perLocation.get(s.locationId) ?? { count: 0, low: false };
      agg.count++;
      agg.low ||= s.lowStock;
      perLocation.set(s.locationId, agg);
    }
    const compartments: CabinetCompartment[] = (row.c.compartments as Compartment[]).map((c) => {
      const d = byCode.get(c.id);
      const agg = d ? perLocation.get(d.id) : undefined;
      const maxItems = d?.maxItems ?? null;
      const state: CompartmentState = !agg
        ? 'empty'
        : agg.low
          ? 'low'
          : maxItems !== null && agg.count >= maxItems
            ? 'full'
            : 'stocked';
      return {
        ...c,
        locationId: d?.id ?? '',
        name: d?.name ?? drawerName(c.address),
        qrCode: d?.qrCode ?? '',
        itemCount: agg?.count ?? 0,
        maxItems,
        state,
      };
    });
    const occupied = compartments.filter((c) => c.state !== 'empty').length;
    return {
      ...this.summary(row.c, row.loc, occupied),
      addressing: row.c.addressing as Cabinet['addressing'],
      rowOrigin: row.c.rowOrigin as Cabinet['rowOrigin'],
      qrCode: row.loc.qrCode,
      compartments,
    };
  }

  private summary(
    c: CabinetRow,
    loc: { code: string; name: string; path: string },
    occupied: number,
  ): CabinetSummary {
    return {
      id: c.id,
      locationId: c.locationId,
      code: loc.code,
      name: loc.name,
      path: loc.path,
      rows: c.rows,
      columns: c.columns,
      compartmentCount: (c.compartments as unknown[]).length,
      occupiedCount: occupied,
      version: c.version,
      updatedAt: iso(c.updatedAt),
    };
  }
}
