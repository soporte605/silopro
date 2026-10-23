/**
 * Reglas de existencias.
 *
 * Las cantidades se manejan como enteros escalados (milésimas) para evitar
 * errores de punto flotante con unidades fraccionarias (metros de cable,
 * kilogramos de tornillería). La base de datos usa NUMERIC; este módulo
 * define la semántica.
 */

export const QUANTITY_SCALE = 1000;

/** Convierte una cantidad decimal a unidades enteras escaladas. */
export function toScaled(quantity: number): number {
  if (!Number.isFinite(quantity)) throw new StockError('Cantidad no finita', 'INVALID_QUANTITY');
  return Math.round(quantity * QUANTITY_SCALE);
}

export function fromScaled(scaled: number): number {
  return scaled / QUANTITY_SCALE;
}

export class StockError extends Error {
  constructor(
    message: string,
    readonly code: 'INVALID_QUANTITY' | 'INSUFFICIENT_STOCK' | 'INSUFFICIENT_AVAILABLE',
  ) {
    super(message);
    this.name = 'StockError';
  }
}

/** Existencias de un artículo en una ubicación concreta. */
export interface StockLevel {
  /** Cantidad física presente (escalada). */
  onHand: number;
  /** Cantidad comprometida por reservas (escalada). */
  reserved: number;
}

export function available(level: StockLevel): number {
  return level.onHand - level.reserved;
}

export type MovementKind = 'receipt' | 'issue' | 'adjustment' | 'consumption';

export interface ApplyOptions {
  /** Permite existencias negativas (requiere permiso explícito). */
  allowNegative?: boolean;
}

/**
 * Aplica un delta a las existencias físicas. Una salida no puede consumir
 * cantidad reservada ni dejar el saldo negativo, salvo autorización.
 */
export function applyDelta(level: StockLevel, delta: number, opts: ApplyOptions = {}): StockLevel {
  if (!Number.isInteger(delta))
    throw new StockError('Delta debe ser entero escalado', 'INVALID_QUANTITY');
  const next = { onHand: level.onHand + delta, reserved: level.reserved };
  if (!opts.allowNegative) {
    if (next.onHand < 0) {
      throw new StockError('Existencias insuficientes', 'INSUFFICIENT_STOCK');
    }
    if (delta < 0 && available(next) < 0) {
      throw new StockError('La salida afectaría cantidad reservada', 'INSUFFICIENT_AVAILABLE');
    }
  }
  return next;
}

export function reserve(level: StockLevel, quantity: number): StockLevel {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new StockError('La reserva debe ser positiva', 'INVALID_QUANTITY');
  }
  if (available(level) < quantity) {
    throw new StockError('Disponible insuficiente para reservar', 'INSUFFICIENT_AVAILABLE');
  }
  return { onHand: level.onHand, reserved: level.reserved + quantity };
}

export function release(level: StockLevel, quantity: number): StockLevel {
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > level.reserved) {
    throw new StockError('Liberación inválida', 'INVALID_QUANTITY');
  }
  return { onHand: level.onHand, reserved: level.reserved - quantity };
}

/** Requerimiento de un artículo para un proyecto / lista de materiales. */
export function shortage(required: number, availableQty: number): number {
  return Math.max(0, required - Math.max(0, availableQty));
}

/**
 * Estado de una línea de lista de materiales (todas las cantidades escaladas):
 * lo pendiente es lo que falta consumir o apartar; el faltante, lo pendiente
 * que no alcanza a cubrir lo disponible en el almacén.
 */
export function bomLineStatus(line: {
  required: number;
  consumed: number;
  reserved: number;
  available: number;
}): { pending: number; shortage: number } {
  const pending = Math.max(0, line.required - line.consumed - line.reserved);
  return { pending, shortage: shortage(pending, line.available) };
}

/**
 * Reparte `quantity` entre fuentes en orden, tomando de cada una lo que tenga.
 * Devuelve lo que se toma de cada fuente (sin ceros) y lo que quedó sin cubrir.
 */
export function allocate<T extends { available: number }>(
  quantity: number,
  sources: readonly T[],
): { picks: { source: T; quantity: number }[]; missing: number } {
  const picks: { source: T; quantity: number }[] = [];
  let left = Math.max(0, quantity);
  for (const source of sources) {
    if (left <= 0) break;
    const take = Math.min(left, Math.max(0, source.available));
    if (take > 0) {
      picks.push({ source, quantity: take });
      left -= take;
    }
  }
  return { picks, missing: left };
}

/**
 * Cuánto comprar (cantidades escaladas): lo que piden los proyectos más el
 * mínimo, menos lo disponible. Con unidades enteras se redondea hacia arriba.
 */
export function purchaseNeed(p: {
  available: number;
  minStock: number | null;
  projectPending: number;
  wholeUnits: boolean;
}): number {
  const need = Math.max(0, p.projectPending + (p.minStock ?? 0) - Math.max(0, p.available));
  if (!p.wholeUnits) return need;
  return Math.ceil(need / QUANTITY_SCALE) * QUANTITY_SCALE;
}

export function isLowStock(totalAvailable: number, minimum: number | null): boolean {
  return minimum != null && minimum > 0 && totalAvailable <= minimum;
}

/**
 * Capacidad de una ubicación expresada en artículos distintos (p. ej. un
 * cajón de un solo SKU tiene `maxItems = 1`). Las cantidades no se suman
 * entre artículos porque sus unidades pueden ser distintas.
 * Devuelve `true` si guardar el artículo superaría la capacidad.
 */
export function exceedsCapacity(opts: {
  maxItems: number | null;
  distinctItems: number;
  itemAlreadyThere: boolean;
}): boolean {
  if (opts.maxItems == null || opts.itemAlreadyThere) return false;
  return opts.distinctItems + 1 > opts.maxItems;
}
