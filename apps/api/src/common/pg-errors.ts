/** Código SQLSTATE de un error de PostgreSQL (puede venir envuelto por Drizzle). */
export function pgCode(e: unknown): string | undefined {
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur; i++) {
    const code = (cur as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}

export function isUniqueViolation(e: unknown): boolean {
  return pgCode(e) === '23505';
}
