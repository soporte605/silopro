import { CONTACT_EMAIL } from '../billing/plan-copy';

/**
 * Datos del responsable que aparecen en el aviso de privacidad y los términos.
 * Mientras `draft` sea true las páginas muestran que son un borrador pendiente
 * de revisión legal. Ver docs/LEGAL.md.
 */
export const LEGAL = {
  draft: true,
  /** Nombre o razón social de quien presta el servicio. */
  owner: 'ElikarSystems [razón social por definir]',
  /** Domicilio para oír y recibir notificaciones. */
  address: '[domicilio por definir]',
  email: CONTACT_EMAIL,
  /** Ciudad cuyos tribunales resuelven controversias. */
  jurisdiction: '[ciudad por definir]',
  /** Fecha de la versión vigente (AAAA-MM-DD). */
  updated: '2026-10-25',
} as const;

export const legalDate = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' }).format(
  new Date(`${LEGAL.updated}T12:00:00`),
);
