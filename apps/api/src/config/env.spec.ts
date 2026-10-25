import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

const DB = 'postgres://u:p@localhost:5432/db';

describe('loadEnv', () => {
  it('aplica valores por defecto', () => {
    const env = loadEnv({ DATABASE_URL: DB });
    expect(env.PORT).toBe(3000);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:4200']);
    expect(env.SESSION_TTL_DAYS).toBe(14);
    expect(env.MIGRATE_ON_START).toBe(false);
  });

  it('trata las variables vacías como no definidas', () => {
    const env = loadEnv({ DATABASE_URL: DB, RESEND_API_KEY: '', STRIPE_SECRET_KEY: '' });
    expect(env.RESEND_API_KEY).toBeUndefined();
    expect(env.STRIPE_SECRET_KEY).toBeUndefined();
  });

  it('exige DATABASE_URL', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });

  it('separa orígenes CORS', () => {
    expect(
      loadEnv({ DATABASE_URL: DB, CORS_ORIGINS: 'http://a.test, http://b.test' }).CORS_ORIGINS,
    ).toEqual(['http://a.test', 'http://b.test']);
  });

  it('rechaza valores inválidos sin exponerlos', () => {
    expect(() => loadEnv({ PORT: 'abc', DATABASE_URL: 'mysql://secreto@x' })).toThrow(
      /PORT, DATABASE_URL/,
    );
    try {
      loadEnv({ DATABASE_URL: 'mysql://secreto@x' });
    } catch (e) {
      expect(String(e)).not.toContain('secreto');
    }
  });
});
