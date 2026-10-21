import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { healthResponseSchema } from '@silopro/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap.js';
import { loadEnv } from '../src/config/env.js';

describe('API (integración HTTP)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const env = loadEnv({ NODE_ENV: 'test', DATABASE_URL: process.env['TEST_DATABASE_URL'] });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.forRoot(env)],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, env);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /api/health responde con el contrato compartido', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    const body = healthResponseSchema.parse(res.body);
    expect(body.version).toBe('0.1.0-alpha.1');
    if (!process.env['TEST_DATABASE_URL']) expect(body.checks['database']).toBe('skipped');
    else expect(body.checks['database']).toBe('up');
  });

  it('aplica cabeceras de seguridad', async () => {
    const res = await request(app.getHttpServer()).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('responde 404 con el formato de error uniforme', async () => {
    const res = await request(app.getHttpServer()).get('/api/no-existe').expect(404);
    expect(res.body).toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });
});
