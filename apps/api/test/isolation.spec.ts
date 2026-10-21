import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { categories, items, memberships } from '../src/db/schema.js';
import { createApp, db, pieceUnitId, type Session, signUp, TEST_DB } from './helpers.js';

/**
 * Aislamiento entre organizaciones (ADR-0011). Cada prueba intenta que la
 * organización B lea o modifique datos de la organización A por una vía
 * distinta: ruta, identificador, referencia o consulta directa.
 */
describe.skipIf(!TEST_DB)('aislamiento entre organizaciones', () => {
  let app: INestApplication;
  let a: Session;
  let b: Session;
  let itemA: { id: string };
  let categoryA: { id: string };
  let unitA: string;

  beforeAll(async () => {
    app = await createApp();
    a = await signUp(app, 'Ana');
    b = await signUp(app, 'Beto');
    unitA = await pieceUnitId(a);
    categoryA = (await a.post('/categories').send({ name: 'Resistencias' }).expect(201)).body;
    itemA = (
      await a
        .post('/items')
        .send({ sku: 'RES-10K', name: 'Resistencia 10k', unitId: unitA, categoryId: categoryA.id })
        .expect(201)
    ).body;
  });
  afterAll(async () => app?.close());

  it('B no puede acceder a la organización de A por la ruta (404, no 403)', async () => {
    await b.agent.get(`/api/orgs/${a.orgId}/items`).expect(404);
    await b.agent.get(`/api/orgs/${a.orgId}/items/${itemA.id}`).expect(404);
    await b.agent
      .post(`/api/orgs/${a.orgId}/items`)
      .set('X-SiloPro-Request', '1')
      .send({})
      .expect(404);
  });

  it('B no ve el artículo de A aunque use su id en su propia organización', async () => {
    await b.get(`/items/${itemA.id}`).expect(404);
    const list = await b.get('/items').expect(200);
    expect(list.body.total).toBe(0);
    await b
      .patch(`/items/${itemA.id}`)
      .send({ sku: 'X', name: 'X', unitId: unitA, version: 1 })
      .expect(404);
    await b.del(`/items/${itemA.id}`).expect(404);
  });

  it('B no puede referenciar la categoría ni la unidad de A', async () => {
    const unitB = await pieceUnitId(b);
    const withCategory = await b
      .post('/items')
      .send({ sku: 'X1', name: 'X', unitId: unitB, categoryId: categoryA.id });
    expect(withCategory.status).toBe(422);
    const withUnit = await b.post('/items').send({ sku: 'X2', name: 'X', unitId: unitA });
    expect(withUnit.status).toBe(422);
  });

  it('B no puede registrar movimientos sobre artículos de A', async () => {
    const loc = (
      await b
        .post('/locations')
        .send({ kind: 'warehouse', code: 'ALM', name: 'Almacén' })
        .expect(201)
    ).body;
    await b
      .post('/movements')
      .send({ kind: 'receipt', itemId: itemA.id, locationId: loc.id, quantity: 5 })
      .expect(404);
  });

  it('RLS: una consulta directa con el contexto de B no devuelve filas de A', async () => {
    const rows = await db(app).tenant({ userId: b.userId, organizationId: b.orgId }, (tx) =>
      tx.select().from(items).where(eq(items.id, itemA.id)),
    );
    expect(rows).toHaveLength(0);
  });

  it('RLS: sin contexto de organización no se ve nada', async () => {
    const rows = await db(app).tenant({ userId: b.userId, organizationId: null }, (tx) =>
      tx.select().from(categories),
    );
    expect(rows).toHaveLength(0);
  });

  it('RLS: B no puede insertar filas en la organización de A', async () => {
    await expect(
      db(app).tenant({ userId: b.userId, organizationId: b.orgId }, (tx) =>
        tx.insert(categories).values({ organizationId: a.orgId, name: 'Intrusa' }),
      ),
    ).rejects.toThrow();
  });

  it('roles: un miembro de consulta lee pero no escribe; un operador mueve pero no ajusta', async () => {
    const viewer = await signUp(app, 'Vera');
    const operator = await signUp(app, 'Omar');
    await db(app).tenant({ userId: a.userId, organizationId: a.orgId }, (tx) =>
      tx.insert(memberships).values([
        { organizationId: a.orgId, userId: viewer.userId, role: 'viewer' },
        { organizationId: a.orgId, userId: operator.userId, role: 'operator' },
      ]),
    );
    const base = `/api/orgs/${a.orgId}`;
    await viewer.agent.get(`${base}/items`).expect(200);
    const denied = await viewer.agent
      .post(`${base}/categories`)
      .set('X-SiloPro-Request', '1')
      .send({ name: 'Nueva' });
    expect(denied.status).toBe(403);

    const loc = (
      await a
        .post('/locations')
        .send({ kind: 'warehouse', code: 'ALM-A', name: 'Almacén A' })
        .expect(201)
    ).body;
    const op = (body: object) =>
      operator.agent.post(`${base}/movements`).set('X-SiloPro-Request', '1').send(body);
    expect(
      (await op({ kind: 'receipt', itemId: itemA.id, locationId: loc.id, quantity: 3 })).status,
    ).toBe(201);
    expect(
      (
        await op({
          kind: 'adjustment',
          itemId: itemA.id,
          locationId: loc.id,
          countedQuantity: 1,
          reason: 'conteo',
        })
      ).status,
    ).toBe(403);
  });
});
