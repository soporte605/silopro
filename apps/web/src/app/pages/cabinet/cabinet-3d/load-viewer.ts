import type { CabinetViewer } from './cabinet-viewer';

/**
 * Por qué no se pudo abrir la vista 3D:
 * - `webgl`: el navegador no da un contexto WebGL (sin aceleración por hardware).
 * - `load`: no se descargó el código del visor, típicamente porque se publicó
 *   una versión nueva y la página abierta pide archivos que ya no existen.
 */
export type ViewerFailure = 'webgl' | 'load';

/** ¿Puede este navegador crear un contexto WebGL? */
export function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Descarga el visor (Three.js va en un chunk aparte) y lo crea sobre `canvas`. */
export async function loadViewer(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
): Promise<{ viewer: CabinetViewer } | { failure: ViewerFailure }> {
  if (!hasWebGL()) return { failure: 'webgl' };
  let mod: typeof import('./cabinet-viewer');
  try {
    mod = await import('./cabinet-viewer');
  } catch {
    return { failure: 'load' };
  }
  try {
    return { viewer: new mod.CabinetViewer(canvas, host) };
  } catch {
    return { failure: 'webgl' };
  }
}
