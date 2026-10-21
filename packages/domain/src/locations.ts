/**
 * Jerarquía flexible de ubicaciones.
 *
 * Una organización contiene almacenes; dentro de un almacén las ubicaciones
 * forman un árbol de profundidad variable. El tipo de cada nodo restringe qué
 * tipos de hijos admite. Las reglas viven aquí (dominio puro) y la
 * persistencia las aplica antes de escribir.
 */

export const LOCATION_KINDS = [
  'warehouse',
  'zone',
  'room',
  'shelving',
  'shelf',
  'cabinet',
  'drawer',
  'compartment',
  'box',
  'bin',
  'other',
] as const;

export type LocationKind = (typeof LOCATION_KINDS)[number];

export const LOCATION_KIND_LABELS: Record<LocationKind, string> = {
  warehouse: 'Almacén',
  zone: 'Zona',
  room: 'Cuarto',
  shelving: 'Estantería',
  shelf: 'Estante',
  cabinet: 'Gabinete',
  drawer: 'Cajón',
  compartment: 'Compartimento',
  box: 'Caja',
  bin: 'Contenedor',
  other: 'Otra',
};

const CONTAINERS: LocationKind[] = ['shelving', 'cabinet', 'box', 'bin', 'other'];

/** Tipos de hijo permitidos por tipo de padre. */
export const ALLOWED_CHILDREN: Record<LocationKind, readonly LocationKind[]> = {
  warehouse: ['zone', 'room', ...CONTAINERS],
  zone: ['zone', 'room', ...CONTAINERS],
  room: ['zone', ...CONTAINERS],
  shelving: ['shelf', 'box', 'bin'],
  shelf: ['box', 'bin', 'cabinet', 'other'],
  cabinet: ['drawer', 'shelf', 'box', 'bin'],
  drawer: ['compartment', 'box', 'bin'],
  compartment: [],
  box: ['compartment', 'box', 'bin'],
  bin: ['compartment'],
  other: ['box', 'bin', 'other'],
};

/** Profundidad máxima del árbol, como protección contra ciclos y abusos. */
export const MAX_LOCATION_DEPTH = 12;

export type LocationRuleViolation =
  | { code: 'ROOT_MUST_BE_WAREHOUSE' }
  | { code: 'CHILD_KIND_NOT_ALLOWED'; parent: LocationKind; child: LocationKind }
  | { code: 'MAX_DEPTH_EXCEEDED'; max: number }
  | { code: 'CYCLE' };

export interface LocationNodeRef {
  id: string;
  kind: LocationKind;
  parentId: string | null;
}

/**
 * Verifica si un nodo de tipo `kind` puede colocarse bajo `parent`.
 * `ancestors` es la cadena desde el padre hasta la raíz (padre primero).
 */
export function checkPlacement(
  node: { id?: string; kind: LocationKind },
  parent: LocationNodeRef | null,
  ancestors: readonly LocationNodeRef[] = [],
): LocationRuleViolation | null {
  if (!parent) {
    return node.kind === 'warehouse' ? null : { code: 'ROOT_MUST_BE_WAREHOUSE' };
  }
  if (!ALLOWED_CHILDREN[parent.kind].includes(node.kind)) {
    return { code: 'CHILD_KIND_NOT_ALLOWED', parent: parent.kind, child: node.kind };
  }
  if (node.id && (parent.id === node.id || ancestors.some((a) => a.id === node.id))) {
    return { code: 'CYCLE' };
  }
  // Profundidad del nuevo nodo = ancestros (incluido el padre) + 1.
  const depth = Math.max(ancestors.length, 1) + 1;
  if (depth > MAX_LOCATION_DEPTH) return { code: 'MAX_DEPTH_EXCEEDED', max: MAX_LOCATION_DEPTH };
  return null;
}

/**
 * Ruta legible de una ubicación, p. ej. "ALM-01 / Z-A / GAB-1 / C4".
 */
export function locationPath(codes: readonly string[], separator = ' / '): string {
  return codes.join(separator);
}
