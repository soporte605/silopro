import type { INestApplication } from '@nestjs/common';
import type { Cabinet, Location } from '@silopro/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, pieceUnitId, type Session, signUp, TEST_DB } from './helpers.js';

describe.skipIf(!TEST_DB)('etiquetas QR', () => {
  let app: INestApplication;
  let s: Session;

  beforeAll(async () => {
    app = await createApp();
    s = await signUp(app, 'Etiquetas');
  });
  afterAll(async () => app?.close());

  it('resuelve artículos, gabinetes y cajones, y aísla por organización', async () => {
    const w: Location = (
      await s.post('/locations').send({ kind: 'warehouse', code: 'T', name: 'Taller' }).expect(201)
    ).body;
    const cab: Cabinet = (
      await s
        .post('/cabinets')
        .send({ parentId: w.id, code: 'GAB', name: 'Gab', rows: 1, columns: 2 })
        .expect(201)
    ).body;
    const unitId = await pieceUnitId(s);
    const item = (await s.post('/items').send({ sku: 'QR-1', name: 'Sensor', unitId }).expect(201))
      .body;

    expect((await s.get(`/qr/item/${item.qrCode}`).expect(200)).body).toEqual({
      type: 'item',
      id: item.id,
      name: 'Sensor',
      label: 'QR-1',
      cabinetId: null,
    });
    expect((await s.get(`/qr/location/${cab.qrCode}`).expect(200)).body).toMatchObject({
      label: 'T / GAB',
      cabinetId: cab.id,
    });
    const a2 = cab.compartments.find((c) => c.id === 'A2')!;
    expect((await s.get(`/qr/location/${a2.qrCode.toLowerCase()}`).expect(200)).body).toMatchObject(
      { id: a2.locationId, label: 'T / GAB / A2', cabinetId: cab.id },
    );
    expect((await s.get(`/qr/location/${w.qrCode}`).expect(200)).body.cabinetId).toBeNull();

    await s.get('/qr/item/0123456789').expect(404);
    await s.get('/qr/user/0123456789').expect(404);
    const other = await signUp(app, 'Ajena');
    await other.get(`/qr/item/${item.qrCode}`).expect(404);
  });
});
