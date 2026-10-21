import type { INestApplication } from '@nestjs/common';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, pieceUnitId, type Session, signUp, TEST_DB, uniqueEmail } from './helpers.js';

/** Extrae organización y token del enlace devuelto al invitar. */
function linkParts(url: string): { orgId: string; token: string; path: string } {
  const m = /\/invitacion\/([0-9a-f-]{36})\/([A-Za-z0-9_-]{43})$/.exec(url);
  if (!m) throw new Error(`Enlace inesperado: ${url}`);
  return { orgId: m[1]!, token: m[2]!, path: `/api/invitations/${m[1]}/${m[2]}` };
}

describe.skipIf(!TEST_DB)('miembros e invitaciones', () => {
  let app: INestApplication;
  let owner: Session;

  beforeAll(async () => {
    app = await createApp();
    owner = await signUp(app, 'Dueña');
  });
  afterAll(async () => app?.close());

  async function invite(by: Session, role: string, email = uniqueEmail('inv')) {
    const res = await by.post('/invitations').send({ email, role }).expect(201);
    return { email, ...linkParts(res.body.url as string), body: res.body };
  }

  it('invitar, previsualizar sin sesión y aceptar con la cuenta del correo', async () => {
    const inv = await invite(owner, 'operator');
    expect(inv.body).toMatchObject({ role: 'operator', status: 'pending', invitedByName: 'Dueña' });
    expect(inv.body.url).toMatch(/^http:\/\/localhost:4200\/invitacion\//);

    const p = await request(app.getHttpServer()).get(inv.path).expect(200);
    expect(p.body).toMatchObject({
      organizationName: 'Taller Dueña',
      role: 'operator',
      email: inv.email,
    });

    // Otra cuenta no puede usar la invitación.
    const intruder = await signUp(app, 'Intrusa');
    const wrong = await intruder.post(`${inv.path}/accept`).expect(403);
    expect(wrong.body.code).toBe('INVITATION_EMAIL_MISMATCH');

    const guest = await signUp(app, 'Invitado', inv.email);
    await guest.post(`${inv.path}/accept`).expect(200);
    const me = await guest.get('/api/auth/me').expect(200);
    expect(me.body.memberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ organizationId: owner.orgId, role: 'operator' }),
      ]),
    );

    // El enlace es de un solo uso.
    expect((await guest.post(`${inv.path}/accept`).expect(409)).body.code).toBe(
      'INVITATION_ACCEPTED',
    );
    const members = await owner.get('/members').expect(200);
    expect(members.body.map((m: { email: string }) => m.email)).toContain(inv.email);
  });

  it('el rol del invitado se aplica: consulta no puede escribir ni subir fotos', async () => {
    const inv = await invite(owner, 'viewer');
    const viewer = await signUp(app, 'Lectora', inv.email);
    await viewer.post(`${inv.path}/accept`).expect(200);
    const base = `/api/orgs/${owner.orgId}`;
    const unitId = await pieceUnitId(owner);
    const item = (
      await owner.post('/items').send({ sku: 'V-1', name: 'Visible', unitId }).expect(201)
    ).body;

    await viewer.get(`${base}/items/${item.id}`).expect(200);
    await viewer.post(`${base}/items`).send({ sku: 'V-2', name: 'No', unitId }).expect(403);
    const img = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#000' } })
      .png()
      .toBuffer();
    await viewer.post(`${base}/items/${item.id}/photos`).attach('file', img, 'a.png').expect(403);
    await viewer
      .post(`${base}/invitations`)
      .send({ email: uniqueEmail(), role: 'viewer' })
      .expect(403);
  });

  it('un administrador no puede crear ni tocar propietarios', async () => {
    const inv = await invite(owner, 'admin');
    const admin = await signUp(app, 'Admin', inv.email);
    await admin.post(`${inv.path}/accept`).expect(200);
    const base = `/api/orgs/${owner.orgId}`;

    const r1 = await admin
      .post(`${base}/invitations`)
      .send({ email: uniqueEmail(), role: 'owner' })
      .expect(403);
    expect(r1.body.code).toBe('OWNER_ONLY');
    await admin.patch(`${base}/members/${owner.userId}`).send({ role: 'viewer' }).expect(403);
    await admin.del(`${base}/members/${owner.userId}`).expect(403);
    // Sí puede invitar operadores.
    await admin
      .post(`${base}/invitations`)
      .send({ email: uniqueEmail(), role: 'operator' })
      .expect(201);
  });

  it('la organización nunca queda sin propietario', async () => {
    const solo = await signUp(app, 'Sola');
    const r = await solo.patch(`/members/${solo.userId}`).send({ role: 'admin' }).expect(409);
    expect(r.body.code).toBe('LAST_OWNER');
    await solo.del(`/members/${solo.userId}`).expect(409);

    // Con un segundo propietario, sí puede dejar de serlo.
    const inv = await invite(solo, 'owner');
    const second = await signUp(app, 'Segunda', inv.email);
    await second.post(`${inv.path}/accept`).expect(200);
    await solo.patch(`/members/${solo.userId}`).send({ role: 'admin' }).expect(200);
  });

  it('las invitaciones canceladas o de otra organización no sirven', async () => {
    const inv = await invite(owner, 'operator');
    await owner.del(`/invitations/${inv.body.id}`).expect(204);
    const guest = await signUp(app, 'Tarde', inv.email);
    expect((await guest.post(`${inv.path}/accept`).expect(409)).body.code).toBe(
      'INVITATION_REVOKED',
    );

    // El mismo token con otra organización en la ruta no existe (RLS).
    const other = await signUp(app, 'Otra');
    const live = await invite(owner, 'operator');
    const g2 = await signUp(app, 'G2', live.email);
    await g2.post(`/api/invitations/${other.orgId}/${live.token}/accept`).expect(404);
    // Otra organización no ve las invitaciones ni los miembros ajenos.
    await other.agent.get(`/api/orgs/${owner.orgId}/invitations`).expect(404);
    await other.agent.get(`/api/orgs/${owner.orgId}/members`).expect(404);
    const listed = await other.get('/invitations').expect(200);
    expect(listed.body).toHaveLength(0);
  });

  it('un miembro puede abandonar la organización por sí mismo', async () => {
    const inv = await invite(owner, 'operator');
    const leaver = await signUp(app, 'Se va', inv.email);
    await leaver.post(`${inv.path}/accept`).expect(200);
    await leaver.del(`/api/orgs/${owner.orgId}/members/${leaver.userId}`).expect(204);
    await leaver.get(`/api/orgs/${owner.orgId}/items`).expect(404);
  });
});
