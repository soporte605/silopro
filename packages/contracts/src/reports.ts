import { z } from 'zod';

// ── Reportes operativos ─────────────────────────────────────────────────────

/** Valor del inventario por artículo: existencia × costo registrado. */
export interface ValuationRow {
  itemId: string;
  sku: string;
  itemName: string;
  categoryName: string | null;
  unitSymbol: string;
  onHand: number;
  reserved: number;
  unitCost: number | null;
  /** `onHand × unitCost` redondeado a centavos; `null` si no hay costo. */
  value: number | null;
}

export interface ValuationCategory {
  categoryName: string | null;
  itemCount: number;
  value: number;
  missingCost: number;
}

export interface ValuationReport {
  rows: ValuationRow[];
  /** De mayor a menor valor; «Sin categoría» al final si empata. */
  byCategory: ValuationCategory[];
  totalValue: number;
  /** Artículos con existencia pero sin costo (no entran en el total). */
  missingCost: number;
}

/** Lo que entró y salió de un artículo en el periodo (las transferencias no cambian el total). */
export interface MovementReportRow {
  itemId: string;
  sku: string;
  itemName: string;
  unitSymbol: string;
  /** Entradas (`receipt`). */
  received: number;
  /** Salidas y consumos de reservas, en positivo. */
  issued: number;
  /** Suma de los ajustes por conteo (puede ser negativa). */
  adjusted: number;
  /** Cantidad movida entre ubicaciones. */
  transferred: number;
  /** `received - issued + adjusted`. */
  net: number;
  movements: number;
  lastAt: string;
}

export interface MovementReport {
  from: string;
  to: string;
  rows: MovementReportRow[];
  totals: { received: number; issued: number; adjusted: number; movements: number };
}

/** Artículo con existencia que no se ha movido en el periodo indicado. */
export interface StaleRow {
  itemId: string;
  sku: string;
  itemName: string;
  unitSymbol: string;
  onHand: number;
  value: number | null;
  /** Último movimiento de cualquier tipo; `null` si nunca tuvo. */
  lastMovementAt: string | null;
}

export interface StaleReport {
  days: number;
  rows: StaleRow[];
  totalValue: number;
}

const isoDate = z.iso.date('Fecha AAAA-MM-DD');
const timeZone = z
  .string()
  .max(64)
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat('es', { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, 'Zona horaria desconocida');

/** Periodo del reporte de movimientos, en días completos de la zona horaria indicada. */
export const movementReportQuerySchema = z
  .object({
    from: isoDate,
    to: isoDate,
    tz: timeZone.default('UTC'),
  })
  .refine((q) => q.from <= q.to, { message: 'La fecha inicial va antes de la final', path: ['to'] })
  .refine((q) => Date.parse(q.to) - Date.parse(q.from) <= 366 * 86_400_000, {
    message: 'El periodo puede ser de hasta un año',
    path: ['to'],
  });
export type MovementReportQuery = z.input<typeof movementReportQuerySchema>;

export const staleReportQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(3650).default(90),
});
export type StaleReportQuery = z.input<typeof staleReportQuerySchema>;
