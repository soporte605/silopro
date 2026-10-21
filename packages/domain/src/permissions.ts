/**
 * Roles y permisos por organización.
 * La API verifica permisos en cada caso de uso; la base de datos aísla los
 * datos de cada organización con RLS (ADR-0011).
 */

export const ROLES = ['owner', 'admin', 'operator', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  operator: 'Operador',
  viewer: 'Consulta',
};

export type Permission =
  | 'catalog.read'
  | 'catalog.write'
  | 'stock.move'
  | 'stock.adjust'
  | 'stock.negative'
  | 'members.manage'
  | 'organization.manage';

const GRANTS: Record<Role, readonly Permission[]> = {
  owner: [
    'catalog.read',
    'catalog.write',
    'stock.move',
    'stock.adjust',
    'stock.negative',
    'members.manage',
    'organization.manage',
  ],
  admin: ['catalog.read', 'catalog.write', 'stock.move', 'stock.adjust', 'members.manage'],
  operator: ['catalog.read', 'stock.move'],
  viewer: ['catalog.read'],
};

export function can(role: Role, permission: Permission): boolean {
  return GRANTS[role].includes(permission);
}
