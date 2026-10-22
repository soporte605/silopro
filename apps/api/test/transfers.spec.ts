import type { INestApplication } from '@nestjs/common';
import type {
  Location,
  Movement,
  StockByLocation,
  Transfer,
  TransferSummary,
} from '@silopro/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, pieceUnitId, type Session, signUp, TEST_DB } from './helpers.js';

describe.skipIf(!TEST_DB)('transferencias entre ubicaciones', () => {
  let app: INestApplication;
  let s: Session;
  let unitId: string;
  let a: Location;
  let b: Location;

  beforeAll(async () => {
    app = await createApp();
    s = await signUp(app, 'Transferencias');
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
    if (inA) {
      await s
        .post('/movements')
        .send({ kind: 'receipt', itemId: id, locationId: a.id, quantity: inA })
        .expect(201);
    }
    return id;
  };
  const stock = async (itemId: string) => {
    const rows: StockByLocation[] = (await s.get(`/items/${itemId}/stock`).expect(200)).body;
    return Object.fromEntries(rows.map((r) => [r.locationPath, r.onHand]));
  };

  it('mueve existencias y registra salida y entrada unidas', async () => {
    const id = await item('TR-1');
    const t: Transfer = (
      await s
        .post('/transfers')
        .send({
          itemId: id,
          fromLocationId: a.id,
          toLocationId: b.id,
          quantity: 4,
          reason: 'Reordenar',
        })
        .expect(201)
    ).body;
    expect(t.out).toMatchObject({
      kind: 'transfer',
      delta: -4,
      locationPath: 'ALM / A',
      transferId: t.id,
    });
    expect(t.in).toMatchObject({
      kind: 'transfer',
      delta: 4,
      locationPath: 'ALM / B',
      transferId: t.id,
    });
    expect(await stock(id)).toEqual({ 'ALM / A': 6, 'ALM / B': 4 });
    // El total del artículo no cambia.
    expect((await s.get(`/items/${id}`).expect(200)).body.onHand).toBe(10);
    const history: Movement[] = (await s.get(`/items/${id}/movements`).expect(200)).body;
    expect(history.filter((m) => m.transferId === t.id)).toHaveLength(2);
    const list: TransferSummary[] = (await s.get(`/transfers?itemId=${id}`).expect(200)).body;
    expect(list).toEqual([
      expect.objectContaining({
        id: t.id,
        sku: 'TR-1',
        quantity: 4,
        fromPath: 'ALM / A',
        toPath: 'ALM / B',
        reason: 'Reordenar',
      }),
    ]);
    await s.get('/transfers?itemId=x').expect(422);
  });

  it('es atómica: si no alcanza o el destino está lleno, no cambia nada', async () => {
    const id = await item('TR-2', 3);
    const short = await s
      .post('/transfers')
      .send({ itemId: id, fromLocationId: a.id, toLocationId: b.id, quantity: 5 });
    expect(short.status).toBe(422);
    expect(await stock(id)).toEqual({ 'ALM / A': 3 });

    await s
      .post('/transfers')
      .send({ itemId: id, fromLocationId: a.id, toLocationId: a.id, quantity: 1 })
      .expect(400);

    // Destino con capacidad 1 ocupado por otro artículo.
    const capped: Location = (
      await s
        .patch(`/locations/${b.id}`)
        .send({ code: 'B', name: 'B', parentId: b.parentId, version: b.version, maxItems: 1 })
        .expect(200)
    ).body;
    const full = await s
      .post('/transfers')
      .send({ itemId: id, fromLocationId: a.id, toLocationId: b.id, quantity: 1 });
    expect(full.status).toBe(422);
    expect(full.body.details).toMatchObject({ code: 'CAPACITY_EXCEEDED' });
    expect(await stock(id)).toEqual({ 'ALM / A': 3 });
    b = (
      await s
        .patch(`/locations/${b.id}`)
        .send({
          code: 'B',
          name: 'B',
          parentId: b.parentId,
          version: capped.version,
          maxItems: null,
        })
        .expect(200)
    ).body;
  });

  it('transferencias simultáneas en ambos sentidos no se bloquean ni pierden existencias', async () => {
    const id = await item('TR-3', 20);
    await s
      .post('/transfers')
      .send({ itemId: id, fromLocationId: a.id, toLocationId: b.id, quantity: 10 })
      .expect(201);
    const results = await Promise.all(
      Array.from({ length: 16 }, (_, i) =>
        s.post('/transfers').send({
          itemId: id,
          fromLocationId: i % 2 ? a.id : b.id,
          toLocationId: i % 2 ? b.id : a.id,
          quantity: 1,
        }),
      ),
    );
    expect(results.map((r) => r.status).every((st) => st === 201)).toBe(true);
    expect(await stock(id)).toEqual({ 'ALM / A': 10, 'ALM / B': 10 });
  });

  it('otra organización no ve los artículos ni las ubicaciones', async () => {
    const other = await signUp(app, 'Ajena');
    await other
      .post('/transfers')
      .send({ itemId: a.id, fromLocationId: a.id, toLocationId: b.id, quantity: 1 })
      .expect(404);
  });
});
