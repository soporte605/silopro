import { z } from 'zod';

export const LOCATION_KIND_VALUES = [
  'warehouse',
  'zone',
  'room',
  'shelving',
  'shelf',
  'cabinet',
  'drawer',
  'compartment',
  'box',
  'bin',
  'other',
] as const;

export const locationInputSchema = z.object({
  kind: z.enum(LOCATION_KIND_VALUES),
  code: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[A-Za-z0-9._-]+$/, 'Código: letras, números y . _ -'),
  name: z.string().trim().min(1).max(120),
  parentId: z
    .string()
    .uuid()
    .nullish()
    .transform((v) => v ?? null),
});
export type LocationInput = z.input<typeof locationInputSchema>;

export interface Location {
  id: string;
  kind: (typeof LOCATION_KIND_VALUES)[number];
  code: string;
  name: string;
  parentId: string | null;
  path: string;
  qrCode: string;
  /** Gabinete con diseño guardado (solo en ubicaciones de tipo gabinete). */
  cabinetId: string | null;
}

export const MOVEMENT_KIND_VALUES = ['receipt', 'issue', 'adjustment'] as const;

const qty = z.coerce
  .number()
  .positive('La cantidad debe ser mayor que cero')
  .max(1e12)
  .refine((v) => Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6, 'Máximo 3 decimales');

/**
 * Movimiento de existencias.
 * - receipt: entrada de `quantity` a `locationId`.
 * - issue: salida de `quantity` desde `locationId`.
 * - adjustment: fija la existencia física de `locationId` en `countedQuantity` (conteo).
 */
export const movementInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('receipt'),
    itemId: z.string().uuid(),
    locationId: z.string().uuid(),
    quantity: qty,
    reason: z.string().trim().max(500).optional(),
  }),
  z.object({
    kind: z.literal('issue'),
    itemId: z.string().uuid(),
    locationId: z.string().uuid(),
    quantity: qty,
    reason: z.string().trim().max(500).optional(),
  }),
  z.object({
    kind: z.literal('adjustment'),
    itemId: z.string().uuid(),
    locationId: z.string().uuid(),
    countedQuantity: z.coerce.number().min(0).max(1e12),
    reason: z.string().trim().min(1, 'Indique el motivo del ajuste').max(500),
  }),
]);
export type MovementInput = z.input<typeof movementInputSchema>;

export interface Movement {
  id: string;
  kind: 'receipt' | 'issue' | 'adjustment' | 'transfer' | 'consumption';
  itemId: string;
  locationId: string;
  locationPath: string;
  /** Cambio firmado en existencias físicas. */
  delta: number;
  reason: string | null;
  actorName: string;
  occurredAt: string;
}

export interface StockByLocation {
  locationId: string;
  locationPath: string;
  /** Gabinete al que pertenece el cajón, para abrirlo resaltado. */
  cabinetId: string | null;
  onHand: number;
  reserved: number;
  available: number;
}
