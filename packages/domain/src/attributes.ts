/**
 * Atributos personalizados por categoría.
 *
 * Cada categoría define una lista de atributos (valor, tolerancia, potencia
 * para una resistencia; marca, refrigerante para una refacción de
 * refrigeración...). Los artículos guardan sus valores en un objeto JSON que
 * se valida contra esa definición. Así el esquema de base de datos no está
 * atado a ningún giro (electrónica, mecánica, laboratorio...).
 */

export const ATTRIBUTE_TYPES = ['text', 'number', 'boolean', 'select'] as const;
export type AttributeType = (typeof ATTRIBUTE_TYPES)[number];

export interface AttributeDefinition {
  /** Clave estable en minúsculas: `tolerancia`, `voltaje_max`. */
  key: string;
  label: string;
  type: AttributeType;
  /** Unidad mostrada junto al valor numérico (Ω, V, mm...). */
  unit?: string;
  required?: boolean;
  /** Opciones permitidas para `select`. */
  options?: string[];
}

export type AttributeValues = Record<string, string | number | boolean>;

export interface AttributeIssue {
  key: string;
  message: string;
}

export const ATTRIBUTE_KEY = /^[a-z][a-z0-9_]{0,39}$/;
export const MAX_ATTRIBUTES = 40;

/** Valida la propia definición (al crear o editar una categoría). */
export function validateAttributeDefinitions(
  defs: readonly AttributeDefinition[],
): AttributeIssue[] {
  const issues: AttributeIssue[] = [];
  if (defs.length > MAX_ATTRIBUTES) {
    issues.push({ key: '*', message: `Máximo ${MAX_ATTRIBUTES} atributos por categoría` });
  }
  const seen = new Set<string>();
  for (const d of defs) {
    if (!ATTRIBUTE_KEY.test(d.key)) {
      issues.push({ key: d.key, message: 'Clave inválida: use minúsculas, números y guion bajo' });
    }
    if (seen.has(d.key)) issues.push({ key: d.key, message: 'Clave duplicada' });
    seen.add(d.key);
    if (d.type === 'select' && (!d.options || d.options.length === 0)) {
      issues.push({ key: d.key, message: 'Una lista de selección necesita opciones' });
    }
  }
  return issues;
}

/**
 * Combina atributos heredados: una subcategoría hereda los atributos de sus
 * ancestros y puede añadir los suyos. `chain` va de la raíz a la hoja.
 */
export function effectiveAttributes(
  chain: readonly (readonly AttributeDefinition[])[],
): AttributeDefinition[] {
  const byKey = new Map<string, AttributeDefinition>();
  for (const defs of chain) for (const d of defs) byKey.set(d.key, d);
  return [...byKey.values()];
}

/**
 * Valida y normaliza valores contra las definiciones. Devuelve los valores
 * limpios (sin claves desconocidas, números convertidos) o la lista de problemas.
 */
export function validateAttributeValues(
  defs: readonly AttributeDefinition[],
  input: Record<string, unknown>,
): { values: AttributeValues; issues: AttributeIssue[] } {
  const values: AttributeValues = {};
  const issues: AttributeIssue[] = [];
  const known = new Set(defs.map((d) => d.key));

  for (const key of Object.keys(input)) {
    if (!known.has(key)) issues.push({ key, message: 'Atributo no definido en la categoría' });
  }

  for (const d of defs) {
    const raw = input[d.key];
    const empty = raw === undefined || raw === null || raw === '';
    if (empty) {
      if (d.required) issues.push({ key: d.key, message: `${d.label} es obligatorio` });
      continue;
    }
    switch (d.type) {
      case 'text':
        if (typeof raw !== 'string' || raw.length > 500) {
          issues.push({ key: d.key, message: `${d.label} debe ser texto (máx. 500)` });
        } else values[d.key] = raw.trim();
        break;
      case 'number': {
        const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
        if (!Number.isFinite(n))
          issues.push({ key: d.key, message: `${d.label} debe ser numérico` });
        else values[d.key] = n;
        break;
      }
      case 'boolean':
        if (typeof raw !== 'boolean')
          issues.push({ key: d.key, message: `${d.label} debe ser sí/no` });
        else values[d.key] = raw;
        break;
      case 'select':
        if (typeof raw !== 'string' || !d.options?.includes(raw)) {
          issues.push({ key: d.key, message: `${d.label}: opción no válida` });
        } else values[d.key] = raw;
        break;
    }
  }
  return { values, issues };
}
