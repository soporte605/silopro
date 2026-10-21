import 'reflect-metadata';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { loadEnv } from '../src/config/env.js';
import { DbService } from '../src/db/db.service.js';

export const TEST_DB = process.env['TEST_DATABASE_URL'];

/** Carpeta temporal de fotografías compartida por las pruebas de este proceso. */
export const UPLOADS_DIR = mkdtempSync(join(tmpdir(), 'silopro-uploads-'));

export async function createApp(): Promise<INestApplication> {
  const env = loadEnv({ NODE_ENV: 'test', DATABASE_URL: TEST_DB, UPLOADS_DIR });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(env)] }).compile();
  const app = moduleRef.createNestApplication();
  configureApp(app, env);
  await app.init();
  return app;
}

let seq = 0;
/** Correo único por prueba para no depender del orden de ejecución. */
export function uniqueEmail(prefix = 'u'): string {
  return `${prefix}.${Date.now().toString(36)}.${++seq}@prueba.test`;
}

export interface Session {
  agent: ReturnType<typeof request.agent>;
  orgId: string;
  userId: string;
  email: string;
  /** Petición con la cabecera CSRF ya incluida. */
  post: (url: string) => request.Test;
  patch: (url: string) => request.Test;
  put: (url: string) => request.Test;
  del: (url: string) => request.Test;
  get: (url: string) => request.Test;
}

/** Registra un usuario con su organización y devuelve un cliente con sesión. */
export async function signUp(
  app: INestApplication,
  name = 'Usuario',
  email = uniqueEmail(),
): Promise<Session> {
  const agent = request.agent(app.getHttpServer());
  const res = await agent
    .post('/api/auth/register')
    .set('X-SiloPro-Request', '1')
    .send({
      name,
      email,
      password: 'contraseña-segura-1',
      organizationName: `Taller ${name}`,
    })
    .expect(201);
  const orgId = res.body.memberships[0].organizationId as string;
  const base = `/api/orgs/${orgId}`;
  const abs = (u: string) => (u.startsWith('/api') ? u : `${base}${u}`);
  return {
    agent,
    orgId,
    userId: res.body.user.id,
    email: res.body.user.email,
    post: (u) => agent.post(abs(u)).set('X-SiloPro-Request', '1'),
    patch: (u) => agent.patch(abs(u)).set('X-SiloPro-Request', '1'),
    put: (u) => agent.put(abs(u)).set('X-SiloPro-Request', '1'),
    del: (u) => agent.delete(abs(u)).set('X-SiloPro-Request', '1'),
    get: (u) => agent.get(abs(u)),
  };
}

export async function pieceUnitId(s: Session): Promise<string> {
  const res = await s.get('/units').expect(200);
  return (res.body as { id: string; code: string }[]).find((u) => u.code === 'pza')!.id;
}

export function db(app: INestApplication): DbService {
  return app.get(DbService);
}
