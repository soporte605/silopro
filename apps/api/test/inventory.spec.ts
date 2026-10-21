import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, pieceUnitId, type Session, signUp, TEST_DB } from './helpers.js';

describe.skipIf(!TEST_DB)('catálogo e inventario', () => {
  let app: INestApplication;
  let s: Session;
  let unitId: string;

  beforeAll(async () => {
    app = await createApp();
    s = await signUp(app, 'Gonzalo');
    unitId = await pieceUnitId(s);
  });
  afterAll(async () => app?.close());

  describe('categorías y atributos', () => {
    it('hereda atributos y valida los valores de los artículos', async () => {
      const electronica = (
        await s
          .post('/categories')
          .send({
            name: 'Electrónica',
            attributes: [{ key: 'encapsulado', label: 'Encapsulado', type: 'text' }],
          })
          .expect(201)
      ).body;
      const resistencias = (
        await s
          .post('/categories')
          .send({
            name: 'Resistencias',
            parentId: electronica.id,
            attributes: [
              {
                key: 'resistencia',
                label: 'Resistencia',
                type: 'number',
                unit: 'Ω',
                required: true,
              },
              { key: 'tolerancia', label: 'Tolerancia', type: 'select', options: ['1%', '5%'] },
            ],
          })
          .expect(201)
      ).body;

      const bad = await s.post('/items').send({
        sku: 'RES-BAD',
        name: 'Mala',
        unitId,
        categoryId: resistencias.id,
        attributes: { tolerancia: '20%' },
      });
      expect(bad.status).toBe(422);
      expect(bad.body.details.map((d: { key: string }) => d.key).sort()).toEqual([
        'resistencia',
        'tolerancia',
      ]);

      const ok = await s
        .post('/items')
        .send({
          sku: 'RES-10K',
          name: 'Resistencia 10 kΩ',
          unitId,
          categoryId: resistencias.id,
          attributes: { resistencia: '10000', tolerancia: '5%', encapsulado: '0805' },
        })
        .expect(201);
      expect(ok.body.attributes).toEqual({
        resistencia: 10000,
        tolerancia: '5%',
        encapsulado: '0805',
      });
      expect(ok.body.categoryName).toBe('Resistencias');
      expect(ok.body.qrCode).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/);
    });

    it('rechaza definiciones de atributos inválidas y ciclos', async () => {
      await s
        .post('/categories')
        .send({ name: 'Mal', attributes: [{ key: 'Mal Clave', label: 'x', type: 'text' }] })
        .expect(400);
      const p = (await s.post('/categories').send({ name: 'Padre' }).expect(201)).body;
      const c = (await s.post('/categories').send({ name: 'Hija', parentId: p.id }).expect(201))
        .body;
      const res = await s
        .patch(`/categories/${p.id}`)
        .send({ name: 'Padre', parentId: c.id, version: p.version });
      expect(res.status).toBe(422);
    });

    it('impide archivar categorías con subcategorías', async () => {
      const p = (await s.post('/categories').send({ name: 'Con hijas' }).expect(201)).body;
      await s.post('/categories').send({ name: 'Hija 1', parentId: p.id }).expect(201);
      await s.del(`/categories/${p.id}`).expect(422);
    });
  });

  describe('artículos', () => {
    it('crea, busca, edita con control de versión y archiva', async () => {
      const supplier = (
        await s
          .post('/suppliers')
          .send({ name: 'Mouser', website: 'https://mouser.mx' })
          .expect(201)
      ).body;
      const created = (
        await s
          .post('/items')
          .send({
            sku: 'ESP32-S3',
            name: 'ESP32-S3-WROOM-1',
            unitId,
            manufacturer: 'Espressif',
            cost: 89.5,
            price: 149,
            minStock: 2,
            supplierIds: [supplier.id],
          })
          .expect(201)
      ).body;
      expect(created).toMatchObject({
        version: 1,
        cost: 89.5,
        onHand: 0,
        lowStock: true,
        supplierIds: [supplier.id],
      });

      const found = await s.get('/items?q=espressif').expect(200);
      expect(found.body.items.map((i: { sku: string }) => i.sku)).toContain('ESP32-S3');

      const updated = (
        await s
          .patch(`/items/${created.id}`)
          .send({ sku: 'ESP32-S3', name: 'ESP32-S3 N16R8', unitId, version: 1 })
          .expect(200)
      ).body;
      expect(updated.version).toBe(2);
      expect(updated.supplierIds).toEqual([]);

      const stale = await s
        .patch(`/items/${created.id}`)
        .send({ sku: 'ESP32-S3', name: 'Otro', unitId, version: 1 });
      expect(stale.status).toBe(409);
      expect(stale.body.code).toBe('STALE_VERSION');

      await s.del(`/items/${created.id}`).expect(204);
      await s.get(`/items/${created.id}`).expect(404);
    });

    it('rechaza SKU duplicado sin distinguir mayúsculas', async () => {
      await s.post('/items').send({ sku: 'DUP-1', name: 'A', unitId }).expect(201);
      const res = await s.post('/items').send({ sku: 'dup-1', name: 'B', unitId });
      expect(res.status).toBe(409);
    });

    it('trata comodines de búsqueda como texto literal', async () => {
      await s.post('/items').send({ sku: 'PCT-1', name: 'Descuento 100%', unitId }).expect(201);
      const res = await s.get('/items?q=%25').expect(200);
      expect(res.body.items.every((i: { name: string }) => i.name.includes('%'))).toBe(true);
    });
  });

  describe('ubicaciones y movimientos', () => {
    let item: { id: string };
    let drawer: { id: string; path: string };

    beforeAll(async () => {
      item = (
        await s
          .post('/items')
          .send({ sku: 'LED-R5', name: 'LED rojo 5 mm', unitId, minStock: 10 })
          .expect(201)
      ).body;
      const wh = (
        await s
          .post('/locations')
          .send({ kind: 'warehouse', code: 'ALM-1', name: 'Taller' })
          .expect(201)
      ).body;
      const cab = (
        await s
          .post('/locations')
          .send({ kind: 'cabinet', code: 'GAB-1', name: 'Gabinete 1', parentId: wh.id })
          .expect(201)
      ).body;
      drawer = (
        await s
          .post('/locations')
          .send({ kind: 'drawer', code: 'C4', name: 'Cajón C4', parentId: cab.id })
          .expect(201)
      ).body;
    });

    it('aplica las reglas de jerarquía de ubicaciones', async () => {
      expect(drawer.path).toBe('ALM-1 / GAB-1 / C4');
      await s.post('/locations').send({ kind: 'drawer', code: 'X', name: 'Suelto' }).expect(422);
      await s
        .post('/locations')
        .send({ kind: 'warehouse', code: 'W2', name: 'W', parentId: drawer.id })
        .expect(422);
    });

    it('registra entradas, salidas y ajustes con historial', async () => {
      await s
        .post('/movements')
        .send({ kind: 'receipt', itemId: item.id, locationId: drawer.id, quantity: 25 })
        .expect(201);
      await s
        .post('/movements')
        .send({
          kind: 'issue',
          itemId: item.id,
          locationId: drawer.id,
          quantity: 4,
          reason: 'Proyecto',
        })
        .expect(201);
      const over = await s
        .post('/movements')
        .send({ kind: 'issue', itemId: item.id, locationId: drawer.id, quantity: 100 });
      expect(over.status).toBe(422);
      await s
        .post('/movements')
        .send({ kind: 'adjustment', itemId: item.id, locationId: drawer.id, countedQuantity: 20 })
        .expect(400);
      const adj = await s
        .post('/movements')
        .send({
          kind: 'adjustment',
          itemId: item.id,
          locationId: drawer.id,
          countedQuantity: 20,
          reason: 'Conteo físico',
        })
        .expect(201);
      expect(adj.body.delta).toBe(-1);

      const detail = (await s.get(`/items/${item.id}`).expect(200)).body;
      expect(detail).toMatchObject({ onHand: 20, available: 20, lowStock: false });
      const byLoc = (await s.get(`/items/${item.id}/stock`).expect(200)).body;
      expect(byLoc).toEqual([
        expect.objectContaining({ locationPath: 'ALM-1 / GAB-1 / C4', onHand: 20 }),
      ]);
      const hist = (await s.get(`/items/${item.id}/movements`).expect(200)).body;
      expect(hist.map((m: { kind: string; delta: number }) => [m.kind, m.delta])).toEqual([
        ['adjustment', -1],
        ['issue', -4],
        ['receipt', 25],
      ]);
      expect(hist[0].actorName).toBe('Gonzalo');
    });

    it('maneja cantidades fraccionarias sin errores de redondeo', async () => {
      const cable = (await s.post('/items').send({ sku: 'CAB-22', name: 'Cable 22 AWG', unitId }))
        .body;
      for (const q of [0.1, 0.2]) {
        await s
          .post('/movements')
          .send({ kind: 'receipt', itemId: cable.id, locationId: drawer.id, quantity: q })
          .expect(201);
      }
      await s
        .post('/movements')
        .send({ kind: 'issue', itemId: cable.id, locationId: drawer.id, quantity: 0.3 })
        .expect(201);
      expect((await s.get(`/items/${cable.id}`)).body.onHand).toBe(0);
      await s
        .post('/movements')
        .send({ kind: 'receipt', itemId: cable.id, locationId: drawer.id, quantity: 0.0001 })
        .expect(400);
    });

    it('serializa salidas concurrentes: nunca deja existencias negativas', async () => {
      const it2 = (await s.post('/items').send({ sku: 'CONC-1', name: 'Concurrente', unitId }))
        .body;
      await s
        .post('/movements')
        .send({ kind: 'receipt', itemId: it2.id, locationId: drawer.id, quantity: 5 })
        .expect(201);
      const results = await Promise.all(
        Array.from({ length: 12 }, () =>
          s
            .post('/movements')
            .send({ kind: 'issue', itemId: it2.id, locationId: drawer.id, quantity: 1 }),
        ),
      );
      const ok = results.filter((r) => r.status === 201).length;
      const rejected = results.filter((r) => r.status === 422).length;
      expect(ok).toBe(5);
      expect(rejected).toBe(7);
      expect((await s.get(`/items/${it2.id}`)).body.onHand).toBe(0);
    });
  });
});
