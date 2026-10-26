import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testOutbox } from '../src/mail/mail.service.js';
import { createApp, signUp, TEST_DB, uniqueEmail } from './helpers.js';

const H = { 'X-SiloPro-Request': '1' };
/** Último correo enviado a `to` y el token de su enlace. */
const lastMail = (to: string) => {
  const m = [...testOutbox].reverse().find((x) => x.to === to);
  if (!m) throw new Error(`Sin correo para ${to}`);
  return { ...m, token: /token=([A-Za-z0-9_-]{43})/.exec(m.text)?.[1] ?? '' };
};

describe.skipIf(!TEST_DB)('correos: confirmar correo, recuperar contraseña e invitaciones', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => app?.close());

  it('al registrarse envía el enlace de confirmación y sirve una sola vez', async () => {
    const s = await signUp(app, 'Correo');
    expect((await s.get('/api/auth/me').expect(200)).body.user.emailVerified).toBe(false);
    const mail = lastMail(s.email);
    expect(mail.subject).toBe('Confirme su correo en SiloPro');
    expect(mail.text).toContain('http://localhost:4200/verificar-correo?token=');
    expect(mail.html).toContain('Confirmar correo');

    const anon = request(app.getHttpServer());
    await anon.post('/api/auth/verify-email').set(H).send({ token: mail.token }).expect(204);
    expect((await s.get('/api/auth/me').expect(200)).body.user.emailVerified).toBe(true);
    const again = await anon.post('/api/auth/verify-email').set(H).send({ token: mail.token });
    expect(again.status).toBe(400);
    expect(again.body.code).toBe('INVALID_LINK');

    // Ya confirmado: reenviar no manda otro correo.
    const before = testOutbox.length;
    await s.post('/api/auth/verify-email/resend').expect(204);
    expect(testOutbox.length).toBe(before);
  });

  it('reenviar invalida el enlace anterior y tiene límite por hora', async () => {
    const s = await signUp(app, 'Reenvio');
    const first = lastMail(s.email).token;
    await s.post('/api/auth/verify-email/resend').expect(204);
    const second = lastMail(s.email).token;
    expect(second).not.toBe(first);
    const anon = request(app.getHttpServer());
    await anon.post('/api/auth/verify-email').set(H).send({ token: first }).expect(400);
    await s.post('/api/auth/verify-email/resend').expect(204);
    await s.post('/api/auth/verify-email/resend').expect(204);
    await s.post('/api/auth/verify-email/resend').expect(429);
    await anon.post('/api/auth/verify-email').set(H).send({ token: second }).expect(400);
  });

  it('recupera la contraseña: cambia la clave, cierra sesiones y no revela cuentas', async () => {
    const s = await signUp(app, 'Olvido');
    const anon = request(app.getHttpServer());
    const before = testOutbox.length;
    await anon
      .post('/api/auth/password/forgot')
      .set(H)
      .send({ email: uniqueEmail('nadie') })
      .expect(204);
    expect(testOutbox.length).toBe(before);

    await anon.post('/api/auth/password/forgot').set(H).send({ email: s.email }).expect(204);
    const mail = lastMail(s.email);
    expect(mail.subject).toBe('Restablecer su contraseña de SiloPro');
    expect(mail.text).toContain('/restablecer-contrasena?token=');

    await anon
      .post('/api/auth/password/reset')
      .set(H)
      .send({ token: mail.token, password: 'corta' })
      .expect(400);
    await anon
      .post('/api/auth/password/reset')
      .set(H)
      .send({ token: mail.token, password: 'otra-clave-segura-2' })
      .expect(204);
    // La sesión anterior se cerró y el enlace ya no sirve.
    await s.get('/api/auth/me').expect(401);
    await anon
      .post('/api/auth/password/reset')
      .set(H)
      .send({ token: mail.token, password: 'otra-clave-segura-3' })
      .expect(400);
    await anon
      .post('/api/auth/login')
      .set(H)
      .send({ email: s.email, password: 'contraseña-segura-1' })
      .expect(401);
    const login = await anon
      .post('/api/auth/login')
      .set(H)
      .send({ email: s.email, password: 'otra-clave-segura-2' })
      .expect(200);
    // Recibir el enlace demuestra que el correo es suyo.
    expect(login.body.user.emailVerified).toBe(true);
  });

  it('la invitación llega por correo con el enlace', async () => {
    const s = await signUp(app, 'Invita');
    const email = uniqueEmail('invitado');
    const inv = (await s.post('/invitations').send({ email, role: 'operator' }).expect(201)).body;
    const mail = lastMail(email);
    expect(mail.subject).toBe('Invita le invitó a Taller Invita en SiloPro');
    expect(mail.text).toContain(inv.url);
    expect(mail.text).toContain('como operador');
  });
});
