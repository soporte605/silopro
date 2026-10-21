import { describe, expect, it } from 'vitest';
import { decodeQrReference, encodeQrReference, generateShortCode } from './qr.js';
import { paginationQuerySchema } from './common.js';

describe('referencias QR', () => {
  it('codifica y decodifica de forma reversible', () => {
    const code = generateShortCode();
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/);
    const payload = encodeQrReference({ type: 'location', code });
    expect(payload).toBe(`silo:location/${code}`);
    expect(decodeQrReference(payload)).toEqual({ type: 'location', code });
  });

  it('rechaza contenido ajeno o malformado', () => {
    expect(decodeQrReference('https://example.com')).toBeNull();
    expect(decodeQrReference('silo:user/0123456789')).toBeNull();
    expect(decodeQrReference('silo:item/ILOU000000')).toBeNull();
    expect(() => encodeQrReference({ type: 'item', code: 'corto' })).toThrow();
  });
});

describe('paginationQuerySchema', () => {
  it('aplica valores por defecto y límites', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(paginationQuerySchema.parse({ limit: '20' }).limit).toBe(20);
    expect(paginationQuerySchema.safeParse({ limit: 1000 }).success).toBe(false);
  });
});
