import { Inject, Injectable } from '@nestjs/common';
import type {
  Reservation,
  reservationConsumeSchema,
  reservationInputSchema,
  ReservationStatus,
} from '@silopro/contracts';
import { fromScaled, release, reserve, StockError, toScaled } from '@silopro/domain';
import { and, desc, eq, type SQL } from 'drizzle-orm';
import type { z } from 'zod';
import type { OrgContext } from '../auth/request-context.js';
import { invalid, notFound } from '../common/http.js';
import { DbService, type Tx } from '../db/db.service.js';
import { iso, num0 } from '../db/mappers.js';
import { items, locations, reservations, stockLevels, units, users } from '../db/schema.js';
import { MovementsService } from './movements.service.js';

type ReserveData = z.output<typeof reservationInputSchema>;
type ConsumeData = z.output<typeof reservationConsumeSchema>;

const asStockError = (e: unknown, path: string) =>
  e instanceof StockError ? invalid(`${path}: ${e.message}`, { code: e.code }) : e;

/**
 * Reservas: apartan existencias de una ubicación para un uso. Mientras están
 * activas, lo que queda (`quantity - consumed`) suma en `stock_levels.reserved`
 * y no se puede sacar ni mover. Consumir convierte lo apartado en una salida
 * (`consumption`); liberar lo devuelve a disponible.
 */
@Injectable()
export class ReservationsService {
  constructor(
    @Inject(DbService) private readonly dbs: DbService,
    @Inject(MovementsService) private readonly movements: MovementsService,
  ) {}

  list(
    ctx: OrgContext,
    filter: { status?: ReservationStatus; itemId?: string },
  ): Promise<Reservation[]> {
    return this.dbs.tenant(ctx, (tx) => {
      const where: SQL[] = [];
      if (filter.status) where.push(eq(reservations.status, filter.status));
      if (filter.itemId) where.push(eq(reservations.itemId, filter.itemId));
      return this.query(tx, and(...where), 200);
    });
  }

  create(ctx: OrgContext, input: ReserveData): Promise<Reservation> {
    return this.dbs.tenant(ctx, async (tx) => {
      const item = await this.movements.item(tx, input.itemId);
      const loc = await this.movements.location(tx, input.locationId);
      const level = await this.movements.lockLevel(tx, ctx, item.id, loc.id);
      let next;
      try {
        next = reserve(
          { onHand: toScaled(num0(level.onHand)), reserved: toScaled(num0(level.reserved)) },
          toScaled(input.quantity),
        );
      } catch (e) {
        throw asStockError(e, loc.path);
      }
      await this.setReserved(tx, item.id, loc.id, next.reserved);
      const [row] = await tx
        .insert(reservations)
        .values({
          organizationId: ctx.organizationId,
          itemId: item.id,
          locationId: loc.id,
          quantity: String(input.quantity),
          purpose: input.purpose,
          createdBy: ctx.userId,
        })
        .returning({ id: reservations.id });
      return this.one(tx, row!.id);
    });
  }

  /** Devuelve a disponible lo que quede apartado. */
  release(ctx: OrgContext, id: string): Promise<Reservation> {
    return this.dbs.tenant(ctx, async (tx) => {
      const r = await this.lockActive(tx, id);
      const remaining = toScaled(num0(r.quantity)) - toScaled(num0(r.consumed));
      await this.unreserve(tx, ctx, r, remaining);
      await tx
        .update(reservations)
        .set({ status: 'released', closedAt: new Date(), updatedAt: new Date() })
        .where(eq(reservations.id, id));
      return this.one(tx, id);
    });
  }

