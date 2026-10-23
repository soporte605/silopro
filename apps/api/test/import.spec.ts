import type { INestApplication } from '@nestjs/common';
import type { ImportResult, Item, Location, Page, StockByLocation } from '@silopro/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, type Session, signUp, TEST_DB } from './helpers.js';

describe.skipIf(!TEST_DB)('importación de artículos', () => {
  let app: INestApplication;
  let s: Session;
  let bin: Location;

  beforeAll(async () => {
    app = await createApp();
    s = await signUp(app, 'Importa');
    const w: Location = (
      await s
        .post('/locations')
        .send({ kind: 'warehouse', code: 'ALM', name: 'Almacén' })
        .expect(201)
    ).body;
    bin = (
      await s
        .post('/locations')
        .send({ kind: 'bin', code: 'C1', name: 'C1', parentId: w.id })
        .expect(201)
    ).body;
    await s.post('/categories').send({ name: 'Electrónica' }).expect(201);
  });
  afterAll(async () => app?.close());

  const run = (rows: object[], dryRun: boolean, updateExisting = true) =>
    s.post('/import/items').send({ rows, dryRun, updateExisting });

  it('valida todo antes y no importa nada si hay errores', async () => {
    const rows = [
      { sku: 'IMP-1', name: 'Resistencia 1k', unit: 'pza', category: 'electrónica' },
      { sku: 'IMP-2', name: 'Sin unidad' },
      { sku: 'IMP-1', name: 'Repetido', unit: 'pza' },
      { sku: 'IMP 3', name: 'SKU con espacio', unit: 'pza' },
      { sku: 'IMP-4', name: 'Unidad rara', unit: 'barriles' },
      { sku: 'IMP-5', name: 'Cantidad sin lugar', unit: 'pza', quantity: 3 },
      { sku: 'IMP-6', name: 'Lugar que no existe', unit: 'pza', quantity: 3, location: 'X/Y' },
      { sku: 'IMP-7', name: 'Categoría rara', unit: 'pza', category: 'Plomería' },
    ];
    const dry: ImportResult = (await run(rows, true).expect(200)).body;
    expect(dry).toMatchObject({ dryRun: true, created: 1, errors: 7 });
    expect(dry.rows.map((r) => r.errors[0] ?? null)).toEqual([
      null,
      'Falta la unidad',
      'SKU repetido en el archivo (fila 1)',
      'SKU: solo letras, números y . _ - /',
      'Unidad «barriles» no existe',
      'Para registrar cantidad indique la ubicación',
      'Ubicación «X/Y» no existe',
      'Categoría «Plomería» no existe',
    ]);
    const real = await run(rows, false);
    expect(real.status).toBe(422);
    expect(real.body.message).toBe('No se importó nada: corrija 7 filas');
    const list: Page<Item> = (await s.get('/items?q=IMP').expect(200)).body;
    expect(list.total).toBe(0);
  });

  it('crea, actualiza solo lo que trae el archivo y registra entradas', async () => {
    const unitId = (await s.get('/units').expect(200)).body[0].id;
    const existing: Item = (
      await s
        .post('/items')
        .send({
          sku: 'IMP-EX',
          name: 'Original',
          unitId,
          manufacturer: 'Acme',
        })
        .expect(201)
    ).body;
    const rows = [
      {
        sku: 'IMP-A',
        name: 'Capacitor 100 µF',
        unit: 'Pieza',
        cost: 2.5,
        minStock: 10,
        quantity: 40,
        location: 'alm / c1',
      },
      { sku: 'imp-ex', name: 'Renombrado', cost: 9 },
      { sku: 'IMP-B', name: 'Por código de ubicación', unit: 'pza', quantity: 1.5, location: 'C1' },
    ];
    const dry: ImportResult = (await run(rows, true).expect(200)).body;
    expect(dry).toMatchObject({ created: 2, updated: 1, errors: 0, stockEntries: 2 });
    expect(dry.rows[0]!.stock).toEqual({ quantity: 40, locationPath: 'ALM / C1' });
    // La validación no escribe nada.
    expect((await s.get('/items?q=IMP-A').expect(200)).body.total).toBe(0);

    const done: ImportResult = (await run(rows, false).expect(200)).body;
    expect(done).toMatchObject({ dryRun: false, created: 2, updated: 1 });

    const a: Item = (await s.get('/items?q=IMP-A').expect(200)).body.items[0];
    expect(a).toMatchObject({ name: 'Capacitor 100 µF', cost: 2.5, minStock: 10, onHand: 40 });
    const ex: Item = (await s.get(`/items/${existing.id}`).expect(200)).body;
    expect(ex).toMatchObject({ name: 'Renombrado', cost: 9, manufacturer: 'Acme', version: 2 });
    const stock: StockByLocation[] = (await s.get(`/items/${a.id}/stock`).expect(200)).body;
    expect(stock).toEqual([expect.objectContaining({ locationId: bin.id, onHand: 40 })]);
    const moves = (await s.get(`/items/${a.id}/movements`).expect(200)).body;
    expect(moves[0]).toMatchObject({ kind: 'receipt', reason: 'Importación' });

    // Sin actualizar existentes: la fila se omite.
    const skip: ImportResult = (
      await run([{ sku: 'IMP-A', name: 'Otro nombre' }], false, false).expect(200)
    ).body;
    expect(skip).toMatchObject({ skipped: 1, updated: 0 });
  });

  it('solo quien edita el catálogo puede importar', async () => {
    const other = await signUp(app, 'Otra');
    // Un usuario de otra organización no ve las ubicaciones de esta.
    const r: ImportResult = (
      await other
        .post('/import/items')
        .send({ rows: [{ sku: 'Z-1', name: 'Z', unit: 'pza', quantity: 1, location: 'ALM / C1' }] })
        .expect(200)
    ).body;
    expect(r.rows[0]!.errors).toEqual(['Ubicación «ALM / C1» no existe']);
  });
});
