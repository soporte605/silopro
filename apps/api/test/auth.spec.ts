import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, signUp, TEST_DB, uniqueEmail } from './helpers.js';

describe.skipIf(!TEST_DB)('autenticación', () => {
  let app: INestApplication;
  beforeAll(async () => (app = await createApp()));
  afterAll(async () => app?.close());

  const csrf = { 'X-SiloPro-Request': '1' };

  it('registra, crea la organización y abre sesión con cookie segura', async () => {
    const email = uniqueEmail();
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .set(csrf)
      .send({
        name: 'Gonzalo',
        email,
        password: 'contraseña-segura-1',
        organizationName: 'Taller Elikar',
      })
      .expect(201);
    expect(res.body.memberships).toEqual([
      expect.objectContaining({ organizationName: 'Taller Elikar', role: 'owner' }),
    ]);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/sp_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(JSON.stringify(res.body)).not.toContain('password');
  });

  it('crea unidades por defecto en la organización nueva', async () => {
    const s = await signUp(app);
    const res = await s.get('/units').expect(200);
    expect(res.body.map((u: { code: string }) => u.code)).toEqual(
      expect.arrayContaining(['pza', 'm', 'kg']),
    );
  });

  it('rechaza correos duplicados sin distinguir mayúsculas', async () => {
    const email = uniqueEmail();
    const body = { name: 'A', email, password: 'contraseña-segura-1', organizationName: 'Org A' };
    await request(app.getHttpServer()).post('/api/auth/register').set(csrf).send(body).expect(201);
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .set(csrf)
      .send({ ...body, email: email.toUpperCase() })
      .expect(409);
    expect(res.body.code).toBe('EMAIL_TAKEN');
  });

  it('valida la contraseña mínima', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .set(csrf)
      .send({ name: 'A', email: uniqueEmail(), password: 'corta', organizationName: 'Org' })
      .expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('inicia y cierra sesión; la sesión cerrada deja de ser válida', async () => {
    const email = uniqueEmail();
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .set(csrf)
      .send({ name: 'B', email, password: 'contraseña-segura-1', organizationName: 'Org B' })
      .expect(201);
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/api/auth/login')
      .set(csrf)
      .send({ email, password: 'incorrecta' })
      .expect(401);
    await agent
      .post('/api/auth/login')
      .set(csrf)
      .send({ email, password: 'contraseña-segura-1' })
      .expect(200);
    await agent.get('/api/auth/me').expect(200);
    await agent.post('/api/auth/logout').set(csrf).expect(204);
    await agent.get('/api/auth/me').expect(401);
  });

  it('usa el mismo mensaje para correo inexistente y contraseña incorrecta', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .set(csrf)
      .send({ email: uniqueEmail('nadie'), password: 'lo-que-sea-123' })
      .expect(401);
    expect(res.body).toMatchObject({
      code: 'INVALID_CREDENTIALS',
      message: 'Correo o contraseña incorrectos',
    });
  });

  it('exige sesión en rutas protegidas', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
  });

  it('rechaza peticiones que modifican datos sin la cabecera CSRF', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: uniqueEmail(), password: 'x' })
      .expect(403);
    expect(res.body.code).toBe('CSRF');
  });

  it('limita los intentos de inicio de sesión', async () => {
    const email = uniqueEmail('fuerza');
    const agent = request(app.getHttpServer());
    for (let i = 0; i < 10; i++) {
      await agent
        .post('/api/auth/login')
        .set(csrf)
        .send({ email, password: `mal-${i}` })
        .expect(401);
    }
    await agent.post('/api/auth/login').set(csrf).send({ email, password: 'mal' }).expect(429);
  });
});

describe.skipIf(!TEST_DB)('salud', () => {
  let app: INestApplication;
  beforeAll(async () => (app = await createApp()));
  afterAll(async () => app?.close());

  it('GET /api/health informa la base de datos y aplica cabeceras de seguridad', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', checks: { database: 'up' } });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('responde 404 con el formato de error uniforme', async () => {
    const res = await request(app.getHttpServer()).get('/api/no-existe').expect(404);
    expect(res.body).toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });
});
