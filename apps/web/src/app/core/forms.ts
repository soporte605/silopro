import type { ZodError } from 'zod';

/** Primer mensaje de error por campo, con la ruta unida por puntos. */
export function zodErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Convierte cadenas vacías de un formulario en null. */
export function blankToNull<T extends Record<string, unknown>>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = v === '' ? null : v;
  return out as T;
}
