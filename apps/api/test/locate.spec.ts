import type { INestApplication } from '@nestjs/common';
import type { Cabinet, LocateResult } from '@silopro/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, pieceUnitId, type Session, signUp, TEST_DB } from './helpers.js';

describe.skipIf(!TEST_DB)('¿dónde está?', () => {
  let app: INestApplication;
  let s: Session;
  let shelfId: string;
  let cab: Cabinet;
  let espId: string;
  let looseId: string;

  beforeAll(async () => {
    app = await createApp();
    s = await signUp(app, 'Localizar');
    const warehouse = (
      await s
        .post('/locations')
        .send({ kind: 'warehouse', code: 'ALM-1', name: 'Almacén' })
        .expect(201)
    ).body.id as string;
    shelfId = (
      await s
        .post('/locations')
        .send({ kind: 'zone', code: 'ANQ-B', name: 'Anaquel B', parentId: warehouse })
        .expect(201)
    ).body.id;
    cab = (
      await s
        .post('/cabinets')
        .send({ parentId: shelfId, code: 'GAB-2', name: 'Gabinete 2', rows: 3, columns: 4 })
        .expect(201)
    ).body;
    looseId = (
      await s
        .post('/locations')
        .send({ kind: 'bin', code: 'CAJA-9', name: 'Caja suelta', parentId: warehouse })
        .expect(201)
    ).body.id;
    const unitId = await pieceUnitId(s);
    espId = (
      await s
        .post('/items')
        .send({
          sku: 'ESP32-WROOM',
          name: 'ESP32 DevKit V1',
          manufacturer: 'Espressif',
          unitId,
          aliases: ['Placa WiFi', 'placa wifi', ' ', 'microcontrolador'],
        })
        .expect(201)
    ).body.id;
    await s.post('/items').send({ sku: 'ESP8266', name: 'NodeMCU ESP8266', unitId }).expect(201);
    const c4 = cab.compartments.find((c) => c.id === 'C4')!;
    const a1 = cab.compartments.find((c) => c.id === 'A1')!;
    for (const [locationId, quantity] of [
      [c4.locationId, 12],
      [a1.locationId, 3],
      [looseId, 5],
    ] as const) {
      await s
        .post('/movements')
        .send({ kind: 'receipt', itemId: espId, locationId, quantity })
        .expect(201);
    }
  });
  afterAll(async () => app?.close());

  const locate = async (q: string) =>
    (await s.get(`/locate?q=${encodeURIComponent(q)}`).expect(200)).body as LocateResult;

  it('guarda los alias sin repetidos ni vacíos', async () => {
    const item = (await s.get(`/items/${espId}`).expect(200)).body;
    expect(item.aliases).toEqual(['placa wifi', 'microcontrolador']);
  });

  it('dice en qué cajones está, de más a menos, con su gabinete y anaquel', async () => {
    const res = await locate('esp 32');
    expect(res.hits.map((h) => h.sku)).toEqual(['ESP32-WROOM']);
    const hit = res.hits[0]!;
    expect(hit).toMatchObject({ onHand: 20, unitSymbol: 'pza', matchedAlias: null });
    expect(hit.places).toEqual([
      {
        locationId: cab.compartments.find((c) => c.id === 'C4')!.locationId,
        path: 'ALM-1 / ANQ-B / GAB-2 / C4',
        code: 'C4',
        onHand: 12,
        cabinetId: cab.id,
        cabinetCode: 'GAB-2',
        shelfId,
      },
      {
        locationId: looseId,
        path: 'ALM-1 / CAJA-9',
        code: 'CAJA-9',
        onHand: 5,
        cabinetId: null,
        cabinetCode: null,
        shelfId: null,
      },
      expect.objectContaining({ code: 'A1', onHand: 3, cabinetId: cab.id }),
    ]);
  });

  it('tolera acentos, signos y mayúsculas, y busca por alias y fabricante', async () => {
    expect((await locate('ESP-32')).hits).toHaveLength(1);
    expect((await locate('esp')).hits.map((h) => h.sku)).toEqual(['ESP32-WROOM', 'ESP8266']);
    const alias = await locate('placa wi-fi');
    expect(alias.hits[0]).toMatchObject({ sku: 'ESP32-WROOM', matchedAlias: 'placa wifi' });
    expect((await locate('espressif devkit')).hits).toHaveLength(1);
    expect((await locate('arduino')).hits).toEqual([]);
  });

  it('pone primero el SKU exacto y muestra artículos sin existencias', async () => {
    const res = await locate('esp8266');
    expect(res.hits[0]).toMatchObject({ sku: 'ESP8266', onHand: 0, places: [] });
  });

  it('no ve artículos de otra organización y valida la búsqueda', async () => {
    const other = await signUp(app, 'Otro');
    const res = (await other.get('/locate?q=esp32').expect(200)).body as LocateResult;
    expect(res.hits).toEqual([]);
    await s.get('/locate?q=').expect(400);
    await s.get('/locate').expect(400);
  });
});
