import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { MAX_PHOTOS_PER_ITEM } from '@silopro/contracts';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, pieceUnitId, type Session, signUp, TEST_DB, UPLOADS_DIR } from './helpers.js';

/** JPEG de prueba con metadatos EXIF que deben desaparecer. */
async function jpegWithExif(width = 1200, height = 800): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#2a6' } })
    .jpeg()
    .withExif({ IFD0: { Artist: 'Persona Privada', Copyright: 'Ubicación secreta' } })
    .toBuffer();
}

function binary(res: { body: unknown }): Buffer {
  return res.body as Buffer;
}

const asBuffer = (req: import('supertest').Test) =>
  req.buffer(true).parse((res, cb) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });

describe.skipIf(!TEST_DB)('fotografías de artículos', () => {
  let app: INestApplication;
  let a: Session;
  let b: Session;
  let itemId: string;

  beforeAll(async () => {
    app = await createApp();
    a = await signUp(app, 'Fotos');
    b = await signUp(app, 'Ajeno');
    const unitId = await pieceUnitId(a);
    itemId = (await a.post('/items').send({ sku: 'FOTO-1', name: 'Con foto', unitId }).expect(201))
      .body.id;
  });
  afterAll(async () => app?.close());

  it('re-codifica a WebP, limita el tamaño y elimina los metadatos', async () => {
    const res = await a
      .post(`/items/${itemId}/photos`)
      .attach('file', await jpegWithExif(3000, 1500), 'foto.jpg')
      .expect(201);
    expect(res.body).toMatchObject({ width: 2000, height: 1000, position: 0 });

    const full = binary(
      await asBuffer(a.get(`/items/${itemId}/photos/${res.body.id}/full`)).expect(200),
    );
    const meta = await sharp(full).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.exif).toBeUndefined();
    expect(meta.width).toBe(2000);

    const thumb = binary(
      await asBuffer(a.get(`/items/${itemId}/photos/${res.body.id}/thumb`))
        .expect(200)
        .expect('Content-Type', 'image/webp')
        .expect('Cache-Control', /private/),
    );
    expect((await sharp(thumb).metadata()).width).toBe(480);

    const item = await a.get(`/items/${itemId}`).expect(200);
    expect(item.body.coverPhotoId).toBe(res.body.id);
  });

  it('rechaza archivos que no son imágenes aunque digan serlo', async () => {
    await a
      .post(`/items/${itemId}/photos`)
      .attach('file', Buffer.from('<svg onload="alert(1)"></svg>'), {
        filename: 'foto.jpg',
        contentType: 'image/jpeg',
      })
      .expect(415);
    await a
      .post(`/items/${itemId}/photos`)
      .attach('file', Buffer.from('%PDF-1.7 no es una imagen'), 'foto.png')
      .expect(415);
  });

  it('rechaza archivos mayores al límite', async () => {
    await a
      .post(`/items/${itemId}/photos`)
      .attach('file', Buffer.alloc(8 * 1024 * 1024 + 10, 1), 'grande.jpg')
      .expect(413);
  });

  it('otra organización no puede ver, subir ni borrar fotografías', async () => {
    const list = await a.get(`/items/${itemId}/photos`).expect(200);
    const photoId = list.body[0].id as string;
    const foreign = `/api/orgs/${a.orgId}/items/${itemId}/photos`;
    await b.agent.get(`${foreign}/${photoId}/full`).expect(404);
    await b.agent
      .post(foreign)
      .set('X-SiloPro-Request', '1')
      .attach('file', await jpegWithExif(), 'x.jpg')
      .expect(404);
    // Ruta de su propia organización con el id ajeno.
    await b.get(`/items/${itemId}/photos/${photoId}/full`).expect(404);
    await b.del(`/items/${itemId}/photos/${photoId}`).expect(404);
  });

  it('la subida exige la cabecera anti-CSRF', async () => {
    const res = await a.agent
      .post(`/api/orgs/${a.orgId}/items/${itemId}/photos`)
      .attach('file', await jpegWithExif(), 'x.jpg');
    expect(res.status).toBe(403); // falta la cabecera CSRF
  });

  it('cambia la portada, borra el archivo y respeta el máximo por artículo', async () => {
    const second = await a
      .post(`/items/${itemId}/photos`)
      .attach('file', await jpegWithExif(400, 400), 'b.jpg')
      .expect(201);
    const reordered = await a.post(`/items/${itemId}/photos/${second.body.id}/portada`).expect(200);
    expect(reordered.body[0].id).toBe(second.body.id);
    expect((await a.get(`/items/${itemId}`)).body.coverPhotoId).toBe(second.body.id);

    await a.del(`/items/${itemId}/photos/${second.body.id}`).expect(204);
    const files = readdirSync(join(UPLOADS_DIR, a.orgId));
    expect(files.some((f) => f.startsWith(second.body.id))).toBe(false);
    expect(existsSync(join(UPLOADS_DIR, a.orgId))).toBe(true);

    const current = (await a.get(`/items/${itemId}/photos`)).body.length as number;
    const small = await jpegWithExif(64, 64);
    for (let i = current; i < MAX_PHOTOS_PER_ITEM; i++) {
      await a.post(`/items/${itemId}/photos`).attach('file', small, 'p.jpg').expect(201);
    }
    const over = await a.post(`/items/${itemId}/photos`).attach('file', small, 'p.jpg').expect(422);
    expect(over.body.message).toMatch(/Máximo/);
    // El archivo rechazado no queda en disco.
    const count = readdirSync(join(UPLOADS_DIR, a.orgId)).filter((f) => f.endsWith('-full.webp'));
    expect(count).toHaveLength(MAX_PHOTOS_PER_ITEM);
  });
});
