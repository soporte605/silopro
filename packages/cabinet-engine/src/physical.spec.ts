import { describe, expect, it } from 'vitest';
import { ENDER_3_V3_KE, fitsPrintVolume, outerDimensions, planModules } from './physical.js';

const spec = { cellWidth: 40, cellHeight: 25, depth: 120, wallThickness: 2 };

describe('outerDimensions', () => {
  it('suma celdas y paredes', () => {
    expect(outerDimensions({ rows: 2, columns: 3 }, spec)).toEqual({
      width: 3 * 40 + 4 * 2,
      height: 2 * 25 + 3 * 2,
      depth: 122,
    });
  });
});

describe('fitsPrintVolume', () => {
  it('acepta piezas que caben con rotación', () => {
    expect(fitsPrintVolume({ width: 200, height: 230, depth: 100 }, ENDER_3_V3_KE)).toBe(true);
  });
  it('rechaza piezas demasiado grandes', () => {
    expect(fitsPrintVolume({ width: 300, height: 300, depth: 300 }, ENDER_3_V3_KE)).toBe(false);
  });
});

describe('planModules', () => {
  it('divide un gabinete grande en módulos imprimibles', () => {
    const plan = planModules({ rows: 20, columns: 10 }, spec);
    expect(plan).not.toBeNull();
    const dims = outerDimensions(
      { rows: plan!.rowsPerModule, columns: plan!.columnsPerModule },
      spec,
    );
    expect(fitsPrintVolume(dims, ENDER_3_V3_KE)).toBe(true);
    expect(plan!.modules).toBeGreaterThan(1);
  });

  it('devuelve null si ni una celda cabe', () => {
    expect(
      planModules({ rows: 1, columns: 1 }, { ...spec, depth: 500, cellWidth: 300 }),
    ).toBeNull();
  });
});
