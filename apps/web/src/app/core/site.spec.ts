import { describe, expect, it } from 'vitest';
import { landingUrl, siteKind } from './site';

describe('sitios públicos', () => {
  it('distingue la página comercial, la app y la red local', () => {
    expect(siteKind('silopro.elikarsystems.com')).toBe('landing');
    expect(siteKind('www.silopro.elikarsystems.com')).toBe('landing');
    expect(siteKind('app.silopro.elikarsystems.com')).toBe('app');
    expect(siteKind('localhost')).toBe('local');
    expect(siteKind('192.168.1.50')).toBe('local');
  });

  it('la página comercial tiene su dominio en el servidor y /producto en local', () => {
    expect(landingUrl('app')).toBe('https://silopro.elikarsystems.com');
    expect(landingUrl('local')).toBe('/producto');
  });
});
