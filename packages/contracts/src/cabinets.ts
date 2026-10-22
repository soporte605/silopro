import { z } from 'zod';
import {
  type LOCATION_KIND_VALUES,
  locationInputSchema,
  type LocationStockEntry,
  maxItemsSchema,
} from './stock.js';

type LocationKind = (typeof LOCATION_KIND_VALUES)[number];

/** Límites de un gabinete guardado (el motor admite más; esto acota la carga). */
export const CABINET_MAX_ROWS = 60;
export const CABINET_MAX_COLUMNS = 60;

export const ADDRESSING_VALUES = ['row-letter', 'column-letter', 'numeric'] as const;
export const ROW_ORIGIN_VALUES = ['top', 'bottom'] as const;

/** Gabinete de cajones o anaquel de repisas con charolas (igual que en el motor). */
export const CABINET_STYLE_VALUES = ['drawers', 'shelves'] as const;
export type CabinetStyleValue = (typeof CABINET_STYLE_VALUES)[number];

/** Tipos de ubicación y nombres que usa cada mueble. */
export const CABINET_STYLE_INFO = {
  drawers: {
    containerKind: 'cabinet',
    cellKind: 'drawer',
    label: 'Gabinete',
    cell: 'cajón',
    cells: 'cajones',
    cellLabel: 'Cajón',
    aCell: 'un cajón',
    theCell: 'el cajón',
    ofCell: 'del cajón',
    ofContainer: 'del gabinete',
    emptyCell: 'Cajón vacío',
    savedCell: 'Cajón guardado',
    newCell: 'Este cajón es nuevo',
  },
  shelves: {
    containerKind: 'shelving',
    cellKind: 'bin',
    label: 'Anaquel',
    cell: 'charola',
    cells: 'charolas',
    cellLabel: 'Charola',
    aCell: 'una charola',
    theCell: 'la charola',
    ofCell: 'de la charola',
    ofContainer: 'del anaquel',
    emptyCell: 'Charola vacía',
    savedCell: 'Charola guardada',
    newCell: 'Esta charola es nueva',
  },
} as const satisfies Record<
  CabinetStyleValue,
  {
    containerKind: LocationKind;
    cellKind: LocationKind;
    label: string;
    cell: string;
    cells: string;
    cellLabel: string;
    aCell: string;
    theCell: string;
    ofCell: string;
    ofContainer: string;
    emptyCell: string;
    savedCell: string;
    newCell: string;
  }
>;

/** Si una ubicación de tipo `kind`, hija del mueble, es una de sus celdas. */
export const isCabinetCell = (cabinet: { style: string }, kind: string): boolean =>
  CABINET_STYLE_INFO[cabinet.style as CabinetStyleValue]?.cellKind === kind;

/**
 * Crea la ubicación del mueble (gabinete o anaquel) y un cajón o charola por
 * celda. En un anaquel cada fila es una repisa.
 */
export const cabinetInputSchema = z.object({
  style: z.enum(CABINET_STYLE_VALUES).default('drawers'),
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

export const compartmentUpdateSchema = z
  .object({
    name: locationInputSchema.shape.name.optional(),
    maxItems: maxItemsSchema.optional(),
  })
  .refine((v) => v.name !== undefined || v.maxItems !== undefined, 'Nada que actualizar');

/** Medidas físicas del gabinete en mm (ver `CabinetPhysicalSpec` del motor). */
export const cabinetPhysicalSchema = z.object({
  cellWidth: z.coerce.number().min(5).max(500),
  cellHeight: z.coerce.number().min(5).max(500),
  depth: z.coerce.number().min(10).max(1000),
  wallThickness: z.coerce.number().min(0.4).max(20),
});
export type CabinetPhysical = z.output<typeof cabinetPhysicalSchema>;

export const cabinetPhysicalUpdateSchema = cabinetPhysicalSchema.extend({
  version: z.coerce.number().int().min(1),
});
export type CabinetPhysicalUpdate = z.input<typeof cabinetPhysicalUpdateSchema>;

export interface CabinetSummary {
  id: string;
  locationId: string;
  /** Dónde está el gabinete (estante, zona…): agrupa la vista 3D de varios gabinetes. */
  parentId: string | null;
  style: CabinetStyleValue;
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

export type CompartmentState = 'empty' | 'stocked' | 'low' | 'full';

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
  maxItems: number | null;
  state: CompartmentState;
}

export interface Cabinet extends CabinetSummary {
  addressing: (typeof ADDRESSING_VALUES)[number];
  rowOrigin: (typeof ROW_ORIGIN_VALUES)[number];
  qrCode: string;
  physical: CabinetPhysical;
  compartments: CabinetCompartment[];
}

/** Existencias de un gabinete, una fila por artículo y cajón. */
export type CabinetStockEntry = LocationStockEntry;
