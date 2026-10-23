import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from './csv';

describe('CSV', () => {
  it('lee comas, comillas, saltos de línea y BOM', () => {
    expect(
      parseCsv(
        '\uFEFFsku,nombre\r\nA-1,"Tornillo, M3"\r\nA-2,"Dice ""hola""\nen dos líneas"\r\n\r\n',
      ),
    ).toEqual([
      ['sku', 'nombre'],
      ['A-1', 'Tornillo, M3'],
      ['A-2', 'Dice "hola"\nen dos líneas'],
    ]);
  });

  it('detecta el punto y coma de Excel en español', () => {
    expect(parseCsv('sku;costo\nA-1;1,5')).toEqual([
      ['sku', 'costo'],
      ['A-1', '1,5'],
    ]);
  });

  it('escribe un CSV que se vuelve a leer igual', () => {
    const rows = [
      ['SKU', 'Nombre'],
      ['B-1', 'Cable "dupont", 20 cm'],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});
