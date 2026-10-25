import { describe, expect, it } from 'vitest';
import { PLANS, planState, withinLimit } from './plans.js';

const now = new Date('2026-11-01T12:00:00Z');
const days = (n: number) => new Date(now.getTime() + n * 86_400_000);

describe('planes', () => {
  it('la prueba da los límites de Profesional y pasa a solo lectura al vencer', () => {
    const t = planState({ plan: 'trial', trialEndsAt: days(3.5), subscriptionStatus: null }, now);
    expect(t).toEqual({
      plan: 'trial',
      limits: PLANS.pro.limits,
      readOnly: false,
      trialDaysLeft: 4,
    });
    const end = planState({ plan: 'trial', trialEndsAt: days(-1), subscriptionStatus: null }, now);
    expect(end.readOnly).toBe(true);
    expect(end.trialDaysLeft).toBe(0);
  });

  it('un plan de pago depende del estado de la suscripción', () => {
    const s = (status: string | null) =>
      planState({ plan: 'basic', trialEndsAt: null, subscriptionStatus: status }, now).readOnly;
    expect(s('active')).toBe(false);
    expect(s('past_due')).toBe(false);
    expect(s('canceled')).toBe(true);
    expect(s('unpaid')).toBe(true);
    expect(s(null)).toBe(true);
  });

  it('empresa no tiene límites ni vence; un plan desconocido cuenta como prueba', () => {
    const e = planState({ plan: 'enterprise', trialEndsAt: null, subscriptionStatus: null }, now);
    expect(e.readOnly).toBe(false);
    expect(withinLimit(e.limits.items, 1e9)).toBe(true);
    expect(
      planState({ plan: 'free', trialEndsAt: null, subscriptionStatus: null }, now),
    ).toMatchObject({
      plan: 'trial',
      readOnly: true,
    });
  });

  it('comprueba límites', () => {
    expect(withinLimit(3, 2)).toBe(true);
    expect(withinLimit(3, 3)).toBe(false);
    expect(withinLimit(1000, 990, 11)).toBe(false);
  });
});

describe('lookup_key de Stripe', () => {
  it('traduce cada clave a su plan e intervalo', async () => {
    const { PRICE_LOOKUP, planFromLookupKey } = await import('./plans.js');
    for (const [k, v] of Object.entries(PRICE_LOOKUP)) {
      const [plan, interval] = k.split('_');
      expect(planFromLookupKey(v)).toEqual({ plan, interval });
    }
    expect(planFromLookupKey('fincapro_inicial_month')).toBeNull();
    expect(planFromLookupKey(null)).toBeNull();
  });
});
