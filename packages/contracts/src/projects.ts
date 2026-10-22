import { z } from 'zod';
import type { Reservation } from './stock.js';

// ── Proyectos y lista de materiales (BOM) ───────────────────────────────────

export const PROJECT_STATUS_VALUES = ['draft', 'active', 'done', 'cancelled'] as const;
export type ProjectStatus = (typeof PROJECT_STATUS_VALUES)[number];

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: 'Borrador',
  active: 'En curso',
  done: 'Terminado',
  cancelled: 'Cancelado',
};

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const qty = z.coerce
  .number()
  .positive('La cantidad debe ser mayor que cero')
  .max(1e12)
  .refine((v) => Math.abs(v * 1000 - Math.round(v * 1000)) < 1e-6, 'Máximo 3 decimales');

export const projectInputSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[A-Za-z0-9._\-/]+$/, 'Código: letras, números y . _ - /'),
  name: z.string().trim().min(1).max(200),
  description: optionalText(2000),
  status: z.enum(PROJECT_STATUS_VALUES).default('active'),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha AAAA-MM-DD')
    .nullish()
    .or(z.literal(''))
    .transform((v) => (v ? v : null)),
});
export type ProjectInput = z.input<typeof projectInputSchema>;

/** Agrega un artículo a la lista de materiales (o suma si ya está). */
export const bomLineInputSchema = z.object({
  itemId: z.string().uuid('Elija un artículo'),
  quantity: qty,
  notes: optionalText(500),
});
export type BomLineInput = z.input<typeof bomLineInputSchema>;

export const bomLineUpdateSchema = z.object({
  quantity: qty,
  notes: optionalText(500),
});
export type BomLineUpdate = z.input<typeof bomLineUpdateSchema>;

export interface ProjectSummary {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  dueDate: string | null;
  lineCount: number;
  /** Líneas a las que les falta material aun contando lo disponible en almacén. */
  shortageCount: number;
  /** Líneas ya cubiertas por lo consumido y lo reservado para el proyecto. */
  coveredCount: number;
  createdByName: string;
  createdAt: string;
  version: number;
}

/** Dónde hay existencias libres de un artículo. */
export interface BomSource {
  locationId: string;
  locationPath: string;
  cabinetId: string | null;
  available: number;
}

/**
 * Estado de una línea de la lista de materiales:
 * `pending = max(required - consumed - reserved, 0)` y
 * `shortage = max(pending - available, 0)`.
 */
export interface BomLineStatus {
  id: string;
  itemId: string;
  sku: string;
  itemName: string;
  unitSymbol: string;
  notes: string | null;
  required: number;
  /** Consumido de reservas del proyecto. */
  consumed: number;
  /** Apartado para el proyecto y aún sin consumir. */
  reserved: number;
  /** Lo que falta apartar o consumir. */
  pending: number;
  /** Libre en todo el almacén (existencia menos lo reservado para cualquier uso). */
  available: number;
  /** Lo que habría que comprar o fabricar. */
  shortage: number;
  sources: BomSource[];
}

export interface ProjectDetail extends ProjectSummary {
  lines: BomLineStatus[];
  reservations: Reservation[];
}

/** Resultado de «Reservar todo lo disponible». */
export interface ReserveAllResult {
  project: ProjectDetail;
  /** Reservas creadas en esta operación. */
  created: number;
}
