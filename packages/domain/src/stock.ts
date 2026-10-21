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

export function isLowStock(totalAvailable: number, minimum: number | null): boolean {
  return minimum != null && minimum > 0 && totalAvailable <= minimum;
}
