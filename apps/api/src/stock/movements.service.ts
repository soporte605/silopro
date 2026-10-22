import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type {
  Movement,
  movementInputSchema,
  StockByLocation,
  Transfer,
  transferInputSchema,
  TransferSummary,
} from '@silopro/contracts';
import {
  applyDelta,
  can,
  exceedsCapacity,
  fromScaled,
  StockError,
  toScaled,
} from '@silopro/domain';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import type { z } from 'zod';
import type { OrgContext } from '../auth/request-context.js';
import { invalid, notFound } from '../common/http.js';
import { DbService, type Tx } from '../db/db.service.js';
import { iso, num0 } from '../db/mappers.js';
import { cabinets, items, locations, stockLevels, stockMovements, users } from '../db/schema.js';

type MovementData = z.output<typeof movementInputSchema>;
type TransferData = z.output<typeof transferInputSchema>;
export type Loc = { id: string; path: string; maxItems: number | null };

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
      const item = await this.item(tx, input.itemId);
      const loc = await this.location(tx, input.locationId);
      return this.applyInTx(tx, ctx, {
        kind: input.kind,
        itemId: item.id,
        loc,
        delta: (current) =>
          input.kind === 'receipt'
            ? toScaled(input.quantity)
            : input.kind === 'issue'
              ? -toScaled(input.quantity)
              : toScaled(input.countedQuantity) - current.onHand,
        reason: input.reason ?? null,
        transferId: null,
      });
    });
  }

  /**
   * Transferencia: salida del origen y entrada al destino en la misma
   * transacción, unidas por `transferId`. Se bloquea primero la ubicación de
   * destino (si tiene capacidad) y luego las dos existencias en orden de id,
   * el mismo orden para cualquier transferencia concurrente: sin interbloqueos.
   */
  transfer(ctx: OrgContext, input: TransferData): Promise<Transfer> {
    return this.dbs.tenant(ctx, async (tx) => {
      const item = await this.item(tx, input.itemId);
      const from = await this.location(tx, input.fromLocationId);
      const to = await this.location(tx, input.toLocationId);
      if (to.maxItems !== null) {
        await tx
          .select({ id: locations.id })
          .from(locations)
          .where(eq(locations.id, to.id))
          .for('update');
      }
      for (const locationId of [from.id, to.id].sort()) {
        await this.lockLevel(tx, ctx, item.id, locationId);
      }
      const transferId = uuidv7();
      const quantity = toScaled(input.quantity);
      const reason = input.reason ?? null;
      const out = await this.applyInTx(tx, ctx, {
        kind: 'transfer',
        itemId: item.id,
        loc: from,
        delta: () => -quantity,
        reason,
        transferId,
      });
      const inn = await this.applyInTx(tx, ctx, {
        kind: 'transfer',
        itemId: item.id,
        loc: to,
        delta: () => quantity,
        reason,
        transferId,
      });
      return { id: transferId, out, in: inn };
    });
  }

  /** Últimas transferencias (salida y entrada unidas), opcionalmente de un artículo. */
  transfers(ctx: OrgContext, itemId?: string, limit = 50): Promise<TransferSummary[]> {
    return this.dbs.tenant(ctx, async (tx) => {
      const res = await tx.execute<{
        transfer_id: string;
        item_id: string;
        sku: string;
        name: string;
        symbol: string;
        quantity: string;
        from_id: string;
        from_path: string;
        to_id: string;
        to_path: string;
        reason: string | null;
        actor: string;
        occurred_at: Date | string;
      }>(sql`
        select o.transfer_id, i.id as item_id, i.sku, i.name, u.symbol, i2.delta as quantity,
          o.location_id as from_id, lo.path as from_path,
          i2.location_id as to_id, li.path as to_path,
          o.reason, us.name as actor, o.occurred_at
        from ${stockMovements} o
        join ${stockMovements} i2 on i2.transfer_id = o.transfer_id and i2.delta > 0
        join ${items} i on i.id = o.item_id
        join units u on u.id = i.unit_id
        join ${locations} lo on lo.id = o.location_id
        join ${locations} li on li.id = i2.location_id
        join ${users} us on us.id = o.actor_id
        where o.transfer_id is not null and o.delta < 0
          ${itemId ? sql`and o.item_id = ${itemId}` : sql``}
        order by o.occurred_at desc, o.id desc
        limit ${limit}`);
      return res.rows.map((r) => ({
        id: r.transfer_id,
        itemId: r.item_id,
        sku: r.sku,
        itemName: r.name,
        unitSymbol: r.symbol,
        quantity: num0(r.quantity),
        fromLocationId: r.from_id,
        fromPath: r.from_path,
        toLocationId: r.to_id,
        toPath: r.to_path,
        reason: r.reason,
        actorName: r.actor,
        occurredAt: iso(r.occurred_at),
      }));
    });
  }

  async item(tx: Tx, id: string): Promise<{ id: string }> {
    const [item] = await tx
      .select({ id: items.id })
      .from(items)
      .where(and(eq(items.id, id), isNull(items.archivedAt)));
    if (!item) throw notFound('Artículo');
    return item;
  }

  async location(tx: Tx, id: string): Promise<Loc> {
    const [loc] = await tx
      .select({ id: locations.id, path: locations.path, maxItems: locations.maxItems })
      .from(locations)
      .where(and(eq(locations.id, id), isNull(locations.archivedAt)));
    if (!loc) throw notFound('Ubicación');
    return loc;
  }

  /** Crea si hace falta y bloquea la fila de existencias (artículo × ubicación). */
  async lockLevel(tx: Tx, ctx: OrgContext, itemId: string, locationId: string) {
    await tx
      .insert(stockLevels)
      .values({ organizationId: ctx.organizationId, itemId, locationId })
      .onConflictDoNothing();
    const [level] = await tx
      .select()
      .from(stockLevels)
      .where(and(eq(stockLevels.itemId, itemId), eq(stockLevels.locationId, locationId)))
      .for('update');
    return level!;
  }

  /**
   * Aplica un cambio a una existencia con todas las reglas y registra el
   * movimiento, dentro de una transacción ya abierta (también la usan las reservas).
   */
  async applyInTx(
    tx: Tx,
    ctx: OrgContext,
    p: {
      kind: Movement['kind'];
      itemId: string;
      loc: Loc;
      delta: (current: { onHand: number; reserved: number }) => number;
      reason: string | null;
      transferId: string | null;
      reservationId?: string | null;
    },
  ): Promise<Movement> {
    const { loc, itemId } = p;
    const capped = loc.maxItems !== null && p.kind !== 'issue';
    // Con capacidad, se bloquea la ubicación antes que la existencia para que
    // dos entradas de artículos distintos no la rebasen a la vez.
    if (capped) {
      await tx
        .select({ id: locations.id })
        .from(locations)
        .where(eq(locations.id, loc.id))
        .for('update');
    }
    const level = await this.lockLevel(tx, ctx, itemId, loc.id);
    const current = {
      onHand: toScaled(num0(level.onHand)),
      reserved: toScaled(num0(level.reserved)),
    };
    const delta = p.delta(current);
    if (delta === 0) throw invalid('El movimiento no cambia las existencias');

    if (capped && delta > 0) {
      const [{ distinct } = { distinct: 0 }] = await tx
        .select({ distinct: sql<number>`count(*)::int` })
        .from(stockLevels)
        .where(
          and(
            eq(stockLevels.locationId, loc.id),
            sql`${stockLevels.itemId} <> ${itemId}`,
            sql`${stockLevels.onHand} <> 0`,
          ),
        );
      const full = exceedsCapacity({
        maxItems: loc.maxItems,
        distinctItems: distinct,
        itemAlreadyThere: current.onHand !== 0,
      });
      if (full) {
        throw invalid(
          `${loc.path} ya tiene ${distinct} de ${loc.maxItems} artículos distintos. Elija otra ubicación o amplíe su capacidad.`,
          { code: 'CAPACITY_EXCEEDED', maxItems: loc.maxItems, distinctItems: distinct },
        );
      }
    }

    let next;
    try {
      next = applyDelta(current, delta, { allowNegative: level.allowNegative });
    } catch (e) {
      if (e instanceof StockError) throw invalid(`${loc.path}: ${e.message}`, { code: e.code });
      throw e;
    }

    await tx
      .update(stockLevels)
      .set({ onHand: String(fromScaled(next.onHand)), updatedAt: new Date() })
      .where(and(eq(stockLevels.itemId, itemId), eq(stockLevels.locationId, loc.id)));
    const [mov] = await tx
      .insert(stockMovements)
      .values({
        organizationId: ctx.organizationId,
        kind: p.kind,
        itemId,
        locationId: loc.id,
        delta: String(fromScaled(delta)),
        reason: p.reason,
        transferId: p.transferId,
        reservationId: p.reservationId ?? null,
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
      itemId,
      locationId: loc.id,
      locationPath: loc.path,
      delta: fromScaled(delta),
      reason: mov!.reason,
      transferId: mov!.transferId,
      reservationId: mov!.reservationId,
      actorName: actor?.name ?? '',
      occurredAt: iso(mov!.occurredAt),
    };
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
        transferId: r.m.transferId,
        reservationId: r.m.reservationId,
        actorName: r.actorName,
        occurredAt: iso(r.m.occurredAt),
      }));
    });
  }

  byLocation(ctx: OrgContext, itemId: string): Promise<StockByLocation[]> {
    return this.dbs.tenant(ctx, async (tx) => {
      const rows = await tx
        .select({ s: stockLevels, path: locations.path, cabinetId: cabinets.id })
        .from(stockLevels)
        .innerJoin(locations, eq(locations.id, stockLevels.locationId))
        .leftJoin(cabinets, eq(cabinets.locationId, locations.parentId))
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
          cabinetId: r.cabinetId,
          onHand,
          reserved,
          available: onHand - reserved,
        };
      });
    });
  }
}
