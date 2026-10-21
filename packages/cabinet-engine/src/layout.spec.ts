import { describe, expect, it } from 'vitest';
import {
  buildCellIndex,
  cellAddress,
  createGridLayout,
  indexToLetters,
  LayoutError,
  lettersToIndex,
  mergeCompartments,
  resizeLayout,
  assertCanonicalLayout,
  splitCompartment,
  validateLayout,
} from './layout.js';

describe('indexToLetters / lettersToIndex', () => {
  it('convierte índices en letras estilo hoja de cálculo', () => {
    expect(indexToLetters(0)).toBe('A');
    expect(indexToLetters(25)).toBe('Z');
    expect(indexToLetters(26)).toBe('AA');
    expect(indexToLetters(701)).toBe('ZZ');
  });

  it('es reversible', () => {
    for (let i = 0; i < 1000; i++) expect(lettersToIndex(indexToLetters(i))).toBe(i);
  });

  it('rechaza entradas inválidas', () => {
    expect(() => indexToLetters(-1)).toThrow(LayoutError);
    expect(() => lettersToIndex('a1')).toThrow(LayoutError);
  });
});

describe('cellAddress', () => {
  it('soporta los tres esquemas', () => {
    expect(cellAddress(2, 3, 10, 'row-letter')).toBe('C4');
    expect(cellAddress(2, 3, 10, 'column-letter')).toBe('D3');
    expect(cellAddress(2, 3, 10, 'numeric')).toBe('3-4');
  });

  it('permite numerar filas desde abajo', () => {
    expect(cellAddress(0, 0, 10, 'row-letter', 'bottom')).toBe('J1');
    expect(cellAddress(9, 0, 10, 'row-letter', 'bottom')).toBe('A1');
  });
});

describe('createGridLayout', () => {
  it('crea un compartimento por celda', () => {
    const layout = createGridLayout({ rows: 4, columns: 8 });
    expect(layout.compartments).toHaveLength(32);
    expect(layout.compartments[0]?.address).toBe('A1');
    expect(layout.compartments.at(-1)?.address).toBe('D8');
    expect(() => validateLayout(layout)).not.toThrow();
  });

  it('rechaza dimensiones fuera de rango', () => {
    expect(() => createGridLayout({ rows: 0, columns: 3 })).toThrow(LayoutError);
    expect(() => createGridLayout({ rows: 3, columns: 201 })).toThrow(LayoutError);
    expect(() => createGridLayout({ rows: 2.5, columns: 3 })).toThrow(LayoutError);
  });

  it('maneja gabinetes grandes con rapidez', () => {
    const start = Date.now();
    const layout = createGridLayout({ rows: 200, columns: 200 });
    buildCellIndex(layout);
    expect(layout.compartments).toHaveLength(40_000);
    expect(Date.now() - start).toBeLessThan(1000);
  });
});

describe('mergeCompartments / splitCompartment', () => {
  it('fusiona un rectángulo completo en un compartimento', () => {
    const layout = mergeCompartments(createGridLayout({ rows: 3, columns: 3 }), {
      row: 0,
      column: 0,
      rowSpan: 1,
      columnSpan: 2,
    });
    expect(layout.compartments).toHaveLength(8);
    const merged = layout.compartments.find((c) => c.id === 'A1');
    expect(merged).toMatchObject({ rowSpan: 1, columnSpan: 2 });
    const index = buildCellIndex(layout);
    expect(index[0]).toBe('A1');
    expect(index[1]).toBe('A1');
  });

  it('impide cortar un compartimento existente', () => {
    const base = mergeCompartments(createGridLayout({ rows: 3, columns: 3 }), {
      row: 0,
      column: 0,
      rowSpan: 2,
      columnSpan: 2,
    });
    expect(() => mergeCompartments(base, { row: 1, column: 1, rowSpan: 1, columnSpan: 2 })).toThrow(
      /corta un compartimento/,
    );
  });

  it('detecta superposiciones', () => {
    const layout = createGridLayout({ rows: 2, columns: 2 });
    layout.compartments[0] = { ...layout.compartments[0]!, columnSpan: 2 };
    expect(() => validateLayout(layout)).toThrow(/superponen/);
  });

  it('dividir revierte una fusión', () => {
    const base = createGridLayout({ rows: 3, columns: 3 });
    const merged = mergeCompartments(base, { row: 1, column: 1, rowSpan: 2, columnSpan: 2 });
    const split = splitCompartment(merged, 'B2');
    expect(split.compartments).toEqual(base.compartments);
  });
});

describe('resizeLayout', () => {
  it('conserva los compartimentos interiores y rellena las celdas nuevas', () => {
    const merged = mergeCompartments(createGridLayout({ rows: 2, columns: 2 }), {
      row: 0,
      column: 0,
      rowSpan: 1,
      columnSpan: 2,
    });
    const grown = resizeLayout(merged, 3, 3);
    expect(grown.compartments.find((c) => c.id === 'A1')?.columnSpan).toBe(2);
    expect(grown.compartments).toHaveLength(8);
    expect(() => assertCanonicalLayout(grown)).not.toThrow();
  });

  it('elimina lo que queda fuera y rechaza cortar un compartimento', () => {
    const base = createGridLayout({ rows: 3, columns: 3 });
    expect(resizeLayout(base, 2, 2).compartments.map((c) => c.id)).toEqual([
      'A1',
      'A2',
      'B1',
      'B2',
    ]);
    const wide = mergeCompartments(base, { row: 0, column: 1, rowSpan: 1, columnSpan: 2 });
    expect(() => resizeLayout(wide, 3, 2)).toThrow(LayoutError);
  });

  it('re-direcciona si las filas se numeran desde abajo', () => {
    const base = createGridLayout({ rows: 2, columns: 1, rowOrigin: 'bottom' });
    expect(base.compartments[0]!.id).toBe('B1');
    expect(resizeLayout(base, 3, 1).compartments.map((c) => c.id)).toEqual(['C1', 'B1', 'A1']);
  });
});

describe('assertCanonicalLayout', () => {
  it('rechaza ids que no corresponden a su celda y huecos', () => {
    const base = createGridLayout({ rows: 2, columns: 2 });
    const renamed = {
      ...base,
      compartments: base.compartments.map((c, i) => (i === 0 ? { ...c, id: 'X9' } : c)),
    };
    expect(() => assertCanonicalLayout(renamed)).toThrow(LayoutError);
    const holes = { ...base, compartments: base.compartments.slice(1) };
    expect(() => assertCanonicalLayout(holes)).toThrow(LayoutError);
    expect(() => assertCanonicalLayout(base)).not.toThrow();
  });
});
