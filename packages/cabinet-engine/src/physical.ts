/**
 * Parámetros físicos de un gabinete modular, en milímetros.
 *
 * Sirven para la visualización 3D y, en fases posteriores, como entrada del
 * generador CAD paramétrico. NO producen geometría imprimible: solo calculan
 * dimensiones y comprueban el volumen de impresión disponible.
 */

export interface CabinetPhysicalSpec {
  /** Ancho interior útil de una celda. */
  cellWidth: number;
  /** Alto interior útil de una celda. */
  cellHeight: number;
  /** Profundidad interior del cajón. */
  depth: number;
  /** Espesor de paredes exteriores y separadores. */
  wallThickness: number;
}

export interface PrintVolume {
  x: number;
  y: number;
  z: number;
}

/** Creality Ender-3 V3 KE, volumen nominal (impresora inicial del proyecto). */
export const ENDER_3_V3_KE: PrintVolume = { x: 220, y: 220, z: 240 };

export interface Dimensions {
  width: number;
  height: number;
  depth: number;
}

export function outerDimensions(
  grid: { rows: number; columns: number },
  spec: CabinetPhysicalSpec,
): Dimensions {
  const t = spec.wallThickness;
  return {
    width: grid.columns * spec.cellWidth + (grid.columns + 1) * t,
    height: grid.rows * spec.cellHeight + (grid.rows + 1) * t,
    depth: spec.depth + t,
  };
}

/** Comprueba si una pieza cabe en el volumen, permitiendo rotarla sobre la cama. */
export function fitsPrintVolume(part: Dimensions, volume: PrintVolume, margin = 5): boolean {
  const vx = volume.x - margin * 2;
  const vy = volume.y - margin * 2;
  const vz = volume.z;
  const fits = (a: number, b: number, h: number) =>
    ((a <= vx && b <= vy) || (a <= vy && b <= vx)) && h <= vz;
  const { width: w, height: h, depth: d } = part;
  // Orientaciones: cualquiera de las tres dimensiones puede quedar en Z.
  return fits(w, d, h) || fits(w, h, d) || fits(h, d, w);
}

/**
 * Propone una división del gabinete en módulos que quepan en la impresora.
 * Estrategia inicial: bloques rectangulares de celdas completas, con la
 * menor cantidad de módulos posible. Las uniones entre módulos se definirán
 * en el generador CAD (fase de fabricación).
 */
export function planModules(
  grid: { rows: number; columns: number },
  spec: CabinetPhysicalSpec,
  volume: PrintVolume = ENDER_3_V3_KE,
): { rowsPerModule: number; columnsPerModule: number; modules: number } | null {
  let best: { rowsPerModule: number; columnsPerModule: number; modules: number } | null = null;
  for (let r = grid.rows; r >= 1; r--) {
    for (let c = grid.columns; c >= 1; c--) {
      if (!fitsPrintVolume(outerDimensions({ rows: r, columns: c }, spec), volume)) continue;
      const modules = Math.ceil(grid.rows / r) * Math.ceil(grid.columns / c);
      if (!best || modules < best.modules)
        best = { rowsPerModule: r, columnsPerModule: c, modules };
    }
  }
  return best;
}
