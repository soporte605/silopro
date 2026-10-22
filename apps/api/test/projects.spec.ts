import type { INestApplication } from '@nestjs/common';
import type {
  Location,
  ProjectDetail,
  ProjectSummary,
  ReserveAllResult,
  StockByLocation,
} from '@silopro/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, pieceUnitId, type Session, signUp, TEST_DB } from './helpers.js';

describe.skipIf(!TEST_DB)('proyectos y lista de materiales', () => {
  let app: INestApplication;
  let s: Session;
  let unitId: string;
  let a: Location;
  let b: Location;

  beforeAll(async () => {
    app = await createApp();
    s = await signUp(app, 'Proyectos');
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

  const item = async (sku: string, stock: [Location, number][]): Promise<string> => {
    const id = (await s.post('/items').send({ sku, name: sku, unitId }).expect(201)).body.id;
    for (const [loc, quantity] of stock) {
      await s
        .post('/movements')
        .send({ kind: 'receipt', itemId: id, locationId: loc.id, quantity })
        .expect(201);
    }
    return id;
  };
  const project = async (code: string): Promise<ProjectDetail> =>
    (
      await s
        .post('/projects')
        .send({ code, name: `Proyecto ${code}` })
        .expect(201)
    ).body;

  it('calcula necesario, disponible, faltante y dónde está cada artículo', async () => {
    const motor = await item('PJ-MOTOR', [
      [a, 2],
      [b, 5],
    ]);
    const tornillo = await item('PJ-TORN', [[a, 3]]);
    const p = await project('ROBOT-1');
    expect(p).toMatchObject({ status: 'active', lineCount: 0, lines: [] });

    await s.post(`/projects/${p.id}/lines`).send({ itemId: motor, quantity: 4 }).expect(201);
    // Agregar el mismo artículo suma la cantidad.
    await s.post(`/projects/${p.id}/lines`).send({ itemId: motor, quantity: 2 }).expect(201);
    const d: ProjectDetail = (
      await s.post(`/projects/${p.id}/lines`).send({ itemId: tornillo, quantity: 10 }).expect(201)
    ).body;

    expect(d.lineCount).toBe(2);
    const [m, t] = d.lines;
    expect(m).toMatchObject({
      sku: 'PJ-MOTOR',
      required: 6,
      pending: 6,
      available: 7,
      shortage: 0,
    });
    // Primero la ubicación con más existencias.
    expect(m!.sources.map((x) => [x.locationPath, x.available])).toEqual([
      ['ALM / B', 5],
      ['ALM / A', 2],
    ]);
    expect(t).toMatchObject({ required: 10, available: 3, shortage: 7 });
    expect(d.shortageCount).toBe(1);
  });

  it('reserva todo lo disponible y deja el resto como faltante', async () => {
    const id = await item('PJ-RES', [
      [a, 2],
      [b, 3],
    ]);
    const p = await project('RES-1');
    await s.post(`/projects/${p.id}/lines`).send({ itemId: id, quantity: 8 }).expect(201);

    const r: ReserveAllResult = (await s.post(`/projects/${p.id}/reserve-all`).expect(200)).body;
    expect(r.created).toBe(2);
    expect(r.project.lines[0]).toMatchObject({
      required: 8,
      reserved: 5,
      pending: 3,
      available: 0,
      shortage: 3,
    });
    expect(r.project.reservations).toHaveLength(2);
    expect(r.project.reservations.every((x) => x.projectId === p.id)).toBe(true);
    expect(r.project.reservations[0]!.purpose).toBe('RES-1 · Proyecto RES-1');

    // Sin nada libre, una segunda vez no crea reservas.
    expect((await s.post(`/projects/${p.id}/reserve-all`).expect(200)).body.created).toBe(0);

    // Consumir cuenta como avance del proyecto.
    const first = r.project.reservations.find((x) => x.locationId === b.id)!;
    await s.post(`/reservations/${first.id}/consume`).send({ quantity: 1 }).expect(200);
    const after: ProjectDetail = (await s.get(`/projects/${p.id}`).expect(200)).body;
    expect(after.lines[0]).toMatchObject({ consumed: 1, reserved: 4, pending: 3 });

    // Liberar todo devuelve lo apartado sin consumir.
    const rel: ProjectDetail = (await s.post(`/projects/${p.id}/release-all`).expect(200)).body;
    expect(rel.lines[0]).toMatchObject({ consumed: 1, reserved: 0, pending: 7, available: 4 });
    const levels: StockByLocation[] = (await s.get(`/items/${id}/stock`).expect(200)).body;
    expect(levels.every((l) => l.reserved === 0)).toBe(true);
  });

  it('valida, controla versiones y no aparta en proyectos cerrados', async () => {
    const p = await project('CER-1');
    expect((await s.post('/projects').send({ code: 'CER-1', name: 'Otro' })).status).toBe(409);
    expect((await s.post('/projects').send({ code: 'mal código', name: 'X' })).status).toBe(400);

    const done: ProjectDetail = (
      await s
        .patch(`/projects/${p.id}`)
        .send({ code: 'CER-1', name: 'Cerrado', status: 'done', dueDate: '2026-12-31', version: 1 })
        .expect(200)
    ).body;
    expect(done).toMatchObject({ status: 'done', dueDate: '2026-12-31', version: 2 });
    expect(
      (await s.patch(`/projects/${p.id}`).send({ code: 'CER-1', name: 'X', version: 1 })).status,
    ).toBe(409);
    const closed = await s.post(`/projects/${p.id}/reserve-all`);
    expect(closed.status).toBe(422);
    expect(closed.body.details.code).toBe('PROJECT_CLOSED');

    const list: ProjectSummary[] = (await s.get('/projects?status=done').expect(200)).body;
    expect(list.map((x) => x.code)).toEqual(['CER-1']);
  });

  it('edita y quita líneas', async () => {
    const id = await item('PJ-EDIT', [[a, 1]]);
    const p = await project('EDIT-1');
    const d: ProjectDetail = (
      await s.post(`/projects/${p.id}/lines`).send({ itemId: id, quantity: 2 }).expect(201)
    ).body;
    const line = d.lines[0]!;
    const upd: ProjectDetail = (
      await s
        .patch(`/projects/${p.id}/lines/${line.id}`)
        .send({ quantity: 5, notes: 'Para el chasis' })
        .expect(200)
    ).body;
    expect(upd.lines[0]).toMatchObject({ required: 5, notes: 'Para el chasis', shortage: 4 });
    const del: ProjectDetail = (await s.del(`/projects/${p.id}/lines/${line.id}`).expect(200)).body;
    expect(del.lines).toEqual([]);
  });

  it('aísla los proyectos entre organizaciones', async () => {
    const p = await project('PRIV-1');
    const other = await signUp(app, 'Ajena');
    expect((await other.get(`/projects/${p.id}`)).status).toBe(404);
    expect((await other.get('/projects').expect(200)).body).toEqual([]);
    // No puede cargar a su proyecto artículos de otra organización.
    const mine = (await other.post('/projects').send({ code: 'X', name: 'X' }).expect(201)).body;
    const foreign = await item('PJ-AJENO', []);
    expect(
      (await other.post(`/projects/${mine.id}/lines`).send({ itemId: foreign, quantity: 1 }))
        .status,
    ).toBe(404);
  });
});
