/** Campo CSV con comillas cuando hace falta; neutraliza fórmulas (=, +, -, @). */
export const csvField = (v: string | number | null): string => {
  let s = v === null ? '' : String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Tabla CSV con BOM para que Excel reconozca UTF-8 (acentos). */
export const csvTable = (head: string[], rows: (string | number | null)[][]): string =>
  '\uFEFF' +
  [head.map(csvField).join(','), ...rows.map((r) => r.map(csvField).join(','))].join('\r\n') +
  '\r\n';
