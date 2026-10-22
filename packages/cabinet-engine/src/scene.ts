/**
 * Modelo de escena de un gabinete: cajas en milímetros listas para dibujar.
 *
 * Es el adaptador entre el modelo lógico ({@link CabinetLayout}) y cualquier
 * motor de representación 3D. No depende de Three.js: la web traduce estas
 * cajas a mallas. Tampoco es geometría de fabricación (ver ADR-0008).
 *
 * Ejes: X a la derecha, Y hacia arriba, Z hacia el observador. El origen es
 * el centro del gabinete; el frente queda en `z = depth / 2`.
 */
import { buildCellIndex, type CabinetLayout } from './layout.js';
import { type CabinetPhysicalSpec, type Dimensions, outerDimensions } from './physical.js';

/** Caja alineada a los ejes: centro y tamaño, en mm. */
export interface SceneBox {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
}

export interface SceneDrawer {
  /** Id del compartimento. */
  id: string;
  address: string;
  /** Cuerpo del cajón cerrado (sin el frente). */
  body: SceneBox;
  /** Frente del cajón cerrado. */
  front: SceneBox;
  /** Cuánto sale el cajón al abrirse (mm, hacia +Z). */
  travel: number;
}

export interface CabinetSceneModel {
  outer: Dimensions;
  /** Fondo, laterales, techo, piso y separadores entre compartimentos. */
  panels: SceneBox[];
  drawers: SceneDrawer[];
}

/**
 * Medidas por omisión mientras el gabinete no guarde las suyas: cajón pequeño
 * de organizador de componentes, imprimible en una Ender-3 V3 KE.
 */
export const DEFAULT_PHYSICAL_SPEC: CabinetPhysicalSpec = {
  cellWidth: 40,
  cellHeight: 30,
  depth: 120,
  wallThickness: 2,
};

/** Holgura entre el cajón y su hueco, por lado (mm). */
const CLEARANCE = 0.5;
/** Fracción de la profundidad que sale un cajón abierto. */
const TRAVEL = 0.7;

export function cabinetSceneModel(
  layout: CabinetLayout,
  spec: CabinetPhysicalSpec = DEFAULT_PHYSICAL_SPEC,
): CabinetSceneModel {
  const { rows, columns } = layout;
  const { cellWidth: cw, cellHeight: ch, depth, wallThickness: t } = spec;
  const outer = outerDimensions(layout, spec);
  const index = buildCellIndex(layout);
  const at = (r: number, c: number) => index[r * columns + c] ?? null;

  // Coordenadas desde la esquina superior izquierda trasera, luego se centran.
  const left = -outer.width / 2;
  const top = outer.height / 2;
  const back = -outer.depth / 2;
  const colX = (c: number) => left + c * (cw + t);
  const rowY = (r: number) => top - r * (ch + t);
  /** Paredes y separadores ocupan la profundidad interior, delante del fondo. */
  const wallZ = back + t + depth / 2;

  const panels: SceneBox[] = [
    { x: 0, y: 0, z: back + t / 2, width: outer.width, height: outer.height, depth: t },
  ];

  // Paredes horizontales: en cada borde entre filas, donde los cajones de
  // arriba y abajo son distintos (o es el borde exterior). Tramos contiguos se
  // unen en una sola pieza.
  for (let r = 0; r <= rows; r++) {
    let start = -1;
    for (let c = 0; c <= columns; c++) {
      const wall = c < columns && (r === 0 || r === rows || at(r - 1, c) !== at(r, c));
      if (wall && start < 0) start = c;
      if (!wall && start >= 0) {
        const x0 = colX(start);
        const x1 = colX(c) + t;
        panels.push({
          x: (x0 + x1) / 2,
          y: rowY(r) - t / 2,
          z: wallZ,
          width: x1 - x0,
          height: t,
          depth,
        });
        start = -1;
      }
    }
  }
  // Paredes verticales, igual que las horizontales.
  for (let c = 0; c <= columns; c++) {
    let start = -1;
    for (let r = 0; r <= rows; r++) {
      const wall = r < rows && (c === 0 || c === columns || at(r, c - 1) !== at(r, c));
      if (wall && start < 0) start = r;
      if (!wall && start >= 0) {
        const y0 = rowY(start);
        const y1 = rowY(r) - t;
        panels.push({
          x: colX(c) + t / 2,
          y: (y0 + y1) / 2,
          z: wallZ,
          width: t,
          height: y0 - y1,
          depth,
        });
        start = -1;
      }
    }
  }

  const front = outer.depth / 2;
  const drawers: SceneDrawer[] = layout.compartments.map((comp) => {
    const x0 = colX(comp.column) + t + CLEARANCE;
    const x1 = colX(comp.column + comp.columnSpan) - CLEARANCE;
    const y0 = rowY(comp.row) - t - CLEARANCE;
    const y1 = rowY(comp.row + comp.rowSpan) + CLEARANCE;
    const x = (x0 + x1) / 2;
    const y = (y0 + y1) / 2;
    const width = x1 - x0;
    const height = y0 - y1;
    const bodyDepth = depth - t - CLEARANCE;
    return {
      id: comp.id,
      address: comp.address,
      front: { x, y, z: front - t / 2, width, height, depth: t },
      body: { x, y, z: front - t - bodyDepth / 2, width, height, depth: bodyDepth },
      travel: Math.round(depth * TRAVEL),
    };
  });

  return { outer, panels, drawers };
}
