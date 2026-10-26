import type { PlanDefinition } from '@silopro/domain';

const GB = 1024 ** 3;
const num = (n: number) => n.toLocaleString('es-MX');

export const gb = (bytes: number) =>
  `${(bytes / GB).toLocaleString('es-MX', { maximumFractionDigits: 1 })} GB`;

/** Renglones de límites de un plan, iguales en «Plan y facturación» y en la landing. */
export function planLimitLines(p: PlanDefinition): string[] {
  const { members, items, photoBytes } = p.limits;
  return [
    members === null ? 'Usuarios ilimitados' : `Hasta ${members} usuarios`,
    items === null ? 'Artículos ilimitados' : `Hasta ${num(items)} artículos`,
    photoBytes === null ? 'Fotografías sin límite' : `${gb(photoBytes)} de fotografías`,
  ];
}

export const PLAN_INCLUDES = 'Gabinetes 2D y 3D, QR, proyectos, compras y reportes';

/** Correo de ventas y soporte que se muestra en la web. */
export const CONTACT_EMAIL = 'soporte@elikarsystems.com';
