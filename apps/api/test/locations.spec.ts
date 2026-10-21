import type { INestApplication } from '@nestjs/common';
import type { Cabinet, Location } from '@silopro/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, pieceUnitId, type Session, signUp, TEST_DB } from './helpers.js';

describe.skipIf(!TEST_DB)('edición de ubicaciones y capacidad', () => {
  let app: INestApplication;
  let s: Session;
  let unitId: string;

  beforeAll(async () => {
    app = await createApp();
    s = await signUp(app, 'Ubicaciones');
    unitId = await pieceUnitId(s);
  });
  afterAll(async () => app?.close());

  const loc = async (body: Record<string, unknown>): Promise<Location> =>
    (await s.post('/locations').send(body).expect(201)).body;
  const item = async (sku: string): Promise<string> =>
    (await s.post('/items').send({ sku, name: sku, unitId }).expect(201)).body.id;
  const receive = (itemId: string, locationId: string, quantity = 1) =>
    s.post('/movements').send({ kind: 'receipt', itemId, locationId, quantity });
  const byPath = async (path: string) =>
    ((await s.get('/locations').expect(200)).body as Location[]).find((l) => l.path === path);

  it('renombra y mueve una ubicación recalculando la ruta de su subárbol', async () => {
    const a = await loc({ kind: 'warehouse', code: 'ALM-A', name: 'A' });
    const b = await loc({ kind: 'warehouse', code: 'ALM-B', name: 'B' });
    const zone = await loc({ kind: 'zone', code: 'Z1', name: 'Zona', parentId: a.id });
    await loc({ kind: 'shelving', code: 'E1', name: 'Estante', parentId: zone.id });

    const moved: Location = (
      await s
        .patch(`/locations/${zone.id}`)
        .send({ code: 'Z9', name: 'Zona 9', parentId: b.id, version: zone.version })
        .expect(200)
    ).body;
    expect(moved).toMatchObject({ path: 'ALM-B / Z9', name: 'Zona 9', version: zone.version + 1 });
    expect(await byPath('ALM-B / Z9 / E1')).toBeDefined();
    expect(await byPath('ALM-A / Z1 / E1')).toBeUndefined();

    // Versión vieja → 409; dentro de sí misma → 422; tipo no permitido → 422.
    await s
      .patch(`/locations/${zone.id}`)
      .send({ code: 'Z9', name: 'x', parentId: b.id, version: zone.version })
      .expect(409);
    const shelf = (await byPath('ALM-B / Z9 / E1'))!;
    await s
      .patch(`/locations/${zone.id}`)
      .send({ code: 'Z9', name: 'x', parentId: shelf.id, version: moved.version })
      .expect(422);
    await s
      .patch(`/locations/${a.id}`)
      .send({ code: 'ALM-A', name: 'A', parentId: b.id, version: a.version })
      .expect(422);
    // Código repetido en el mismo lugar → 409.
    await loc({ kind: 'zone', code: 'Z2', name: 'Otra', parentId: b.id });
    await s
      .patch(`/locations/${zone.id}`)
      .send({ code: 'Z2', name: 'x', parentId: b.id, version: moved.version })
      .expect(409);
  });

  it('archiva solo si no hay existencias y libera el código', async () => {
    const w = await loc({ kind: 'warehouse', code: 'ALM-C', name: 'C' });
    const shelf = await loc({ kind: 'bin', code: 'E1', name: 'E', parentId: w.id });
    const itemId = await item('ARCH-1');
    await receive(itemId, shelf.id, 2).expect(201);

    const blocked = await s.del(`/locations/${w.id}`);
    expect(blocked.status).toBe(422);
    expect(blocked.body.details).toEqual({ code: 'LOCATION_HAS_STOCK', paths: ['ALM-C / E1'] });

    await s
      .post('/movements')
      .send({ kind: 'issue', itemId, locationId: shelf.id, quantity: 2 })
      .expect(201);
    await s.del(`/locations/${w.id}`).expect(204);
    expect(await byPath('ALM-C')).toBeUndefined();
    expect(await byPath('ALM-C / E1')).toBeUndefined();
    await loc({ kind: 'warehouse', code: 'ALM-C', name: 'C nuevo' });
  });

  it('respeta la capacidad de artículos distintos por ubicación', async () => {
    const w = await loc({ kind: 'warehouse', code: 'ALM-D', name: 'D' });
    const bin = await loc({ kind: 'bin', code: 'C1', name: 'Caja', parentId: w.id });
    const capped: Location = (
      await s
        .patch(`/locations/${bin.id}`)
        .send({ code: 'C1', name: 'Caja', parentId: w.id, version: bin.version, maxItems: 1 })
        .expect(200)
    ).body;
    expect(capped.maxItems).toBe(1);

    const [r1, r2] = [await item('CAP-1'), await item('CAP-2')];
    await receive(r1, bin.id).expect(201);
    await receive(r1, bin.id).expect(201); // el mismo artículo sí cabe
    const full = await receive(r2, bin.id);
    expect(full.status).toBe(422);
    expect(full.body.details).toMatchObject({ code: 'CAPACITY_EXCEEDED', maxItems: 1 });

    await s
      .patch(`/locations/${bin.id}`)
      .send({ code: 'C1', name: 'Caja', parentId: w.id, version: capped.version, maxItems: null })
      .expect(200);
    await receive(r2, bin.id).expect(201);
  });

  it('los cajones de gabinete se editan desde el gabinete', async () => {
    const w = await loc({ kind: 'warehouse', code: 'ALM-E', name: 'E' });
    const cab: Cabinet = (
      await s
        .post('/cabinets')
        .send({ parentId: w.id, code: 'GAB', name: 'Gab', rows: 1, columns: 2 })
        .expect(201)
    ).body;
    const a1 = cab.compartments.find((c) => c.id === 'A1')!;
    const drawer = (await byPath('ALM-E / GAB / A1'))!;
    await s
      .patch(`/locations/${drawer.id}`)
      .send({ code: 'X1', name: 'x', parentId: drawer.parentId, version: drawer.version })
      .expect(422);
    await s.del(`/locations/${drawer.id}`).expect(422);

    const updated: Cabinet = (
      await s
        .patch(`/cabinets/${cab.id}/compartments/A1`)
        .send({ name: 'Resistencias', maxItems: 1 })
        .expect(200)
    ).body;
    expect(updated.compartments.find((c) => c.id === 'A1')).toMatchObject({
      name: 'Resistencias',
      maxItems: 1,
    });
    const itemId = await item('GAB-CAP');
    await receive(itemId, a1.locationId).expect(201);
    const after: Cabinet = (await s.get(`/cabinets/${cab.id}`).expect(200)).body;
    expect(after.compartments.find((c) => c.id === 'A1')?.state).toBe('full');
    await s.patch(`/cabinets/${cab.id}/compartments/A1`).send({}).expect(400);

    // Mover el gabinete arrastra sus cajones.
    const other = await loc({ kind: 'warehouse', code: 'ALM-F', name: 'F' });
    const cabLoc = (await byPath('ALM-E / GAB'))!;
    await s
      .patch(`/locations/${cabLoc.id}`)
      .send({ code: 'GAB', name: 'Gab', parentId: other.id, version: cabLoc.version })
      .expect(200);
    expect((await s.get(`/cabinets/${cab.id}`).expect(200)).body.path).toBe('ALM-F / GAB');
    expect(await byPath('ALM-F / GAB / A1')).toBeDefined();
  });
});
