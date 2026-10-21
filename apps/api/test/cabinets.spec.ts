import type { INestApplication } from '@nestjs/common';
import { createGridLayout, mergeCompartments, splitCompartment } from '@silopro/cabinet-engine';
import type { Cabinet } from '@silopro/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, pieceUnitId, type Session, signUp, TEST_DB, uniqueEmail } from './helpers.js';

const layoutOf = (c: Cabinet) => ({
  rows: c.rows,
  columns: c.columns,
  addressing: c.addressing,
  rowOrigin: c.rowOrigin,
  compartments: c.compartments.map(({ id, row, column, rowSpan, columnSpan, address }) => ({
    id,
    row,
    column,
    rowSpan,
    columnSpan,
    address,
  })),
});

describe.skipIf(!TEST_DB)('gabinetes', () => {
  let app: INestApplication;
  let s: Session;
  let warehouseId: string;
  let itemId: string;

  beforeAll(async () => {
    app = await createApp();
    s = await signUp(app, 'Gabinetes');
    warehouseId = (
      await s
        .post('/locations')
        .send({ kind: 'warehouse', code: 'TALLER', name: 'Taller' })
        .expect(201)
    ).body.id;
    const unitId = await pieceUnitId(s);
    itemId = (
      await s
        .post('/items')
        .send({ sku: 'ESP32', name: 'ESP32 DevKit', unitId, minStock: 5 })
        .expect(201)
    ).body.id;
  });
  afterAll(async () => app?.close());

  const create = (code: string, rows = 3, columns = 4) =>
    s
      .post('/cabinets')
      .send({ parentId: warehouseId, code, name: `Gabinete ${code}`, rows, columns });

  it('crea el gabinete con un cajón por celda, visibles como ubicaciones', async () => {
    const cab: Cabinet = (await create('GAB-1').expect(201)).body;
    expect(cab.path).toBe('TALLER / GAB-1');
    expect(cab.compartments).toHaveLength(12);
    expect(cab.compartments[0]).toMatchObject({ id: 'A1', name: 'Cajón A1', state: 'empty' });
    expect(cab.compartments.every((c) => c.locationId && c.qrCode)).toBe(true);

    const locations = (await s.get('/locations').expect(200)).body as {
      path: string;
      kind: string;
      cabinetId: string | null;
    }[];
    expect(locations.find((l) => l.path === 'TALLER / GAB-1')?.cabinetId).toBe(cab.id);
    expect(locations.filter((l) => l.kind === 'drawer')).toHaveLength(12);
    expect((await s.get('/cabinets').expect(200)).body[0]).toMatchObject({
      code: 'GAB-1',
      compartmentCount: 12,
      occupiedCount: 0,
    });
  });

  it('valida el lugar y las dimensiones', async () => {
    const root = await s
      .post('/cabinets')
      .send({ parentId: null, code: 'X', name: 'X', rows: 2, columns: 2 });
    expect(root.status).toBe(400);
    expect((await create('BIG', 61, 2)).status).toBe(400);
    expect((await create('GAB-1')).status).toBe(409);
  });

  it('registra existencias en un cajón y refleja la ocupación', async () => {
    const cab: Cabinet = (await create('GAB-2', 2, 2).expect(201)).body;
    const b2 = cab.compartments.find((c) => c.id === 'B2')!;
    await s
      .post('/movements')
      .send({ kind: 'receipt', itemId, locationId: b2.locationId, quantity: 3 })
      .expect(201);

    const after: Cabinet = (await s.get(`/cabinets/${cab.id}`).expect(200)).body;
    expect(after.compartments.find((c) => c.id === 'B2')).toMatchObject({
      itemCount: 1,
      state: 'low',
    });
    expect(after.occupiedCount).toBe(1);
    const stock = (await s.get(`/cabinets/${cab.id}/stock`).expect(200)).body;
    expect(stock).toEqual([
      expect.objectContaining({ locationId: b2.locationId, sku: 'ESP32', onHand: 3 }),
    ]);
    const byLocation = (await s.get(`/items/${itemId}/stock`).expect(200)).body;
    expect(byLocation.find((r: { locationId: string }) => r.locationId === b2.locationId)).toEqual(
      expect.objectContaining({ cabinetId: cab.id, locationPath: 'TALLER / GAB-2 / B2' }),
    );
  });

  it('fusiona y divide sincronizando cajones, sin perder existencias', async () => {
    const cab: Cabinet = (await create('GAB-3', 2, 3).expect(201)).body;
    const a2 = cab.compartments.find((c) => c.id === 'A2')!;

    // Fusionar A1+A2 archiva A2 (vacío).
    const merged = mergeCompartments(layoutOf(cab), {
      row: 0,
      column: 0,
      rowSpan: 1,
      columnSpan: 2,
    });
    const v2: Cabinet = (
      await s
        .put(`/cabinets/${cab.id}/layout`)
        .send({ version: cab.version, ...merged })
        .expect(200)
    ).body;
    expect(v2.version).toBe(cab.version + 1);
    expect(v2.compartments.find((c) => c.id === 'A1')?.columnSpan).toBe(2);
    expect(v2.compartments.some((c) => c.id === 'A2')).toBe(false);

    // Dividir restaura A2 con el mismo id de ubicación (y su historial).
    const split = splitCompartment(layoutOf(v2), 'A1');
    const v3: Cabinet = (
      await s
        .put(`/cabinets/${cab.id}/layout`)
        .send({ version: v2.version, ...split })
        .expect(200)
    ).body;
    expect(v3.compartments.find((c) => c.id === 'A2')?.locationId).toBe(a2.locationId);

    // Con existencias en A2, fusionar se rechaza.
    await s
      .post('/movements')
      .send({ kind: 'receipt', itemId, locationId: a2.locationId, quantity: 1 })
      .expect(201);
    const blocked = await s.put(`/cabinets/${cab.id}/layout`).send({
      version: v3.version,
      ...mergeCompartments(layoutOf(v3), { row: 0, column: 0, rowSpan: 1, columnSpan: 2 }),
    });
    expect(blocked.status).toBe(422);
    expect(blocked.body.details).toEqual({ code: 'COMPARTMENT_HAS_STOCK', addresses: ['A2'] });

    // Versión vieja → 409; diseño incoherente → 422.
    expect(
      (await s.put(`/cabinets/${cab.id}/layout`).send({ version: v2.version, ...split })).status,
    ).toBe(409);
    const fake = createGridLayout({ rows: 2, columns: 3 });
    fake.compartments[0] = { ...fake.compartments[0]!, id: 'Z9', address: 'Z9' };
    expect(
      (await s.put(`/cabinets/${cab.id}/layout`).send({ version: v3.version, ...fake })).status,
    ).toBe(422);
  });

  it('guarda un gabinete grande (60×40) en una sola petición', async () => {
    const cab: Cabinet = (await create('GAB-XL', 60, 40).expect(201)).body;
    expect(cab.compartments).toHaveLength(2400);
    const merged = mergeCompartments(layoutOf(cab), {
      row: 0,
      column: 0,
      rowSpan: 2,
      columnSpan: 2,
    });
    const saved: Cabinet = (
      await s
        .put(`/cabinets/${cab.id}/layout`)
        .send({ version: cab.version, ...merged })
        .expect(200)
    ).body;
    expect(saved.compartments).toHaveLength(2397);
  });

  it('redimensiona y renombra cajones', async () => {
    const cab: Cabinet = (await create('GAB-4', 2, 2).expect(201)).body;
    const grown: Cabinet = (
      await s
        .put(`/cabinets/${cab.id}/layout`)
        .send({ version: cab.version, ...createGridLayout({ rows: 3, columns: 2 }) })
        .expect(200)
    ).body;
    expect(grown.compartments).toHaveLength(6);
    const renamed: Cabinet = (
      await s
        .patch(`/cabinets/${cab.id}/compartments/C2`)
        .send({ name: 'Tornillos M3' })
        .expect(200)
    ).body;
    expect(renamed.compartments.find((c) => c.id === 'C2')?.name).toBe('Tornillos M3');
    await s.patch(`/cabinets/${cab.id}/compartments/Z9`).send({ name: 'x' }).expect(404);
  });

  it('aísla los gabinetes por organización y respeta el rol', async () => {
    const cab: Cabinet = (await create('GAB-5', 1, 1).expect(201)).body;
    const other = await signUp(app, 'Ajeno');
    await other.get(`/api/orgs/${s.orgId}/cabinets/${cab.id}`).expect(404);
    await other.get(`/cabinets/${cab.id}`).expect(404);

    const email = uniqueEmail('lector');
    const url: string = (await s.post('/invitations').send({ email, role: 'viewer' }).expect(201))
      .body.url;
    const [orgId, token] = url.split('/invitacion/')[1]!.split('/');
    const viewer = await signUp(app, 'Lector', email);
    await viewer.post(`/api/invitations/${orgId}/${token}/accept`).expect(200);
    const base = `/api/orgs/${s.orgId}/cabinets`;
    await viewer.get(`${base}/${cab.id}`).expect(200);
    await viewer
      .post(base)
      .send({ parentId: warehouseId, code: 'NO', name: 'No', rows: 1, columns: 1 })
      .expect(403);
    await viewer.patch(`${base}/${cab.id}/compartments/A1`).send({ name: 'x' }).expect(403);
  });
});
