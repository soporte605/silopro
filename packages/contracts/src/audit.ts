import { z } from 'zod';
import type { Movement } from './stock.js';

/** Una entrada de la bitácora de auditoría. */
export interface AuditEntry {
  id: string;
  /** Método y ruta sin el prefijo de la organización: `POST items`, `PATCH items/:id`. */
  action: string;
  entityId: string | null;
  label: string | null;
  details: unknown;
  actorId: string;
  actorName: string;
  occurredAt: string;
}

export interface AuditPage {
  entries: AuditEntry[];
  /** Para pedir la página siguiente (`before`); `null` si no hay más. */
  nextCursor: string | null;
}

const isoDate = z.iso.date('Fecha AAAA-MM-DD');
const uuidish = z.string().uuid();

export const auditQuerySchema = z.object({
  actorId: uuidish.optional(),
  entityId: z.string().max(64).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  before: uuidish.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type AuditQuery = z.input<typeof auditQuerySchema>;

/** Qué significa cada acción, para mostrarla en la bitácora. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'POST units': 'Creó una unidad',
  'POST categories': 'Creó una categoría',
  'PATCH categories/:id': 'Editó una categoría',
  'DELETE categories/:id': 'Archivó una categoría',
  'POST suppliers': 'Creó un proveedor',
  'PATCH suppliers/:id': 'Editó un proveedor',
  'POST items': 'Creó un artículo',
  'PATCH items/:id': 'Editó un artículo',
  'DELETE items/:id': 'Archivó un artículo',
  'POST items/:itemId/photos': 'Subió una foto',
  'POST items/:itemId/photos/:photoId/portada': 'Cambió la foto de portada',
  'DELETE items/:itemId/photos/:photoId': 'Borró una foto',
  'POST locations': 'Creó una ubicación',
  'PATCH locations/:id': 'Editó una ubicación',
  'DELETE locations/:id': 'Archivó una ubicación',
  'POST movements': 'Registró un movimiento',
  'POST transfers': 'Hizo una transferencia',
  'POST reservations': 'Creó una reserva',
  'POST reservations/:id/release': 'Liberó una reserva',
  'POST reservations/:id/consume': 'Consumió una reserva',
  'POST cabinets': 'Creó un gabinete o anaquel',
  'PUT cabinets/:id/layout': 'Cambió el diseño de un gabinete',
  'PUT cabinets/:id/physical': 'Cambió las medidas de un gabinete',
  'PATCH cabinets/:id/compartments/:compartmentId': 'Editó un cajón o charola',
  'PATCH members/:userId': 'Cambió el rol de un miembro',
  'DELETE members/:userId': 'Quitó a un miembro',
  'POST invitations': 'Invitó a un miembro',
  'DELETE invitations/:id': 'Revocó una invitación',
};

export const auditActionLabel = (action: string): string => AUDIT_ACTION_LABELS[action] ?? action;

/** Filtros del diario de movimientos de toda la organización. */
export const movementQuerySchema = z.object({
  kind: z.enum(['receipt', 'issue', 'adjustment', 'transfer', 'consumption']).optional(),
  itemId: uuidish.optional(),
  locationId: uuidish.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  before: uuidish.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type MovementQuery = z.input<typeof movementQuerySchema>;

/** Movimiento del diario, con el artículo para listarlo fuera de su ficha. */
export interface JournalMovement extends Movement {
  sku: string;
  itemName: string;
  unitSymbol: string;
}

export interface MovementPage {
  movements: JournalMovement[];
  nextCursor: string | null;
}
