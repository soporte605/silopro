import type { INestApplication } from '@nestjs/common';
import type { BillingSummary } from '@silopro/contracts';
import { PLANS } from '@silopro/domain';
import pg from 'pg';
import Stripe from 'stripe';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, pieceUnitId, signUp, TEST_DB, uniqueEmail } from './helpers.js';

/** Ejecuta SQL dentro de la organización (RLS), como lo haría el webhook de pagos. */
async function asOrg(orgId: string, query: string, params: unknown[] = []) {
  const pool = new pg.Pool({ connectionString: TEST_DB, max: 1 });
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query(`select set_config('app.organization_id', $1, true)`, [orgId]);
    await c.query(query, params);
    await c.query('commit');
  } finally {
    c.release();
    await pool.end();
  }
}

describe.skipIf(!TEST_DB)('planes y límites', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => app?.close());

  it('una organización nueva empieza con 14 días de prueba con límites de Profesional', async () => {
    const s = await signUp(app, 'Prueba');
    const b: BillingSummary = (await s.get('/billing').expect(200)).body;
    expect(b).toMatchObject({
      plan: 'trial',
      readOnly: false,
      trialDaysLeft: 14,
      limits: PLANS.pro.limits,
      usage: { members: 1, items: 0, photoBytes: 0 },
      checkoutAvailable: false,
    });
  });

  it('el plan Básico limita usuarios (con invitaciones) y artículos (también al importar)', async () => {
    const s = await signUp(app, 'Basico');
    await asOrg(
      s.orgId,
      `update organizations set plan = 'basic', subscription_status = 'active' where id = $1`,
      [s.orgId],
    );
    await s.post('/invitations').send({ email: uniqueEmail(), role: 'viewer' }).expect(201);
    await s.post('/invitations').send({ email: uniqueEmail(), role: 'viewer' }).expect(201);
    const over = await s.post('/invitations').send({ email: uniqueEmail(), role: 'viewer' });
    expect(over.status).toBe(402);
    expect(over.body.code).toBe('PLAN_LIMIT');
    expect(over.body.message).toContain('Básico permite hasta 3 usuarios');

    const unitId = await pieceUnitId(s);
    await asOrg(
      s.orgId,
      `insert into items (id, organization_id, sku, name, unit_id, qr_code)
       select gen_random_uuid(), $1::uuid, 'X-' || g, 'X', $2::uuid, 'Q' || substr(md5($1::text || g), 1, 12)
       from generate_series(1, 999) g`,
      [s.orgId, unitId],
    );
    await s.post('/items').send({ sku: 'ULTIMO', name: 'Último', unitId }).expect(201);
    const full = await s.post('/items').send({ sku: 'DE-MAS', name: 'De más', unitId });
    expect(full.status).toBe(402);
    expect(full.body.details).toMatchObject({ kind: 'items', limit: 1000, used: 1000 });
    const imp = await s
      .post('/import/items')
      .send({ dryRun: false, rows: [{ sku: 'IMP-1', name: 'Uno', unit: 'pza' }] });
    expect(imp.status).toBe(402);
    expect((await s.get('/billing').expect(200)).body.usage.items).toBe(1000);
  });

  it('al vencer la prueba queda en solo lectura: consulta sí, cambios no', async () => {
    const s = await signUp(app, 'Vencida');
    const unitId = await pieceUnitId(s);
    await s.post('/items').send({ sku: 'ANTES', name: 'Antes', unitId }).expect(201);
    await asOrg(
      s.orgId,
      `update organizations set trial_ends_at = now() - interval '1 day' where id = $1`,
      [s.orgId],
    );
    const res = await s.post('/items').send({ sku: 'DESPUES', name: 'Después', unitId });
    expect(res.status).toBe(402);
    expect(res.body.code).toBe('READ_ONLY');
    expect((await s.get('/items').expect(200)).body.items).toHaveLength(1);
    expect((await s.get('/billing').expect(200)).body).toMatchObject({
      readOnly: true,
      trialDaysLeft: 0,
    });
  });
});

describe.skipIf(!TEST_DB)('suscripciones con Stripe (webhook firmado)', () => {
  const secret = 'whsec_prueba';
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp({
      STRIPE_SECRET_KEY: 'sk_test_x',
      STRIPE_WEBHOOK_SECRET: secret,
    });
  });
  afterAll(async () => app?.close());

  const send = (payload: object) => {
    const body = JSON.stringify(payload);
    const header = Stripe.webhooks.generateTestHeaderString({ payload: body, secret });
    return request(app.getHttpServer())
      .post('/api/billing/webhook')
      .set('Content-Type', 'application/json')
      .set('Stripe-Signature', header)
      .send(body);
  };
  const subscription = (orgId: string, status: string, price: string) => ({
    id: 'evt_1',
    object: 'event',
    type: 'customer.subscription.updated',
    data: {
      object: {
        id: 'sub_1',
        object: 'subscription',
        customer: 'cus_1',
        status,
        metadata: { organizationId: orgId },
        items: {
          data: [
            { price: { id: 'price_x', lookup_key: price }, current_period_end: 1_900_000_000 },
          ],
        },
      },
    },
  });

  it('activa el plan pagado y lo deja en solo lectura al cancelarse', async () => {
    const s = await signUp(app, 'Stripe');
    await send(subscription(s.orgId, 'active', 'silopro_pro_year')).expect(200);
    // Con un plan pagado activo no se puede abrir otro checkout (doble cobro).
    const again = await s.post('/billing/checkout').send({ plan: 'basic', interval: 'month' });
    expect(again.status).toBe(400);
    expect(again.body.code).toBe('ALREADY_SUBSCRIBED');
    expect((await s.get('/billing').expect(200)).body).toMatchObject({
      plan: 'pro',
      readOnly: false,
      subscriptionStatus: 'active',
      billingInterval: 'year',
      currentPeriodEnd: new Date(1_900_000_000_000).toISOString(),
      checkoutAvailable: true,
    });
    await send(subscription(s.orgId, 'canceled', 'silopro_pro_year')).expect(200);
    expect((await s.get('/billing').expect(200)).body).toMatchObject({
      plan: 'pro',
      readOnly: true,
      subscriptionStatus: 'canceled',
    });
  });

  it('rechaza avisos sin firma válida', async () => {
    await request(app.getHttpServer())
      .post('/api/billing/webhook')
      .set('Stripe-Signature', 't=1,v1=falsa')
      .send({ type: 'customer.subscription.updated' })
      .expect(400);
  });
});
