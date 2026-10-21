import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

describe('loadEnv', () => {
  it('aplica valores por defecto', () => {
    const env = loadEnv({});
    expect(env.PORT).toBe(3000);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:4200']);
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it('separa orígenes CORS', () => {
    expect(loadEnv({ CORS_ORIGINS: 'http://a.test, http://b.test' }).CORS_ORIGINS).toEqual([
      'http://a.test',
      'http://b.test',
    ]);
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
