import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { Movement, movementInputSchema, StockByLocation } from '@silopro/contracts';
import { applyDelta, can, fromScaled, StockError, toScaled } from '@silopro/domain';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { OrgContext } from '../auth/request-context.js';
import { invalid, notFound } from '../common/http.js';
import { DbService } from '../db/db.service.js';
import { iso, num0 } from '../db/mappers.js';
import { items, locations, stockLevels, stockMovements, users } from '../db/schema.js';

type MovementData = z.output<typeof movementInputSchema>;

/**
 * Movimientos de existencias. Cada movimiento:
 *  1. bloquea la fila de existencias (item × ubicación) con SELECT … FOR UPDATE,
 *  2. aplica las reglas de `@silopro/domain` (sin negativos ni consumo de reservas),
 *  3. actualiza `stock_levels` e inserta el movimiento inmutable,
 * todo en la misma transacción. Dos salidas simultáneas se serializan en el
 * paso 1, por lo que no pueden dejar saldo negativo.
 */
@Injectable()
export class MovementsService {
  constructor(@Inject(DbService) private readonly dbs: DbService) {}

  async record(ctx: OrgContext, input: MovementData): Promise<Movement> {
    if (input.kind === 'adjustment' && !can(ctx.role, 'stock.adjust')) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Su rol no permite ajustes de inventario',
      });
    }
    return this.dbs.tenant(ctx, async (tx) => {
      const [item] = await tx
        .select({ id: items.id })
        .from(items)
        .where(and(eq(items.id, input.itemId), isNull(items.archivedAt)));
      if (!item) throw notFound('Artículo');
      const [loc] = await tx
        .select({ id: locations.id, path: locations.path })
        .from(locations)
        .where(and(eq(locations.id, input.locationId), isNull(locations.archivedAt)));
      if (!loc) throw notFound('Ubicación');

      await tx
        .insert(stockLevels)
        .values({ organizationId: ctx.organizationId, itemId: item.id, locationId: loc.id })
        .onConflictDoNothing();
      const [level] = await tx
        .select()
        .from(stockLevels)
        .where(and(eq(stockLevels.itemId, item.id), eq(stockLevels.locationId, loc.id)))
        .for('update');

      const current = {
        onHand: toScaled(num0(level!.onHand)),
        reserved: toScaled(num0(level!.reserved)),
      };
      let delta: number;
      if (input.kind === 'receipt') delta = toScaled(input.quantity);
      else if (input.kind === 'issue') delta = -toScaled(input.quantity);
      else delta = toScaled(input.countedQuantity) - current.onHand;
      if (delta === 0) throw invalid('El movimiento no cambia las existencias');

      let next;
      try {
        next = applyDelta(current, delta, { allowNegative: level!.allowNegative });
      } catch (e) {
        if (e instanceof StockError) throw invalid(e.message, { code: e.code });
        throw e;
      }

      await tx
        .update(stockLevels)
        .set({ onHand: String(fromScaled(next.onHand)), updatedAt: new Date() })
        .where(and(eq(stockLevels.itemId, item.id), eq(stockLevels.locationId, loc.id)));
      const [mov] = await tx
        .insert(stockMovements)
        .values({
          organizationId: ctx.organizationId,
          kind: input.kind,
          itemId: item.id,
          locationId: loc.id,
          delta: String(fromScaled(delta)),
          reason: input.reason ?? null,
          actorId: ctx.userId,
        })
        .returning();
      const [actor] = await tx
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, ctx.userId));
      return {
        id: mov!.id,
        kind: mov!.kind,
        itemId: item.id,
        locationId: loc.id,
        locationPath: loc.path,
        delta: fromScaled(delta),
        reason: mov!.reason,
        actorName: actor?.name ?? '',
        occurredAt: iso(mov!.occurredAt),
      };
    });
  }

  history(ctx: OrgContext, itemId: string, limit = 50): Promise<Movement[]> {
    return this.dbs.tenant(ctx, async (tx) => {
      const rows = await tx
        .select({ m: stockMovements, path: locations.path, actorName: users.name })
        .from(stockMovements)
        .innerJoin(locations, eq(locations.id, stockMovements.locationId))
        .innerJoin(users, eq(users.id, stockMovements.actorId))
        .where(eq(stockMovements.itemId, itemId))
        .orderBy(desc(stockMovements.occurredAt), desc(stockMovements.id))
        .limit(limit);
      return rows.map((r) => ({
        id: r.m.id,
        kind: r.m.kind,
        itemId: r.m.itemId,
        locationId: r.m.locationId,
        locationPath: r.path,
        delta: num0(r.m.delta),
        reason: r.m.reason,
        actorName: r.actorName,
        occurredAt: iso(r.m.occurredAt),
      }));
    });
  }

  byLocation(ctx: OrgContext, itemId: string): Promise<StockByLocation[]> {
    return this.dbs.tenant(ctx, async (tx) => {
      const rows = await tx
        .select({ s: stockLevels, path: locations.path })
        .from(stockLevels)
        .innerJoin(locations, eq(locations.id, stockLevels.locationId))
        .where(
          and(
            eq(stockLevels.itemId, itemId),
            sql`(${stockLevels.onHand} <> 0 or ${stockLevels.reserved} <> 0)`,
          ),
        )
        .orderBy(locations.path);
      return rows.map((r) => {
        const onHand = num0(r.s.onHand);
        const reserved = num0(r.s.reserved);
        return {
          locationId: r.s.locationId,
          locationPath: r.path,
          onHand,
          reserved,
          available: onHand - reserved,
        };
      });
    });
  }
}
