import { describe, expect, it } from 'vitest';
import { compactSearchText, matchesSearch, searchTerms } from './search.js';

describe('búsqueda de «¿dónde está?»', () => {
  it('ignora mayúsculas, acentos, espacios y signos', () => {
    expect(compactSearchText('ESP-32 DevKit')).toBe('esp32devkit');
    expect(compactSearchText('Relé de 5 V, Ñandú')).toBe('relede5vnandu');
  });

  it('separa términos y descarta vacíos y repetidos', () => {
    expect(searchTerms('  esp  32 ')).toEqual(['esp', '32']);
    expect(searchTerms('ESP32 esp32 -- ')).toEqual(['esp32']);
    expect(searchTerms('   ')).toEqual([]);
  });

  it('exige todos los términos, en cualquier orden', () => {
    expect(matchesSearch('ESP32-WROOM Espressif', searchTerms('espressif esp 32'))).toBe(true);
    expect(matchesSearch('ESP32-WROOM Espressif', searchTerms('esp8266'))).toBe(false);
    expect(matchesSearch('Placa WiFi', searchTerms('placa wi-fi'))).toBe(true);
    expect(matchesSearch('Lo que sea', [])).toBe(false);
  });
});
