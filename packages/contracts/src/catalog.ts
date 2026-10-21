import { z } from 'zod';

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const money = z.coerce
  .number()
  .min(0)
  .max(1e10)
  .nullish()
  .transform((v) => v ?? null);
const quantity = z.coerce
  .number()
  .min(0)
  .max(1e12)
  .refine((v) => Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6, 'Máximo 3 decimales');

// ── Unidades ──────────────────────────────────────────────────────────────
export const unitInputSchema = z.object({
  code: text(16)
    .min(1)
    .regex(/^[a-z0-9_-]+$/i, 'Solo letras, números, - y _'),
  name: text(60).min(1),
  symbol: text(12).min(1),
  decimals: z.coerce.number().int().min(0).max(3).default(0),
});
export type UnitInput = z.infer<typeof unitInputSchema>;
export interface Unit extends UnitInput {
  id: string;
}

// ── Categorías ────────────────────────────────────────────────────────────
export const attributeDefinitionSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, 'Clave inválida'),
  label: text(60).min(1),
  type: z.enum(['text', 'number', 'boolean', 'select']),
  unit: text(12).optional(),
  required: z.boolean().optional(),
  options: z.array(text(60).min(1)).max(50).optional(),
});

export const categoryInputSchema = z.object({
  name: text(80).min(1),
  parentId: z
    .string()
    .uuid()
    .nullish()
    .transform((v) => v ?? null),
  description: optionalText(500),
  attributes: z.array(attributeDefinitionSchema).max(40).default([]),
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;
export interface Category {
  id: string;
  name: string;
  parentId: string | null;
  description: string | null;
  attributes: z.infer<typeof attributeDefinitionSchema>[];
  itemCount: number;
  version: number;
}

// ── Proveedores ───────────────────────────────────────────────────────────
export const supplierInputSchema = z.object({
  name: text(120).min(1),
  contactName: optionalText(120),
  email: z
    .email()
    .max(254)
    .nullish()
    .or(z.literal(''))
    .transform((v) => (v ? v : null)),
  phone: optionalText(40),
  website: optionalText(200),
  notes: optionalText(1000),
});
export type SupplierInput = z.infer<typeof supplierInputSchema>;
export interface Supplier extends SupplierInput {
  id: string;
  version: number;
}

// ── Artículos ─────────────────────────────────────────────────────────────
export const itemInputSchema = z.object({
  sku: text(64)
    .min(1)
    .regex(/^[A-Za-z0-9._\-/]+$/, 'SKU: letras, números y . _ - /'),
  internalCode: optionalText(64),
  name: text(200).min(1),
  description: optionalText(4000),
  categoryId: z
    .string()
    .uuid()
    .nullish()
    .transform((v) => v ?? null),
  unitId: z.string().uuid(),
  manufacturer: optionalText(120),
  model: optionalText(120),
  cost: money,
  price: money,
  minStock: quantity.nullish().transform((v) => v ?? null),
  attributes: z.record(z.string(), z.unknown()).default({}),
  supplierIds: z.array(z.string().uuid()).max(20).default([]),
});
export type ItemInput = z.input<typeof itemInputSchema>;

export const itemUpdateSchema = itemInputSchema.extend({ version: z.coerce.number().int().min(1) });
export type ItemUpdate = z.input<typeof itemUpdateSchema>;

export interface Item {
  id: string;
  sku: string;
  internalCode: string | null;
  name: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  unitId: string;
  unitSymbol: string;
  manufacturer: string | null;
  model: string | null;
  cost: number | null;
  price: number | null;
  minStock: number | null;
  attributes: Record<string, string | number | boolean>;
  supplierIds: string[];
  qrCode: string;
  /** Primera fotografía (portada) o null. */
  coverPhotoId: string | null;
  onHand: number;
  reserved: number;
  available: number;
  lowStock: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export const itemListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  categoryId: z.string().uuid().optional(),
  lowStock: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});
export type ItemListQuery = z.input<typeof itemListQuerySchema>;

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
