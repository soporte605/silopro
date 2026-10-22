import { describe, expect, it } from 'vitest';
import { createGridLayout, mergeCompartments } from './layout.js';
import { cabinetSceneModel } from './scene.js';

const spec = { cellWidth: 40, cellHeight: 30, depth: 120, wallThickness: 2 };

describe('cabinetSceneModel', () => {
  it('centra el gabinete y coloca un cajón por compartimento', () => {
    const m = cabinetSceneModel(createGridLayout({ rows: 2, columns: 3 }), spec);
    expect(m.outer).toEqual({ width: 128, height: 66, depth: 122 });
    expect(m.drawers).toHaveLength(6);
    const a1 = m.drawers.find((d) => d.address === 'A1')!;
    // Arriba a la izquierda, con holgura de 0,5 mm por lado.
    expect(a1.front).toMatchObject({ width: 39, height: 29, depth: 2 });
    expect(a1.front.x).toBeCloseTo(-64 + 2 + 20);
    expect(a1.front.y).toBeCloseTo(33 - 2 - 15);
    expect(a1.front.z).toBeCloseTo(61 - 1);
    expect(a1.body.z + a1.body.depth / 2).toBeCloseTo(a1.front.z - 1);
    expect(a1.travel).toBe(84);
  });

  it('une paredes contiguas y omite separadores dentro de un cajón fusionado', () => {
    const grid = createGridLayout({ rows: 2, columns: 2 });
    const full = cabinetSceneModel(grid, spec);
    // Fondo + 3 horizontales + 3 verticales.
    expect(full.panels).toHaveLength(7);

    const merged = mergeCompartments(grid, { row: 0, column: 0, rowSpan: 1, columnSpan: 2 });
    const m = cabinetSceneModel(merged, spec);
    // El separador vertical central solo queda en la fila de abajo.
    const middle = m.panels.filter((p) => p.width === 2 && Math.abs(p.x) < 1e-9);
    expect(middle).toHaveLength(1);
    expect(middle[0]!.height).toBe(30 + 4);
    const wideId = merged.compartments.find((c) => c.columnSpan === 2)!.id;
    const wide = m.drawers.find((d) => d.id === wideId)!;
    expect(wide.front.width).toBe(2 * 40 + 2 - 1);
  });

  it('anaquel: abierto, con repisas y charolas bajas apoyadas en ellas', () => {
    const m = cabinetSceneModel(createGridLayout({ rows: 2, columns: 2 }), spec, 'shelves');
    // Sin fondo ni separador vertical central: 3 repisas + 2 laterales.
    expect(m.panels).toHaveLength(5);
    expect(m.panels.filter((p) => p.width === 2)).toHaveLength(2);
    const b1 = m.drawers.find((d) => d.address === 'B1')!;
    // Repisa de abajo: su cara superior está en y = -33 + 2.
    expect(b1.body.y - b1.body.height / 2).toBeCloseTo(-31);
    expect(b1.body.height).toBeCloseTo(30 * 0.4);
    expect(b1.front.height).toBe(b1.body.height);
    expect(b1.body.z + b1.body.depth / 2).toBeCloseTo(b1.front.z - 1);
  });
});
