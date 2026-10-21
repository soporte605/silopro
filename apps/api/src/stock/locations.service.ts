import { Inject, Injectable } from '@nestjs/common';
import { generateShortCode, type Location, type locationInputSchema } from '@silopro/contracts';
import {
  checkPlacement,
  type LocationKind,
  type LocationNodeRef,
  locationPath,
} from '@silopro/domain';
import { asc, isNull, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { OrgContext } from '../auth/request-context.js';
import { invalid } from '../common/http.js';
import { DbService, type Tx } from '../db/db.service.js';
import { locations } from '../db/schema.js';

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
};

/**
 * Árbol de ubicaciones (versión mínima de Fase 2, necesaria para registrar
 * existencias). El editor de almacenes y gabinetes llega en la Fase 3.
 */
@Injectable()
export class LocationsService {
  constructor(@Inject(DbService) private readonly dbs: DbService) {}

  list(ctx: OrgContext): Promise<Location[]> {
    return this.dbs.tenant(ctx, (tx) =>
      tx
        .select(columns)
        .from(locations)
        .where(isNull(locations.archivedAt))
        .orderBy(asc(locations.path)),
    );
  }

  async create(ctx: OrgContext, input: z.output<typeof locationInputSchema>): Promise<Location> {
    return this.dbs.tenant(ctx, async (tx) => {
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
        .returning(columns);
      return row!;
    });
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
