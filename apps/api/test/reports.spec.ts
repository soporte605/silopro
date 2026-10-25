import type { INestApplication } from '@nestjs/common';
import type { Location, MovementReport, StaleReport, ValuationReport } from '@silopro/contracts';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, pieceUnitId, type Session, signUp, TEST_DB } from './helpers.js';

const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

describe.skipIf(!TEST_DB)('reportes', () => {
  let app: INestApplication;
  let s: Session;
  let unitId: string;
  let a: Location;
  let b: Location;

  beforeAll(async () => {
    app = await createApp();
    s = await signUp(app, 'Reportes');
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

  const item = async (sku: string, extra: object = {}): Promise<string> =>
    (
      await s
        .post('/items')
        .send({ sku, name: sku, unitId, ...extra })
        .expect(201)
    ).body.id;
  const receive = (itemId: string, quantity: number, locationId = a.id) =>
    s.post('/movements').send({ kind: 'receipt', itemId, locationId, quantity }).expect(201);

  it('valora el inventario por artículo y por categoría', async () => {
    const cat = (await s.post('/categories').send({ name: 'Tornillería' }).expect(201)).body;
    const tornillo = await item('VAL-T', { cost: 0.5, categoryId: cat.id });
    const motor = await item('VAL-M', { cost: 120 });
    const cinta = await item('VAL-C');
    await receive(tornillo, 100);
    await receive(motor, 2, b.id);
    await receive(motor, 1);
    await receive(cinta, 4);

    const r: ValuationReport = (await s.get('/reports/valuation').expect(200)).body;
    expect(r.rows.map((x) => [x.sku, x.onHand, x.value])).toEqual([
      ['VAL-M', 3, 360],
      ['VAL-T', 100, 50],
      ['VAL-C', 4, null],
    ]);
    expect(r.totalValue).toBe(410);
    expect(r.missingCost).toBe(1);
    expect(r.byCategory).toEqual([
      { categoryName: null, itemCount: 2, value: 360, missingCost: 1 },
      { categoryName: 'Tornillería', itemCount: 1, value: 50, missingCost: 0 },
    ]);

    const csv = await s.get('/reports/valuation/export').expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('VAL-T,VAL-T,Tornillería,100,pza,0,0.5,50');
  });

  it('resume entradas, salidas, ajustes y transferencias del periodo', async () => {
    const id = await item('MOV-1');
    await receive(id, 10);
    await s
      .post('/movements')
      .send({ kind: 'issue', itemId: id, locationId: a.id, quantity: 3 })
      .expect(201);
    await s
      .post('/movements')
      .send({
        kind: 'adjustment',
        itemId: id,
        locationId: a.id,
        countedQuantity: 8,
        reason: 'Conteo',
      })
      .expect(201);
    await s
      .post('/transfers')
      .send({ itemId: id, fromLocationId: a.id, toLocationId: b.id, quantity: 2 })
      .expect(201);

    const q = { from: day(-1), to: day(1), tz: 'America/Mexico_City' };
    const r: MovementReport = (await s.get('/reports/movements').query(q).expect(200)).body;
    expect(r.rows.find((x) => x.sku === 'MOV-1')).toMatchObject({
      received: 10,
      issued: 3,
      adjusted: 1,
      transferred: 2,
      net: 8,
      movements: 4,
    });
    expect(r.totals.received).toBeGreaterThanOrEqual(10);

    const before: MovementReport = (
      await s
        .get('/reports/movements')
        .query({ from: day(-30), to: day(-2) })
        .expect(200)
    ).body;
    expect(before.rows).toEqual([]);

    await s
      .get('/reports/movements')
      .query({ from: day(1), to: day(-1) })
      .expect(400);
    const csv = await s.get('/reports/movements/export').query(q).expect(200);
    expect(csv.headers['content-disposition']).toContain(`movimientos-${q.from}-a-${q.to}.csv`);
    expect(csv.text).toContain('MOV-1,MOV-1,pza,10,3,1,8,2,4,');
  });

  it('lista lo que tiene existencia y no se mueve desde hace N días', async () => {
    const viejo = await item('OLD-1', { cost: 10 });
    await item('NEW-1');
    await receive(await item('NEW-2'), 1);
    // Existencia recibida hace 200 días (los movimientos no se pueden editar).
    const pool = new pg.Pool({ connectionString: TEST_DB, max: 1 });
    const c = await pool.connect();
    try {
      await c.query('begin');
      await c.query(`select set_config('app.organization_id', $1, true)`, [s.orgId]);
      await c.query(
        `insert into stock_movements (id, organization_id, kind, item_id, location_id, delta, actor_id, occurred_at)
         values (gen_random_uuid(), $1, 'receipt', $2, $3, 5, $4, now() - interval '200 days')`,
        [s.orgId, viejo, a.id, s.userId],
      );
      await c.query(
        `insert into stock_levels (organization_id, item_id, location_id, on_hand) values ($1, $2, $3, 5)`,
        [s.orgId, viejo, a.id],
      );
      await c.query('commit');
    } finally {
      c.release();
      await pool.end();
    }

    const r: StaleReport = (await s.get('/reports/stale').query({ days: 90 }).expect(200)).body;
    expect(r.rows.map((x) => [x.sku, x.onHand, x.value])).toEqual([['OLD-1', 5, 50]]);
    expect(r.totalValue).toBe(50);
    expect(r.rows[0]!.lastMovementAt).not.toBeNull();

    const longer: StaleReport = (await s.get('/reports/stale').query({ days: 365 }).expect(200))
      .body;
    expect(longer.rows).toEqual([]);
    await s.get('/reports/stale').query({ days: 0 }).expect(400);
  });
});
