import { z } from 'zod';

// ── ¿Dónde está? ──────────────────────────────────────────────────────────
// Búsqueda que responde dónde hay existencias de un artículo, con lo
// necesario para llevar al usuario a la caja (vista 3D del anaquel).

export const locateQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type LocateQuery = z.input<typeof locateQuerySchema>;

/** Una ubicación donde hay existencias del artículo. */
export interface LocatePlace {
  locationId: string;
  /** Ruta legible, p. ej. "ALM-1 / GAB-2 / C4". */
  path: string;
  /** Código de la ubicación (la dirección del cajón: C4). */
  code: string;
  onHand: number;
  /** Gabinete con diseño que contiene este cajón, si lo hay. */
  cabinetId: string | null;
  cabinetCode: string | null;
  /** Lugar que agrupa al gabinete (anaquel, zona…): abre la vista 3D de todos sus gabinetes. */
  shelfId: string | null;
}

export interface LocateHit {
  itemId: string;
  sku: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  unitSymbol: string;
  /** Alias que coincidió con la búsqueda, para explicar por qué aparece. */
  matchedAlias: string | null;
  onHand: number;
  /** Ubicaciones con existencias, de más a menos. */
  places: LocatePlace[];
}

export interface LocateResult {
  query: string;
  hits: LocateHit[];
}
