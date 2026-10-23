// ── Lista de compras y alertas ──────────────────────────────────────────────

/** Por qué un artículo está en la lista de compras. */
export interface ShoppingReason {
  kind: 'low_stock' | 'project';
  /** Código del proyecto (solo `project`). */
  projectCode?: string;
  /** Lo pendiente en ese proyecto, o el mínimo del artículo. */
  quantity: number;
}

export interface ShoppingLine {
  itemId: string;
  sku: string;
  itemName: string;
  unitSymbol: string;
  available: number;
  minStock: number | null;
  /** Lo que falta apartar o consumir en proyectos abiertos. */
  projectPending: number;
  /** Para cubrir proyectos y quedar en el mínimo: `max(pending + min - available, 0)`. */
  toBuy: number;
  /** Costo unitario registrado del artículo. */
  unitCost: number | null;
  supplierId: string | null;
  supplierName: string | null;
  reasons: ShoppingReason[];
}

export interface ShoppingList {
  lines: ShoppingLine[];
  /** Suma de `toBuy × unitCost` de las líneas con costo. */
  estimatedTotal: number;
  /** Líneas sin costo registrado (no entran en el total). */
  missingCost: number;
}

/** Resumen para avisos en el menú y en inicio. */
export interface AlertSummary {
  /** Artículos con disponible en o por debajo de su mínimo. */
  lowStock: number;
  /** Artículos que hay que comprar (lista de compras). */
  toBuy: number;
  /** Proyectos abiertos con algún faltante. */
  projectsShort: number;
}
