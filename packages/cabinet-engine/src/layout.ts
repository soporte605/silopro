/**
 * Modelo lógico de un gabinete en cuadrícula.
 *
 * Este módulo es independiente de cualquier tecnología de representación
 * (SVG, Three.js, CAD). Describe la estructura del gabinete y sus
 * compartimentos; las vistas 2D/3D y el generador CAD lo consumen.
 */

/** Estilo de direccionamiento de las celdas. */
export type AddressingScheme =
  /** Fila con letra, columna con número: A1, B12, AA3. */
  | 'row-letter'
  /** Columna con letra, fila con número: A1 = columna A, fila 1. */
  | 'column-letter'
  /** Numérico: 1-1, 3-12. */
  | 'numeric';

/** Origen visual de la numeración de filas. */
export type RowOrigin = 'top' | 'bottom';

export interface CabinetGridSpec {
  rows: number;
  columns: number;
  addressing?: AddressingScheme;
  rowOrigin?: RowOrigin;
}

/**
 * Un compartimento ocupa un rectángulo de celdas. Un cajón simple ocupa 1×1;
 * un cajón doble ocupa 1×2, etc. Las coordenadas son base 0 desde arriba a la
 * izquierda, independientemente del esquema de direccionamiento.
 */
export interface Compartment {
  id: string;
  row: number;
  column: number;
  rowSpan: number;
  columnSpan: number;
  /** Etiqueta legible derivada de la celda de origen (p. ej. "C4"). */
  address: string;
}

export interface CabinetLayout {
  rows: number;
  columns: number;
  addressing: AddressingScheme;
  rowOrigin: RowOrigin;
  compartments: Compartment[];
}

export const MAX_GRID_DIMENSION = 200;

export class LayoutError extends Error {
  constructor(
    message: string,
    readonly code:
      'INVALID_DIMENSION' | 'OUT_OF_BOUNDS' | 'OVERLAP' | 'NOT_FOUND' | 'NOT_RECTANGULAR',
  ) {
    super(message);
    this.name = 'LayoutError';
  }
}

/** Convierte un índice base 0 en letras estilo hoja de cálculo: 0→A, 25→Z, 26→AA. */
export function indexToLetters(index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new LayoutError(`Índice inválido: ${index}`, 'INVALID_DIMENSION');
  }
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** Inversa de {@link indexToLetters}. */
export function lettersToIndex(letters: string): number {
  if (!/^[A-Z]+$/.test(letters)) {
    throw new LayoutError(`Letras inválidas: ${letters}`, 'INVALID_DIMENSION');
  }
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function cellAddress(
  row: number,
  column: number,
  rows: number,
  scheme: AddressingScheme = 'row-letter',
  rowOrigin: RowOrigin = 'top',
): string {
  const visualRow = rowOrigin === 'top' ? row : rows - 1 - row;
  switch (scheme) {
    case 'row-letter':
      return `${indexToLetters(visualRow)}${column + 1}`;
    case 'column-letter':
      return `${indexToLetters(column)}${visualRow + 1}`;
    case 'numeric':
      return `${visualRow + 1}-${column + 1}`;
  }
}

function assertDimension(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > MAX_GRID_DIMENSION) {
    throw new LayoutError(
      `${name} debe ser un entero entre 1 y ${MAX_GRID_DIMENSION} (recibido: ${value})`,
      'INVALID_DIMENSION',
    );
  }
}

/** Crea un gabinete donde cada celda es un compartimento 1×1. */
export function createGridLayout(spec: CabinetGridSpec): CabinetLayout {
  assertDimension('rows', spec.rows);
  assertDimension('columns', spec.columns);
  const addressing = spec.addressing ?? 'row-letter';
  const rowOrigin = spec.rowOrigin ?? 'top';
  const compartments: Compartment[] = [];
  for (let r = 0; r < spec.rows; r++) {
    for (let c = 0; c < spec.columns; c++) {
      const address = cellAddress(r, c, spec.rows, addressing, rowOrigin);
      compartments.push({ id: address, row: r, column: c, rowSpan: 1, columnSpan: 1, address });
    }
  }
  return { rows: spec.rows, columns: spec.columns, addressing, rowOrigin, compartments };
}

/**
 * Índice de ocupación de celdas → id de compartimento. Permite consultas O(1)
 * por celda, necesarias para gabinetes grandes (p. ej. 60×40).
 */
export function buildCellIndex(layout: CabinetLayout): (string | null)[] {
  const index: (string | null)[] = new Array<string | null>(layout.rows * layout.columns).fill(
    null,
  );
  for (const comp of layout.compartments) {
    for (let r = comp.row; r < comp.row + comp.rowSpan; r++) {
      for (let c = comp.column; c < comp.column + comp.columnSpan; c++) {
        if (r < 0 || c < 0 || r >= layout.rows || c >= layout.columns) {
          throw new LayoutError(`El compartimento ${comp.id} sale de los límites`, 'OUT_OF_BOUNDS');
        }
        const i = r * layout.columns + c;
        const existing = index[i];
        if (existing != null) {
          throw new LayoutError(
            `Los compartimentos ${existing} y ${comp.id} se superponen`,
            'OVERLAP',
          );
        }
        index[i] = comp.id;
      }
    }
  }
  return index;
}

