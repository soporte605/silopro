import type { INestApplication } from '@nestjs/common';
import type { Location, Movement, Reservation, StockByLocation } from '@silopro/contracts';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, db, pieceUnitId, type Session, signUp, TEST_DB } from './helpers.js';

describe.skipIf(!TEST_DB)('reservas y consumos', () => {
  let app: INestApplication;
  let s: Session;
  let unitId: string;
  let a: Location;
  let b: Location;

  beforeAll(async () => {
    app = await createApp();
    s = await signUp(app, 'Reservas');
    unitId = await pieceUnitId(s);
    const w: Location = (
      await s
        .post('/locations')
        .send({ kind: 'warehouse', code: 'ALM', name: 'Almacén' })
        .expect(201)
    ).body;
    a = (
      await s
        .post('/locations')
        .send({ kind: 'bin', code: 'A', name: 'A', parentId: w.id })
        .expect(201)
    ).body;
    b = (
      await s
        .post('/locations')
        .send({ kind: 'bin', code: 'B', name: 'B', parentId: w.id })
        .expect(201)
    ).body;
  });
  afterAll(async () => app?.close());

  const item = async (sku: string, inA = 10): Promise<string> => {
    const id = (await s.post('/items').send({ sku, name: sku, unitId }).expect(201)).body.id;
    await s
      .post('/movements')
      .send({ kind: 'receipt', itemId: id, locationId: a.id, quantity: inA })
      .expect(201);
    return id;
  };
  const levelA = async (itemId: string) => {
    const rows: StockByLocation[] = (await s.get(`/items/${itemId}/stock`).expect(200)).body;
    return rows.find((r) => r.locationId === a.id)!;
  };
  const reserve = (itemId: string, quantity: number, purpose = 'Robot seguidor') =>
    s.post('/reservations').send({ itemId, locationId: a.id, quantity, purpose });

  it('aparta existencias: no se pueden sacar ni mover, y se ven como reservadas', async () => {
    const id = await item('RS-1');
    const r: Reservation = (await reserve(id, 6).expect(201)).body;
    expect(r).toMatchObject({
      status: 'active',
      quantity: 6,
      remaining: 6,
      purpose: 'Robot seguidor',
    });
    expect(await levelA(id)).toMatchObject({ onHand: 10, reserved: 6, available: 4 });

    // Solo hay 4 disponibles.
    expect((await reserve(id, 5)).status).toBe(422);
    await s
      .post('/movements')
      .send({ kind: 'issue', itemId: id, locationId: a.id, quantity: 5 })
      .expect(422);
    await s
      .post('/transfers')
      .send({ itemId: id, fromLocationId: a.id, toLocationId: b.id, quantity: 5 })
      .expect(422);
    await s
      .post('/transfers')
      .send({ itemId: id, fromLocationId: a.id, toLocationId: b.id, quantity: 4 })
      .expect(201);
    expect(await levelA(id)).toMatchObject({ onHand: 6, reserved: 6, available: 0 });

    const active: Reservation[] = (
      await s.get(`/reservations?status=active&itemId=${id}`).expect(200)
    ).body;
    expect(active.map((x) => x.id)).toEqual([r.id]);
    await s.get('/reservations?status=otra').expect(422);
  });

  it('consume en partes y cierra la reserva al terminar', async () => {
    const id = await item('RS-2');
    const r: Reservation = (await reserve(id, 6, 'Pedido 42').expect(201)).body;
    const part: Reservation = (
      await s
        .post(`/reservations/${r.id}/consume`)
        .send({ quantity: 2, reason: 'Primer lote' })
        .expect(200)
    ).body;
    expect(part).toMatchObject({ status: 'active', consumed: 2, remaining: 4 });
    expect(await levelA(id)).toMatchObject({ onHand: 8, reserved: 4 });

    expect((await s.post(`/reservations/${r.id}/consume`).send({ quantity: 5 })).status).toBe(422);
    const done: Reservation = (await s.post(`/reservations/${r.id}/consume`).send({}).expect(200))
      .body;
    expect(done).toMatchObject({ status: 'consumed', consumed: 6, remaining: 0 });
    expect(done.closedAt).not.toBeNull();
    expect(await levelA(id)).toMatchObject({ onHand: 4, reserved: 0, available: 4 });

    const history: Movement[] = (await s.get(`/items/${id}/movements`).expect(200)).body;
    const consumptions = history.filter((m) => m.kind === 'consumption');
    expect(consumptions.map((m) => m.delta).sort((x, y) => x - y)).toEqual([-4, -2]);
    expect(consumptions.every((m) => m.reservationId === r.id)).toBe(true);
    expect(consumptions.map((m) => m.reason)).toContain('Pedido 42 · Primer lote');
    await s.post(`/reservations/${r.id}/release`).expect(422);
  });

  it('liberar devuelve lo apartado a disponible', async () => {
    const id = await item('RS-3');
    const r: Reservation = (await reserve(id, 3).expect(201)).body;
    await s.post(`/reservations/${r.id}/consume`).send({ quantity: 1 }).expect(200);
    const released: Reservation = (await s.post(`/reservations/${r.id}/release`).expect(200)).body;
    expect(released).toMatchObject({ status: 'released', consumed: 1, remaining: 0 });
    expect(await levelA(id)).toMatchObject({ onHand: 9, reserved: 0, available: 9 });
  });

  it('reservas simultáneas no apartan más de lo disponible', async () => {
    const id = await item('RS-4', 5);
    const results = await Promise.all(Array.from({ length: 10 }, () => reserve(id, 1)));
    expect(results.filter((r) => r.status === 201)).toHaveLength(5);
    expect(results.filter((r) => r.status === 422)).toHaveLength(5);
    expect(await levelA(id)).toMatchObject({ reserved: 5, available: 0 });
  });

  it('aísla por organización con RLS forzada', async () => {
    const id = await item('RS-5');
    const r: Reservation = (await reserve(id, 1).expect(201)).body;
    const other = await signUp(app, 'Ajena reservas');
    expect((await other.get('/reservations').expect(200)).body).toEqual([]);
    await other.post(`/reservations/${r.id}/release`).expect(404);
    const res = await db(app).db.execute<{ forced: boolean }>(
      sql`select relforcerowsecurity as forced from pg_class where relname = 'reservations'`,
    );
    expect(res.rows[0]?.forced).toBe(true);
  });
});
