import type { CabinetViewer } from './cabinet-viewer';

/**
 * Por qué no se pudo abrir la vista 3D:
 * - `webgl`: el navegador no da un contexto WebGL 2 (Three.js lo exige); sin
 *   aceleración por hardware o con la tarjeta gráfica bloqueada.
 * - `webgl1`: solo hay WebGL 1 (navegador o controlador antiguo).
 * - `load`: no se descargó el código del visor, típicamente porque se publicó
 *   una versión nueva y la página abierta pide archivos que ya no existen.
 * - `error`: el visor falló al crearse; `detail` lleva el mensaje para soporte.
 */
export interface ViewerFailure {
  kind: 'webgl' | 'webgl1' | 'load' | 'error';
  detail?: string;
}

/** Qué versión de WebGL da este navegador. */
export function webglSupport(): 2 | 1 | 0 {
  try {
    if (document.createElement('canvas').getContext('webgl2')) return 2;
    return document.createElement('canvas').getContext('webgl') ? 1 : 0;
  } catch {
    return 0;
  }
}

/** Descarga el visor (Three.js va en un chunk aparte) y lo crea sobre `canvas`. */
export async function loadViewer(
  canvas: HTMLCanvasElement,
  host: HTMLElement,
): Promise<{ viewer: CabinetViewer } | { failure: ViewerFailure }> {
  const support = webglSupport();
  if (support < 2) return { failure: { kind: support === 1 ? 'webgl1' : 'webgl' } };
  let mod: typeof import('./cabinet-viewer');
  try {
    mod = await import('./cabinet-viewer');
  } catch {
    return { failure: { kind: 'load' } };
  }
  try {
    return { viewer: new mod.CabinetViewer(canvas, host) };
  } catch (e) {
    console.error('Vista 3D:', e);
    const detail = e instanceof Error ? e.message : String(e);
    return { failure: { kind: 'error', detail: detail.slice(0, 300) } };
  }
}