  /** Saca del inventario parte o todo lo apartado, como movimiento `consumption`. */
  consume(ctx: OrgContext, id: string, input: ConsumeData): Promise<Reservation> {
    return this.dbs.tenant(ctx, async (tx) => {
      const r = await this.lockActive(tx, id);
      const remaining = toScaled(num0(r.quantity)) - toScaled(num0(r.consumed));
      const quantity = input.quantity === undefined ? remaining : toScaled(input.quantity);
      if (quantity > remaining) {
        throw invalid(`Solo quedan ${fromScaled(remaining)} apartados en esta reserva`, {
          code: 'EXCEEDS_RESERVATION',
          remaining: fromScaled(remaining),
        });
      }
      await this.unreserve(tx, ctx, r, quantity);
      const loc = await this.movements.location(tx, r.locationId);
      await this.movements.applyInTx(tx, ctx, {
        kind: 'consumption',
        itemId: r.itemId,
        loc,
        delta: () => -quantity,
        reason: input.reason ? `${r.purpose} · ${input.reason}` : r.purpose,
        transferId: null,
        reservationId: r.id,
      });
      const done = quantity === remaining;
      await tx
        .update(reservations)
        .set({
          consumed: String(fromScaled(toScaled(num0(r.consumed)) + quantity)),
          ...(done ? { status: 'consumed' as const, closedAt: new Date() } : {}),
          updatedAt: new Date(),
        })
        .where(eq(reservations.id, id));
      return this.one(tx, id);
    });
  }

  private async lockActive(tx: Tx, id: string) {
    const [r] = await tx.select().from(reservations).where(eq(reservations.id, id)).for('update');
    if (!r) throw notFound('Reserva');
    if (r.status !== 'active') {
      throw invalid('La reserva ya está cerrada', { code: 'RESERVATION_CLOSED', status: r.status });
    }
    return r;
  }

  /** Resta `quantity` (escalada) de lo reservado en la existencia de la reserva. */
  private async unreserve(
    tx: Tx,
    ctx: OrgContext,
    r: typeof reservations.$inferSelect,
    quantity: number,
  ): Promise<void> {
    if (quantity <= 0) return;
    const level = await this.movements.lockLevel(tx, ctx, r.itemId, r.locationId);
    let next;
    try {
      next = release(
        { onHand: toScaled(num0(level.onHand)), reserved: toScaled(num0(level.reserved)) },
        quantity,
      );
    } catch (e) {
      throw asStockError(e, 'Reserva');
    }
    await this.setReserved(tx, r.itemId, r.locationId, next.reserved);
  }

  private async setReserved(tx: Tx, itemId: string, locationId: string, reserved: number) {
    await tx
      .update(stockLevels)
      .set({ reserved: String(fromScaled(reserved)), updatedAt: new Date() })
      .where(and(eq(stockLevels.itemId, itemId), eq(stockLevels.locationId, locationId)));
  }

  private async one(tx: Tx, id: string): Promise<Reservation> {
    const [r] = await this.query(tx, eq(reservations.id, id), 1);
    if (!r) throw notFound('Reserva');
    return r;
  }

  private async query(tx: Tx, where: SQL | undefined, limit: number): Promise<Reservation[]> {
    const rows = await tx
      .select({
        r: reservations,
        sku: items.sku,
        itemName: items.name,
        unitSymbol: units.symbol,
        path: locations.path,
        createdByName: users.name,
      })
      .from(reservations)
      .innerJoin(items, eq(items.id, reservations.itemId))
      .innerJoin(units, eq(units.id, items.unitId))
      .innerJoin(locations, eq(locations.id, reservations.locationId))
      .innerJoin(users, eq(users.id, reservations.createdBy))
      .where(where)
      .orderBy(desc(reservations.createdAt), desc(reservations.id))
      .limit(limit);
    return rows.map(({ r, ...x }) => {
      const quantity = num0(r.quantity);
      const consumed = num0(r.consumed);
      return {
        id: r.id,
        itemId: r.itemId,
        sku: x.sku,
        itemName: x.itemName,
        unitSymbol: x.unitSymbol,
        locationId: r.locationId,
        locationPath: x.path,
        quantity,
        consumed,
        remaining: r.status === 'active' ? fromScaled(toScaled(quantity) - toScaled(consumed)) : 0,
        status: r.status,
        purpose: r.purpose,
        createdByName: x.createdByName,
        createdAt: iso(r.createdAt),
        closedAt: r.closedAt ? iso(r.closedAt) : null,
      };
    });
  }
}
