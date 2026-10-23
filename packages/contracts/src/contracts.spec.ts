import { describe, expect, it } from 'vitest';
import { decodeQrReference, encodeQrReference, generateShortCode, qrUrl } from './qr.js';
import { paginationQuerySchema } from './common.js';

describe('referencias QR', () => {
  it('codifica y decodifica de forma reversible', () => {
    const code = generateShortCode();
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/);
    const payload = encodeQrReference({ type: 'location', code });
    expect(payload).toBe(`silo:location/${code}`);
    expect(decodeQrReference(payload)).toEqual({ type: 'location', code });
  });

  it('genera y lee el enlace impreso en la etiqueta', () => {
    const code = generateShortCode();
    const url = qrUrl('http://192.168.1.20:8080/', { type: 'location', code });
    expect(url).toBe(`http://192.168.1.20:8080/q/u/${code}`);
    expect(decodeQrReference(url)).toEqual({ type: 'location', code });
    expect(decodeQrReference(`https://silo.test/q/a/${code.toLowerCase()}`)).toEqual({
      type: 'item',
      code,
    });
    expect(decodeQrReference('https://silo.test/q/x/0123456789')).toBeNull();
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

describe('importación', () => {
  it('lee números escritos de varias formas', async () => {
    const { parseImportNumber } = await import('./import.js');
    expect(parseImportNumber('1,5')).toBe(1.5);
    expect(parseImportNumber('$1,234.50')).toBe(1234.5);
    expect(parseImportNumber('1.234,50')).toBe(1234.5);
    expect(parseImportNumber('1 200')).toBe(1200);
    expect(parseImportNumber('12,000')).toBe(12000);
    expect(parseImportNumber('')).toBeNull();
    expect(parseImportNumber(7)).toBe(7);
    expect(parseImportNumber('diez')).toBeNaN();
  });

  it('reconoce encabezados comunes', async () => {
    const { guessImportField } = await import('./import.js');
    expect(guessImportField('SKU')).toBe('sku');
    expect(guessImportField(' Unidad de medida ')).toBe('unit');
    expect(guessImportField('Categoría*')).toBe('category');
    expect(guessImportField('Marca')).toBe('manufacturer');
    expect(guessImportField('Cantidad (entrada)')).toBe('quantity');
    expect(guessImportField('Columna rara')).toBeNull();
  });
});
