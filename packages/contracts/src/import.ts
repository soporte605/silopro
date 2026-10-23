import { z } from 'zod';

// ── Importación de artículos (CSV / Excel) ──────────────────────────────────

/** Campos que se pueden importar, con su nombre visible y encabezados reconocidos. */
export const IMPORT_FIELDS = [
  { key: 'sku', label: 'SKU', required: true, aliases: ['sku', 'clave', 'código', 'codigo'] },
  {
    key: 'name',
    label: 'Nombre',
    required: true,
    aliases: ['nombre', 'name', 'artículo', 'articulo', 'descripción corta', 'producto'],
  },
  {
    key: 'unit',
    label: 'Unidad',
    required: true,
    aliases: ['unidad', 'unit', 'um', 'u.m.', 'unidad de medida'],
  },
  {
    key: 'category',
    label: 'Categoría',
    required: false,
    aliases: ['categoría', 'categoria', 'category', 'familia'],
  },
  {
    key: 'internalCode',
    label: 'Código interno',
    required: false,
    aliases: ['código interno', 'codigo interno', 'internal code'],
  },
  {
    key: 'manufacturer',
    label: 'Fabricante',
    required: false,
    aliases: ['fabricante', 'marca', 'manufacturer', 'brand'],
  },
  {
    key: 'model',
    label: 'Modelo',
    required: false,
    aliases: ['modelo', 'model', 'número de parte', 'numero de parte', 'mpn'],
  },
  {
    key: 'description',
    label: 'Descripción',
    required: false,
    aliases: ['descripción', 'descripcion', 'description', 'notas'],
  },
  { key: 'cost', label: 'Costo', required: false, aliases: ['costo', 'cost', 'precio de compra'] },
  {
    key: 'price',
    label: 'Precio',
    required: false,
    aliases: ['precio', 'price', 'precio de venta'],
  },
  {
    key: 'minStock',
    label: 'Stock mínimo',
    required: false,
    aliases: ['mínimo', 'minimo', 'stock mínimo', 'stock minimo', 'min'],
  },
  {
    key: 'quantity',
    label: 'Cantidad (entrada)',
    required: false,
    aliases: ['cantidad', 'existencia', 'existencias', 'stock', 'qty', 'quantity'],
  },
  {
    key: 'location',
    label: 'Ubicación',
    required: false,
    aliases: ['ubicación', 'ubicacion', 'location', 'lugar', 'cajón', 'cajon'],
  },
] as const;

export type ImportFieldKey = (typeof IMPORT_FIELDS)[number]['key'];

export const MAX_IMPORT_ROWS = 2000;

const cell = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const num = z
  .number()
  .finite()
  .min(0)
  .max(1e12)
  .nullish()
  .transform((v) => v ?? null);

export const importRowSchema = z.object({
  sku: cell(64),
  name: cell(200),
  unit: cell(60),
  category: cell(200),
  internalCode: cell(64),
  manufacturer: cell(120),
  model: cell(120),
  description: cell(4000),
  cost: num,
  price: num,
  minStock: num,
  quantity: num,
  location: cell(400),
});
export type ImportRow = z.input<typeof importRowSchema>;

export const importRequestSchema = z.object({
  rows: z.array(importRowSchema).min(1, 'El archivo no tiene filas').max(MAX_IMPORT_ROWS),
  /** true: solo valida y dice qué haría. */
  dryRun: z.boolean().default(true),
  /** Si un SKU ya existe: actualizarlo (true) u omitir la fila (false). */
  updateExisting: z.boolean().default(true),
});
export type ImportRequest = z.input<typeof importRequestSchema>;

export interface ImportRowResult {
  /** Número de fila de datos, desde 1. */
  row: number;
  sku: string | null;
  action: 'create' | 'update' | 'skip' | 'error';
  errors: string[];
  /** Entrada de existencias que se registra con la fila. */
  stock: { quantity: number; locationPath: string } | null;
}

export interface ImportResult {
  dryRun: boolean;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  stockEntries: number;
  rows: ImportRowResult[];
}

/**
 * Convierte un número escrito a mano o exportado («1,5», «$1,234.50», «1 200»).
 * Devuelve null si está vacío y NaN si no es un número.
 */
export function parseImportNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  let s = String(v)
    .trim()
    .replace(/[\s$€]/g, '');
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) {
    // El último separador es el decimal.
    s =
      s.lastIndexOf(',') > s.lastIndexOf('.')
        ? s.replace(/\./g, '').replace(',', '.')
        : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  }
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : Number.NaN;
}

/** Busca el campo que corresponde a un encabezado del archivo. */
export function guessImportField(header: string): ImportFieldKey | null {
  const h = header.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[*:]$/, '');
  for (const f of IMPORT_FIELDS) {
    if (f.label.toLowerCase() === h || (f.aliases as readonly string[]).includes(h)) return f.key;
  }
  return null;
}
