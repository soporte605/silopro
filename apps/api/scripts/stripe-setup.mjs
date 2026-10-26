/**
 * Prepara la cuenta de Stripe para cobrar SiloPro. Se puede correr las veces
 * que haga falta: solo crea o corrige lo que falte.
 *
 *   node scripts/stripe-setup.mjs <ruta/.env> [--live]
 *
 * Crea los productos y precios (MXN, con las `lookup_key` de
 * `@silopro/domain/plans`), el webhook hacia la API y una configuración propia
 * del portal de cliente. Si la cuenta de Stripe es compartida con otra app
 * (p. ej. FincaPro), no toca sus productos, webhooks ni su portal por omisión.
 * Los secretos se escriben en el .env y nunca se imprimen.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PLANS, PRICE_LOOKUP } from '@silopro/domain';
import Stripe from 'stripe';

const envPath = resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) ?? '.env');
const allowLive = process.argv.includes('--live');

const APP_URL = 'https://app.silopro.elikarsystems.com';
const WEBHOOK_URL = `${APP_URL}/api/billing/webhook`;
const WEBHOOK_EVENTS = [
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
];
const PRODUCTS = [
  {
    id: 'silopro_basic',
    plan: PLANS.basic,
    description: '3 usuarios, 1,000 artículos y 2 GB de fotos.',
  },
  {
    id: 'silopro_pro',
    plan: PLANS.pro,
    description: '10 usuarios, 10,000 artículos y 20 GB de fotos.',
  },
];

function readEnv() {
  if (!existsSync(envPath)) throw new Error(`No existe ${envPath}`);
  const out = {};
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

function writeEnvVar(name, value) {
  const lines = readFileSync(envPath, 'utf8').split('\n');
  const i = lines.findIndex((l) => l.startsWith(`${name}=`));
  if (i >= 0) lines[i] = `${name}=${value}`;
  else {
    if (lines[lines.length - 1] === '') lines.pop();
    lines.push(`${name}=${value}`, '');
  }
  writeFileSync(envPath, lines.join('\n'), { mode: 0o600 });
}

async function ensureProducts(stripe) {
  for (const p of PRODUCTS) {
    const data = { name: `SiloPro ${p.plan.name}`, description: p.description };
    try {
      await stripe.products.retrieve(p.id);
      await stripe.products.update(p.id, data);
      console.log(`Producto ${p.id}: ya existía`);
    } catch (e) {
      if (e.code !== 'resource_missing') throw e;
      await stripe.products.create({ id: p.id, ...data, metadata: { app: 'silopro' } });
      console.log(`Producto ${p.id}: creado`);
    }
  }
}

async function ensurePrices(stripe) {
  const wanted = [
    [PRICE_LOOKUP.basic_month, 'silopro_basic', PLANS.basic.monthly, 'month'],
    [PRICE_LOOKUP.basic_year, 'silopro_basic', PLANS.basic.yearly, 'year'],
    [PRICE_LOOKUP.pro_month, 'silopro_pro', PLANS.pro.monthly, 'month'],
    [PRICE_LOOKUP.pro_year, 'silopro_pro', PLANS.pro.yearly, 'year'],
  ];
  const existing = await stripe.prices.list({ lookup_keys: wanted.map(([k]) => k), limit: 10 });
  const byKey = new Map(existing.data.map((p) => [p.lookup_key, p]));
  for (const [lookupKey, product, pesos, interval] of wanted) {
    const amount = Math.round(pesos * 100);
    const cur = byKey.get(lookupKey);
    if (cur && cur.unit_amount === amount && cur.currency === 'mxn' && cur.active) {
      console.log(`Precio ${lookupKey}: ya existía`);
      continue;
    }
    // Un precio no se edita: se crea otro y se le pasa la lookup_key.
    await stripe.prices.create({
      product,
      currency: 'mxn',
      unit_amount: amount,
      recurring: { interval },
      lookup_key: lookupKey,
      transfer_lookup_key: !!cur,
      // El IVA se suma aparte en la factura.
      tax_behavior: 'exclusive',
      metadata: { app: 'silopro' },
    });
    if (cur) await stripe.prices.update(cur.id, { active: false });
    console.log(
      `Precio ${lookupKey}: ${cur ? 'actualizado' : 'creado'} ($${pesos} MXN / ${interval})`,
    );
  }
}

async function ensureWebhook(stripe, env) {
  const list = await stripe.webhookEndpoints.list({ limit: 100 });
  const cur = list.data.find((w) => w.url === WEBHOOK_URL);
  if (cur && env.STRIPE_WEBHOOK_SECRET) {
    await stripe.webhookEndpoints.update(cur.id, {
      enabled_events: WEBHOOK_EVENTS,
      disabled: false,
    });
    console.log('Webhook: ya existía');
    return;
  }
  // El secreto solo se entrega al crear; si se perdió, se recrea.
  if (cur) await stripe.webhookEndpoints.del(cur.id);
  const created = await stripe.webhookEndpoints.create({
    url: WEBHOOK_URL,
    enabled_events: WEBHOOK_EVENTS,
    description: 'SiloPro API',
  });
  writeEnvVar('STRIPE_WEBHOOK_SECRET', created.secret);
  console.log(`Webhook: creado; STRIPE_WEBHOOK_SECRET guardado en ${envPath}`);
}

/** Configuración del portal solo para SiloPro (no la de por omisión de la cuenta). */
async function ensurePortal(stripe, env) {
  const prices = await stripe.prices.list({ lookup_keys: Object.values(PRICE_LOOKUP), limit: 10 });
  const byProduct = {};
  for (const p of prices.data) (byProduct[p.product] ||= []).push(p.id);
  const params = {
    business_profile: { headline: 'SiloPro · administre su suscripción' },
    default_return_url: `${APP_URL}/plan`,
    metadata: { app: 'silopro' },
    features: {
      customer_update: { enabled: true, allowed_updates: ['email', 'address', 'name', 'tax_id'] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: {
        enabled: true,
        mode: 'at_period_end',
        cancellation_reason: {
          enabled: true,
          options: ['too_expensive', 'missing_features', 'switched_service', 'unused', 'other'],
        },
      },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ['price'],
        proration_behavior: 'create_prorations',
        products: Object.entries(byProduct).map(([product, ids]) => ({ product, prices: ids })),
      },
    },
  };
  if (env.STRIPE_PORTAL_CONFIGURATION) {
    await stripe.billingPortal.configurations.update(env.STRIPE_PORTAL_CONFIGURATION, params);
    console.log('Portal de cliente: actualizado');
  } else {
    const created = await stripe.billingPortal.configurations.create(params);
    writeEnvVar('STRIPE_PORTAL_CONFIGURATION', created.id);
    console.log(`Portal de cliente: creado; STRIPE_PORTAL_CONFIGURATION guardado en ${envPath}`);
  }
}

const env = readEnv();
const key = env.STRIPE_SECRET_KEY;
if (!key) throw new Error(`Falta STRIPE_SECRET_KEY en ${envPath}`);
if (key.startsWith('sk_live_') && !allowLive) {
  throw new Error('La clave es de producción (cobros reales); corra de nuevo con --live');
}
const stripe = new Stripe(key);
console.log(`Stripe en modo ${key.startsWith('sk_live_') ? 'PRODUCCIÓN' : 'prueba'}`);
await ensureProducts(stripe);
await ensurePrices(stripe);
await ensureWebhook(stripe, env);
await ensurePortal(stripe, env);
console.log('Listo.');
