/**
 * Planes comerciales y sus límites (ver docs/PLANS.md). Es la única fuente de
 * precios y límites: la API los hace cumplir y la web y la landing los muestran.
 */
export type PlanId = 'trial' | 'basic' | 'pro' | 'enterprise';
export type PaidPlanId = 'basic' | 'pro';
export type BillingInterval = 'month' | 'year';

export interface PlanLimits {
  /** Miembros más invitaciones pendientes. `null` = sin límite. */
  members: number | null;
  /** Artículos no archivados. */
  items: number | null;
  /** Bytes de fotografías. */
  photoBytes: number | null;
}

export interface PlanDefinition {
  id: PlanId;
  name: string;
  /** Precio en MXN sin IVA; `null` si no se vende en línea. */
  monthly: number | null;
  yearly: number | null;
  limits: PlanLimits;
}

const GB = 1024 ** 3;

export const TRIAL_DAYS = 14;

export const PLANS: Record<PlanId, PlanDefinition> = {
  trial: {
    id: 'trial',
    name: 'Prueba gratis',
    monthly: 0,
    yearly: 0,
    limits: { members: 10, items: 10_000, photoBytes: 20 * GB },
  },
  basic: {
    id: 'basic',
    name: 'Básico',
    monthly: 299,
    yearly: 2_990,
    limits: { members: 3, items: 1_000, photoBytes: 2 * GB },
  },
  pro: {
    id: 'pro',
    name: 'Profesional',
    monthly: 699,
    yearly: 6_990,
    limits: { members: 10, items: 10_000, photoBytes: 20 * GB },
  },
  enterprise: {
    id: 'enterprise',
    name: 'Empresa',
    monthly: null,
    yearly: null,
    limits: { members: null, items: null, photoBytes: null },
  },
};

export const PLAN_IDS = Object.keys(PLANS) as PlanId[];

/**
 * Preguntas al asistente con IA por mes y organización (`null` = sin límite).
 * Cada pregunta tiene costo de API; cifras provisionales hasta medir el uso real.
 */
export const ASSISTANT_MONTHLY_QUESTIONS: Record<PlanId, number | null> = {
  trial: 50,
  basic: 100,
  pro: 500,
  enterprise: null,
};

/** Periodo de cobro del cupo del asistente: mes calendario UTC, `AAAA-MM`. */
export function assistantPeriod(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}
export const isPlanId = (v: string): v is PlanId => v in PLANS;

/** Estados de suscripción de Stripe con los que la cuenta sigue activa. */
const ACTIVE_SUBSCRIPTION = new Set(['active', 'trialing', 'past_due']);

export interface PlanInput {
  plan: string;
  trialEndsAt: Date | null;
  subscriptionStatus: string | null;
}

export interface PlanState {
  plan: PlanId;
  limits: PlanLimits;
  /** Sin prueba vigente ni suscripción activa: solo lectura (no se borra nada). */
  readOnly: boolean;
  /** Días que le quedan a la prueba (redondeado hacia arriba); `null` fuera de prueba. */
  trialDaysLeft: number | null;
}

/** Plan efectivo de una organización en el momento `now`. */
export function planState(input: PlanInput, now = new Date()): PlanState {
  const plan: PlanId = isPlanId(input.plan) ? input.plan : 'trial';
  const limits = PLANS[plan].limits;
  if (plan === 'enterprise') return { plan, limits, readOnly: false, trialDaysLeft: null };
  if (plan === 'trial') {
    const ms = (input.trialEndsAt?.getTime() ?? 0) - now.getTime();
    return {
      plan,
      limits,
      readOnly: ms <= 0,
      trialDaysLeft: Math.max(0, Math.ceil(ms / 86_400_000)),
    };
  }
  return {
    plan,
    limits,
    readOnly: !ACTIVE_SUBSCRIPTION.has(input.subscriptionStatus ?? ''),
    trialDaysLeft: null,
  };
}

/** `lookup_key` de los precios en Stripe (los crea `scripts/stripe-setup.mjs`). */
export const PRICE_LOOKUP: Record<`${PaidPlanId}_${BillingInterval}`, string> = {
  basic_month: 'silopro_basic_month',
  basic_year: 'silopro_basic_year',
  pro_month: 'silopro_pro_month',
  pro_year: 'silopro_pro_year',
};

/** Plan e intervalo de una `lookup_key` de Stripe; `null` si no es de SiloPro. */
export function planFromLookupKey(
  key: string | null | undefined,
): { plan: PaidPlanId; interval: BillingInterval } | null {
  const m = /^silopro_(basic|pro)_(month|year)$/.exec(key ?? '');
  return m ? { plan: m[1] as PaidPlanId, interval: m[2] as BillingInterval } : null;
}

export type LimitKind = keyof PlanLimits;

/** ¿Cabe `adding` más sobre `used` dentro del límite? */
export function withinLimit(limit: number | null, used: number, adding = 1): boolean {
  return limit === null || used + adding <= limit;
}
