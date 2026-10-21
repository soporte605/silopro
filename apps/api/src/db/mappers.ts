/** Convierte NUMERIC (texto) a número; `null` se conserva. */
export function num(v: string | null | undefined): number | null {
  return v == null ? null : Number(v);
}

export function num0(v: string | null | undefined): number {
  return v == null ? 0 : Number(v);
}

export function iso(d: Date | string): string {
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}
