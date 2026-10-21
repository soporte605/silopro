import { describe, expect, it } from 'vitest';
import {
  type AttributeDefinition,
  effectiveAttributes,
  validateAttributeDefinitions,
  validateAttributeValues,
} from './attributes.js';
import { can } from './permissions.js';

const resistor: AttributeDefinition[] = [
  { key: 'resistencia', label: 'Resistencia', type: 'number', unit: 'Ω', required: true },
  { key: 'tolerancia', label: 'Tolerancia', type: 'select', options: ['1%', '5%'] },
  { key: 'smd', label: 'SMD', type: 'boolean' },
  { key: 'encapsulado', label: 'Encapsulado', type: 'text' },
];

describe('validateAttributeDefinitions', () => {
  it('acepta definiciones correctas', () => {
    expect(validateAttributeDefinitions(resistor)).toEqual([]);
  });
  it('detecta claves inválidas, duplicadas y selects sin opciones', () => {
    const issues = validateAttributeDefinitions([
      { key: 'Mal Clave', label: 'x', type: 'text' },
      { key: 'a', label: 'a', type: 'text' },
      { key: 'a', label: 'a', type: 'text' },
      { key: 'b', label: 'b', type: 'select' },
    ]);
    expect(issues.map((i) => i.message)).toEqual([
      expect.stringContaining('Clave inválida'),
      'Clave duplicada',
      expect.stringContaining('opciones'),
    ]);
  });
});

describe('validateAttributeValues', () => {
  it('normaliza valores válidos', () => {
    const r = validateAttributeValues(resistor, {
      resistencia: '10000',
      tolerancia: '5%',
      smd: false,
      encapsulado: ' 0805 ',
    });
    expect(r.issues).toEqual([]);
    expect(r.values).toEqual({
      resistencia: 10000,
      tolerancia: '5%',
      smd: false,
      encapsulado: '0805',
    });
  });

  it('reporta obligatorios, tipos, opciones y claves desconocidas', () => {
    const r = validateAttributeValues(resistor, { tolerancia: '20%', smd: 'si', color: 'rojo' });
    expect(r.issues.map((i) => i.key).sort()).toEqual([
      'color',
      'resistencia',
      'smd',
      'tolerancia',
    ]);
  });

  it('funciona para giros no electrónicos', () => {
    const refrigeracion: AttributeDefinition[] = [
      { key: 'refrigerante', label: 'Refrigerante', type: 'select', options: ['R-134a', 'R-410A'] },
      { key: 'capacidad_btu', label: 'Capacidad', type: 'number', unit: 'BTU' },
    ];
    expect(
      validateAttributeValues(refrigeracion, { refrigerante: 'R-410A', capacidad_btu: 12000 })
        .issues,
    ).toEqual([]);
  });
});

describe('effectiveAttributes', () => {
  it('hereda atributos de categorías padre y permite sobrescribir', () => {
    const parent: AttributeDefinition[] = [{ key: 'marca', label: 'Marca', type: 'text' }];
    const child: AttributeDefinition[] = [
      { key: 'marca', label: 'Fabricante', type: 'text', required: true },
      { key: 'voltaje', label: 'Voltaje', type: 'number' },
    ];
    const eff = effectiveAttributes([parent, child]);
    expect(eff).toHaveLength(2);
    expect(eff[0]).toMatchObject({ key: 'marca', label: 'Fabricante', required: true });
  });
});

describe('permisos', () => {
  it('asigna permisos por rol', () => {
    expect(can('viewer', 'catalog.read')).toBe(true);
    expect(can('viewer', 'catalog.write')).toBe(false);
    expect(can('operator', 'stock.move')).toBe(true);
    expect(can('operator', 'stock.adjust')).toBe(false);
    expect(can('admin', 'stock.negative')).toBe(false);
    expect(can('owner', 'stock.negative')).toBe(true);
  });
});
