import { z } from 'zod';
import { locationInputSchema } from './stock.js';

/** Límites de un gabinete guardado (el motor admite más; esto acota la carga). */
export const CABINET_MAX_ROWS = 60;
export const CABINET_MAX_COLUMNS = 60;

export const ADDRESSING_VALUES = ['row-letter', 'column-letter', 'numeric'] as const;
export const ROW_ORIGIN_VALUES = ['top', 'bottom'] as const;

/** Crea la ubicación de tipo gabinete y un cajón por celda. */
export const cabinetInputSchema = z.object({
  parentId: z.string().uuid('Elija dónde está el gabinete'),
  code: locationInputSchema.shape.code,
  name: locationInputSchema.shape.name,
  rows: z.coerce.number().int().min(1).max(CABINET_MAX_ROWS),
  columns: z.coerce.number().int().min(1).max(CABINET_MAX_COLUMNS),
  addressing: z.enum(ADDRESSING_VALUES).default('row-letter'),
  rowOrigin: z.enum(ROW_ORIGIN_VALUES).default('top'),
});
export type CabinetInput = z.input<typeof cabinetInputSchema>;

/** Dirección de un cajón (A1, B12, 3-4); es también su código de ubicación. */
export const compartmentIdSchema = z.string().regex(/^[A-Z0-9-]{1,16}$/);

const span = z.number().int().min(1).max(Math.max(CABINET_MAX_ROWS, CABINET_MAX_COLUMNS));
export const compartmentSchema = z.object({
  id: compartmentIdSchema,
  row: z.number().int().min(0),
  column: z.number().int().min(0),
  rowSpan: span,
  columnSpan: span,
  address: compartmentIdSchema,
});

/**
 * Guarda el diseño completo (tamaño y compartimentos). El esquema de
 * direccionamiento se fija al crear el gabinete y no cambia aquí.
 */
export const cabinetLayoutUpdateSchema = z.object({
  version: z.coerce.number().int().min(1),
  rows: z.number().int().min(1).max(CABINET_MAX_ROWS),
  columns: z.number().int().min(1).max(CABINET_MAX_COLUMNS),
  compartments: z
    .array(compartmentSchema)
    .min(1)
    .max(CABINET_MAX_ROWS * CABINET_MAX_COLUMNS),
});
export type CabinetLayoutUpdate = z.input<typeof cabinetLayoutUpdateSchema>;

export const compartmentRenameSchema = z.object({
  name: locationInputSchema.shape.name,
});

export interface CabinetSummary {
  id: string;
  locationId: string;
  code: string;
  name: string;
  path: string;
  rows: number;
  columns: number;
  compartmentCount: number;
  occupiedCount: number;
  version: number;
  updatedAt: string;
}

export type CompartmentState = 'empty' | 'stocked' | 'low';

export interface CabinetCompartment {
  id: string;
  row: number;
  column: number;
  rowSpan: number;
  columnSpan: number;
  address: string;
  locationId: string;
  name: string;
  qrCode: string;
  itemCount: number;
  state: CompartmentState;
}

export interface Cabinet extends CabinetSummary {
  addressing: (typeof ADDRESSING_VALUES)[number];
  rowOrigin: (typeof ROW_ORIGIN_VALUES)[number];
  qrCode: string;
  compartments: CabinetCompartment[];
}

/** Existencias de un gabinete, una fila por artículo y cajón. */
export interface CabinetStockEntry {
  locationId: string;
  itemId: string;
  sku: string;
  itemName: string;
  onHand: number;
  unitSymbol: string;
  lowStock: boolean;
}
