import type { INestApplication } from '@nestjs/common';
import type { AlertSummary, Location, ShoppingList } from '@silopro/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, pieceUnitId, type Session, signUp, TEST_DB } from './helpers.js';

describe.skipIf(!TEST_DB)('lista de compras y alertas', () => {
  let app: INestApplication;
  let s: Session;
  let unitId: string;
  let bin: Location;

  beforeAll(async () => {
    app = await createApp();
    s = await signUp(app, 'Compras');
    unitId = await pieceUnitId(s);
    const w: Location = (
      await s
        .post('/locations')
        .send({ kind: 'warehouse', code: 'ALM', name: 'Almacén' })
        .expect(201)
    ).body;
    bin = (
      await s
        .post('/locations')
        .send({ kind: 'bin', code: 'A', name: 'A', parentId: w.id })
        .expect(201)
    ).body;
  });
  afterAll(async () => app?.close());

  const item = async (sku: string, stock: number, extra: object = {}) => {
    const id: string = (
      await s
        .post('/items')
        .send({ sku, name: sku, unitId, ...extra })
        .expect(201)
    ).body.id;
    if (stock) {
      await s
        .post('/movements')
        .send({ kind: 'receipt', itemId: id, locationId: bin.id, quantity: stock })
        .expect(201);
    }
    return id;
  };

  it('suma faltantes de proyectos y lo necesario para quedar en el mínimo', async () => {
    const supplier = (await s.post('/suppliers').send({ name: 'Electrónica Norte' }).expect(201))
      .body;
    // Bajo mínimo: hay 2, mínimo 5 → comprar 3.
    await item('CMP-LOW', 2, { minStock: 5, cost: 10, supplierIds: [supplier.id] });
    // Bien surtido: no aparece.
    await item('CMP-OK', 50, { minStock: 5 });
    // Proyecto pide 8, hay 3 y mínimo 2 → 8 + 2 − 3 = 7.
    const motor = await item('CMP-MOT', 3, { minStock: 2 });
    const p = (await s.post('/projects').send({ code: 'P-1', name: 'Uno' }).expect(201)).body;
    await s.post(`/projects/${p.id}/lines`).send({ itemId: motor, quantity: 8 }).expect(201);

    const list: ShoppingList = (await s.get('/shopping-list').expect(200)).body;
    expect(list.lines.map((l) => [l.sku, l.toBuy])).toEqual([
      ['CMP-LOW', 3],
      ['CMP-MOT', 7],
    ]);
    const low = list.lines[0]!;
    expect(low).toMatchObject({ supplierName: 'Electrónica Norte', unitCost: 10 });
    expect(low.reasons).toEqual([{ kind: 'low_stock', quantity: 5 }]);
    expect(list.lines[1]!.reasons).toEqual([
      { kind: 'project', projectCode: 'P-1', quantity: 8 },
      { kind: 'low_stock', quantity: 2 },
    ]);
    expect(list.estimatedTotal).toBe(30);
    expect(list.missingCost).toBe(1);

    // Reservar lo disponible no cambia lo que hay que comprar.
    await s.post(`/projects/${p.id}/reserve-all`).expect(200);
    const after: ShoppingList = (await s.get('/shopping-list').expect(200)).body;
    expect(after.lines.find((l) => l.sku === 'CMP-MOT')!.toBuy).toBe(7);

    const alerts: AlertSummary = (await s.get('/alerts').expect(200)).body;
    expect(alerts).toEqual({ lowStock: 2, toBuy: 2, projectsShort: 1 });

    const csv = await s.get('/shopping-list/export').expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text.startsWith('﻿Proveedor,SKU')).toBe(true);
    expect(csv.text).toContain('Electrónica Norte,CMP-LOW,CMP-LOW,3,pza,2,5,0,10,Stock mínimo');
    expect(csv.text).toContain(',CMP-MOT,CMP-MOT,7,pza');

    // Un proyecto terminado deja de pedir material; lo que siga apartado
    // no cuenta como disponible, así que solo falta llegar al mínimo.
    await s
      .patch(`/projects/${p.id}`)
      .send({ code: 'P-1', name: 'Uno', status: 'done', version: 1 })
      .expect(200);
    const done: ShoppingList = (await s.get('/shopping-list').expect(200)).body;
    expect(done.lines.find((l) => l.sku === 'CMP-MOT')).toMatchObject({
      projectPending: 0,
      toBuy: 2,
      reasons: [{ kind: 'low_stock', quantity: 2 }],
    });
  });
});