/** Valida que no existan superposiciones ni compartimentos fuera de límites. */
export function validateLayout(layout: CabinetLayout): void {
  assertDimension('rows', layout.rows);
  assertDimension('columns', layout.columns);
  const ids = new Set<string>();
  for (const comp of layout.compartments) {
    if (ids.has(comp.id)) {
      throw new LayoutError(`Identificador duplicado: ${comp.id}`, 'OVERLAP');
    }
    ids.add(comp.id);
    if (comp.rowSpan < 1 || comp.columnSpan < 1) {
      throw new LayoutError(`Dimensiones inválidas en ${comp.id}`, 'INVALID_DIMENSION');
    }
  }
  buildCellIndex(layout);
}

/**
 * Fusiona los compartimentos que cubren por completo el rectángulo indicado
 * en uno solo (p. ej. un cajón ancho que ocupa dos posiciones).
 */
export function mergeCompartments(
  layout: CabinetLayout,
  area: { row: number; column: number; rowSpan: number; columnSpan: number },
): CabinetLayout {
  const { row, column, rowSpan, columnSpan } = area;
  if (
    row < 0 ||
    column < 0 ||
    row + rowSpan > layout.rows ||
    column + columnSpan > layout.columns
  ) {
    throw new LayoutError('El área a fusionar sale de los límites', 'OUT_OF_BOUNDS');
  }
  const inside = (c: Compartment) =>
    c.row >= row &&
    c.column >= column &&
    c.row + c.rowSpan <= row + rowSpan &&
    c.column + c.columnSpan <= column + columnSpan;
  const intersects = (c: Compartment) =>
    c.row < row + rowSpan &&
    c.row + c.rowSpan > row &&
    c.column < column + columnSpan &&
    c.column + c.columnSpan > column;

  const touched = layout.compartments.filter(intersects);
  if (touched.some((c) => !inside(c))) {
    throw new LayoutError(
      'El área corta un compartimento existente; seleccione un rectángulo completo',
      'NOT_RECTANGULAR',
    );
  }
  const address = cellAddress(row, column, layout.rows, layout.addressing, layout.rowOrigin);
  const merged: Compartment = { id: address, row, column, rowSpan, columnSpan, address };
  const next: CabinetLayout = {
    ...layout,
    compartments: [...layout.compartments.filter((c) => !intersects(c)), merged].sort(
      (a, b) => a.row - b.row || a.column - b.column,
    ),
  };
  validateLayout(next);
  return next;
}

/** Divide un compartimento en celdas 1×1. */
export function splitCompartment(layout: CabinetLayout, id: string): CabinetLayout {
  const target = layout.compartments.find((c) => c.id === id);
  if (!target) throw new LayoutError(`Compartimento no encontrado: ${id}`, 'NOT_FOUND');
  const cells: Compartment[] = [];
  for (let r = target.row; r < target.row + target.rowSpan; r++) {
    for (let c = target.column; c < target.column + target.columnSpan; c++) {
      const address = cellAddress(r, c, layout.rows, layout.addressing, layout.rowOrigin);
      cells.push({ id: address, row: r, column: c, rowSpan: 1, columnSpan: 1, address });
    }
  }
  return {
    ...layout,
    compartments: [...layout.compartments.filter((c) => c.id !== id), ...cells].sort(
      (a, b) => a.row - b.row || a.column - b.column,
    ),
  };
}

/**
 * Cambia el tamaño de la cuadrícula. Los compartimentos que quedan dentro se
 * conservan (re-direccionados si el esquema depende del número de filas); los
 * que quedan completamente fuera se eliminan y las celdas nuevas se rellenan
 * con compartimentos 1×1. Un compartimento cortado por el nuevo borde es un
 * error: hay que dividirlo antes.
 */
export function resizeLayout(layout: CabinetLayout, rows: number, columns: number): CabinetLayout {
  assertDimension('rows', rows);
  assertDimension('columns', columns);
  const kept: Compartment[] = [];
  for (const c of layout.compartments) {
    if (c.row >= rows || c.column >= columns) continue;
    if (c.row + c.rowSpan > rows || c.column + c.columnSpan > columns) {
      throw new LayoutError(
        `El compartimento ${c.address} quedaría cortado; divídalo antes de reducir el gabinete`,
        'NOT_RECTANGULAR',
      );
    }
    const address = cellAddress(c.row, c.column, rows, layout.addressing, layout.rowOrigin);
    kept.push({ ...c, id: address, address });
  }
  const next: CabinetLayout = { ...layout, rows, columns, compartments: kept };
  const index = buildCellIndex(next);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      if (index[r * columns + c] != null) continue;
      const address = cellAddress(r, c, rows, layout.addressing, layout.rowOrigin);
      kept.push({ id: address, row: r, column: c, rowSpan: 1, columnSpan: 1, address });
    }
  }
  kept.sort((a, b) => a.row - b.row || a.column - b.column);
  return next;
}

/**
 * Valida un diseño recibido del exterior (p. ej. al guardarlo): además de
 * {@link validateLayout}, exige que cada id y dirección correspondan a su
 * celda de origen y que no queden celdas sin compartimento.
 */
export function assertCanonicalLayout(layout: CabinetLayout): void {
  validateLayout(layout);
  for (const c of layout.compartments) {
    const address = cellAddress(c.row, c.column, layout.rows, layout.addressing, layout.rowOrigin);
    if (c.id !== address || c.address !== address) {
      throw new LayoutError(`El compartimento ${c.id} no coincide con su posición`, 'NOT_FOUND');
    }
  }
  if (buildCellIndex(layout).some((cell) => cell == null)) {
    throw new LayoutError('Hay celdas sin compartimento', 'OUT_OF_BOUNDS');
  }
}
