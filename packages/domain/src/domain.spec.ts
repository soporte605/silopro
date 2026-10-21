import { describe, expect, it } from 'vitest';
import { checkPlacement, type LocationNodeRef } from './locations.js';
import {
  applyDelta,
  available,
  fromScaled,
  isLowStock,
  release,
  reserve,
  shortage,
  StockError,
  toScaled,
} from './stock.js';

describe('checkPlacement', () => {
  const wh: LocationNodeRef = { id: 'w', kind: 'warehouse', parentId: null };
  const cab: LocationNodeRef = { id: 'c', kind: 'cabinet', parentId: 'w' };

  it('solo admite almacenes como raíz', () => {
    expect(checkPlacement({ kind: 'warehouse' }, null)).toBeNull();
    expect(checkPlacement({ kind: 'drawer' }, null)).toEqual({ code: 'ROOT_MUST_BE_WAREHOUSE' });
  });

  it('valida tipos de hijo', () => {
    expect(checkPlacement({ kind: 'cabinet' }, wh, [wh])).toBeNull();
    expect(checkPlacement({ kind: 'drawer' }, cab, [cab, wh])).toBeNull();
    expect(checkPlacement({ kind: 'warehouse' }, cab, [cab, wh])).toMatchObject({
      code: 'CHILD_KIND_NOT_ALLOWED',
    });
  });

  it('permite ubicaciones que no son gabinetes', () => {
    const shelving: LocationNodeRef = { id: 's', kind: 'shelving', parentId: 'w' };
    expect(checkPlacement({ kind: 'shelving' }, wh, [wh])).toBeNull();
    expect(checkPlacement({ kind: 'box' }, shelving, [shelving, wh])).toBeNull();
  });

  it('detecta ciclos al mover nodos', () => {
    const zone: LocationNodeRef = { id: 'z', kind: 'zone', parentId: 'w' };
    const sub: LocationNodeRef = { id: 'z2', kind: 'zone', parentId: 'z' };
    expect(checkPlacement({ id: 'z', kind: 'zone' }, sub, [sub, zone, wh])).toEqual({
      code: 'CYCLE',
    });
  });

  it('limita la profundidad', () => {
    const chain: LocationNodeRef[] = Array.from({ length: 12 }, (_, i) => ({
      id: `b${i}`,
      kind: 'box',
      parentId: i === 0 ? null : `b${i - 1}`,
    }));
    expect(checkPlacement({ kind: 'box' }, chain[0]!, chain)).toMatchObject({
      code: 'MAX_DEPTH_EXCEEDED',
    });
  });
});

describe('stock', () => {
  it('escala cantidades sin errores de punto flotante', () => {
    expect(toScaled(0.1) + toScaled(0.2)).toBe(toScaled(0.3));
    expect(fromScaled(toScaled(2.5))).toBe(2.5);
    expect(() => toScaled(Number.NaN)).toThrow(StockError);
  });

  it('impide existencias negativas sin autorización', () => {
    expect(() => applyDelta({ onHand: 5, reserved: 0 }, -6)).toThrow(/insuficientes/);
    expect(applyDelta({ onHand: 5, reserved: 0 }, -6, { allowNegative: true }).onHand).toBe(-1);
  });

  it('protege la cantidad reservada', () => {
    const level = reserve({ onHand: 10, reserved: 0 }, 7);
    expect(available(level)).toBe(3);
    expect(() => applyDelta(level, -4)).toThrow(/reservada/);
    expect(applyDelta(level, -3).onHand).toBe(7);
    expect(release(level, 7)).toEqual({ onHand: 10, reserved: 0 });
    expect(() => reserve(level, 4)).toThrow(StockError);
  });

  it('calcula faltantes y stock bajo', () => {
    expect(shortage(10, 4)).toBe(6);
    expect(shortage(3, 10)).toBe(0);
    expect(shortage(3, -2)).toBe(3);
    expect(isLowStock(5, 5)).toBe(true);
    expect(isLowStock(6, 5)).toBe(false);
    expect(isLowStock(0, null)).toBe(false);
  });
});
