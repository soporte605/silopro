import type { CabinetSceneModel } from '@silopro/cabinet-engine';
import type { CompartmentState } from '@silopro/contracts';
import {
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CabinetScene, type ScenePalette } from './cabinet-scene';

/** Dirección desde la que se mira el gabinete al encuadrarlo (frente, algo arriba y a la derecha). */
const VIEW_DIR = new Vector3(0.45, 0.32, 1).normalize();
const FOV = 35;

/** Convierte cualquier color CSS (oklch, color-mix…) a hex leyendo un píxel. */
export function readPalette(host: HTMLElement): ScenePalette {
  const probe = document.createElement('span');
  host.appendChild(probe);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const read = (cssVar: string, fallback: string): string => {
    if (!ctx) return fallback;
    probe.style.color = `var(${cssVar}, ${fallback})`;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = fallback;
    ctx.fillStyle = getComputedStyle(probe).color;
    ctx.fillRect(0, 0, 1, 1);
    const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data;
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  };
  const palette: ScenePalette = {
    frame: read('--color-border-strong', '#9ca3af'),
    empty: read('--color-surface-raised', '#f3f4f6'),
    stocked: read('--color-accent', '#10b981'),
    low: read('--color-warning', '#f59e0b'),
    full: read('--color-info', '#3b82f6'),
    selection: read('--color-fg', '#111827'),
  };
  probe.remove();
  return palette;
}

/** Un gabinete dentro del visor; `key` lo distingue cuando hay varios. */
export interface ViewerEntry {
  key: string;
  model: CabinetSceneModel;
  /** Rótulo sobre el gabinete (su código) cuando hay varios. */
  title?: string;
}

/** Cartel con el código del gabinete, para distinguirlos en un estante. */
function titlePlane(text: string, width: number): Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 512, 96);
    ctx.fillStyle = '#111111';
    ctx.font = '700 64px ui-monospace, "Geist Mono Variable", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 50, 490);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const w = Math.min(width * 0.9, 140);
  return new Mesh(new PlaneGeometry(w, w * (96 / 512)), new MeshBasicMaterial({ map: texture }));
}

/** Separación entre gabinetes vecinos de un estante (mm). */
const GAP = 40;
/** Grosor de la tabla del estante que se dibuja bajo varios gabinetes (mm). */
const SHELF = 15;

/**
 * Renderizador, cámara orbital y bucle de dibujo de uno o varios
 * {@link CabinetScene} (los gabinetes de un estante, uno junto a otro, con los
 * frentes alineados). Solo dibuja cuando algo cambia (giro, animación, datos),
 * para no gastar batería en el celular. Es el único módulo que importa
 * Three.js en tiempo de ejecución y se carga de forma diferida.
 */
export class CabinetViewer {
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(FOV, 1, 1, 10_000);
  private readonly controls: OrbitControls;
  private readonly raycaster = new Raycaster();
  private readonly sun = new DirectionalLight(0xffffff, 1.6);
  private palette: ScenePalette;
  private entries: { key: string; scene: CabinetScene }[] = [];
  private shelf: Mesh | null = null;
  private titles: Mesh[] = [];
  private bounds = { width: 1, height: 1, depth: 1 };
  private fittedSize = '';
  private frame = 0;
  private last = 0;

  /** Lanza un error si el navegador no tiene WebGL. */
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly host: HTMLElement,
  ) {
    try {
      this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      // Algunas GPU o controladores rechazan el antialiasing; se intenta sin él.
      this.renderer = new WebGLRenderer({ canvas, antialias: false, alpha: true });
    }
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.palette = readPalette(host);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.addEventListener('change', () => this.request());
    this.scene.add(
      new HemisphereLight(0xffffff, 0x8899aa, 1.6),
      new AmbientLight(0xffffff, 0.4),
      this.sun,
    );
  }

  /** Un solo gabinete (editor). */
  setModel(model: CabinetSceneModel): void {
    this.setModels([{ key: '', model }]);
  }

  /**
   * Reconstruye la escena con los gabinetes de izquierda a derecha, apoyados
   * en la misma base y con los frentes alineados. Solo reencuadra si cambió el
   * tamaño total, para no perder el giro del usuario.
   */
  setModels(list: readonly ViewerEntry[]): void {
    for (const e of this.entries) {
      this.scene.remove(e.scene.object);
      e.scene.dispose();
    }
    for (const t of this.titles) this.disposeTitle(t);
    this.titles = [];
    if (this.shelf) {
      this.scene.remove(this.shelf);
      this.shelf.geometry.dispose();
      (this.shelf.material as MeshStandardMaterial).dispose();
      this.shelf = null;
    }
    const maxH = Math.max(1, ...list.map((e) => e.model.outer.height));
    const maxD = Math.max(1, ...list.map((e) => e.model.outer.depth));
    const total =
      list.reduce((sum, e) => sum + e.model.outer.width, 0) + GAP * Math.max(0, list.length - 1);
    let x = -total / 2;
    this.entries = list.map(({ key, model, title }) => {
      const scene = new CabinetScene(model, this.palette);
      const { width, height, depth } = model.outer;
      scene.object.position.set(x + width / 2, (height - maxH) / 2, (maxD - depth) / 2);
      if (title && list.length > 1) {
        const t = titlePlane(title, width);
        const h = (t.geometry as PlaneGeometry).parameters.height;
        t.position.set(x + width / 2, height - maxH / 2 + h / 2 + 4, maxD / 2);
        t.raycast = () => undefined;
        this.titles.push(t);
        this.scene.add(t);
      }
      x += width + GAP;
      this.scene.add(scene.object);
      return { key, scene };
    });
    if (list.length > 1) {
      this.shelf = new Mesh(
        new BoxGeometry(total + GAP, SHELF, maxD + GAP / 2),
        new MeshStandardMaterial({ color: this.palette.frame, roughness: 0.8 }),
      );
      this.shelf.position.set(0, -maxH / 2 - SHELF / 2, 0);
      this.scene.add(this.shelf);
    }
    this.bounds = { width: Math.max(total, 1), height: maxH, depth: maxD };
    this.sun.position.set(0.6, 1, 1.2).multiplyScalar(this.bounds.width + maxH);
    const size = `${Math.round(total)}x${Math.round(maxH)}`;
    if (size !== this.fittedSize) {
      this.fittedSize = size;
      this.fit();
    }
    this.request();
  }

  private get(key: string): CabinetScene | undefined {
    return this.entries.find((e) => e.key === key)?.scene;
  }

  setStates(states: ReadonlyMap<string, CompartmentState>, key = ''): void {
    this.get(key)?.setStates(states);
    this.request();
  }

  setMatches(matches: ReadonlySet<string>, key = ''): void {
    this.get(key)?.setMatches(matches);
    this.request();
  }

  /** Selecciona (y abre) un cajón de un gabinete; los de los demás se cierran. */
  setSelected(id: string | null, key = ''): void {
    for (const e of this.entries) e.scene.setSelected(e.key === key ? id : null);
    this.request();
  }

  /** Abre o cierra el cajón seleccionado; devuelve si quedó abierto. */
  toggleSelected(id: string, key = ''): boolean {
    this.get(key)?.toggleSelected();
    this.request();
    return this.isOpen(id, key);
  }

  isOpen(id: string, key = ''): boolean {
    return this.get(key)?.isOpen(id) ?? false;
  }

  /** Cajón bajo un punto de la pantalla (coordenadas de cliente). */
  pick(clientX: number, clientY: number): { key: string; id: string } | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    let best: { key: string; id: string | null; distance: number } | null = null;
    for (const e of this.entries) {
      const h = e.scene.hit(this.raycaster);
      if (h && (!best || h.distance < best.distance)) best = { key: e.key, ...h };
    }
    return best?.id ? { key: best.key, id: best.id } : null;
  }

  resize(): void {
    const { clientWidth: w, clientHeight: h } = this.host;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.request();
  }

  /** Encuadra todos los gabinetes. */
  fit(): void {
    const { width, height, depth } = this.bounds;
    const half = Math.tan(((FOV / 2) * Math.PI) / 180);
    const dist =
      (Math.max(height, width / Math.max(this.camera.aspect, 0.3)) / 2 / half) * 1.35 + depth;
    this.camera.position.copy(VIEW_DIR).multiplyScalar(dist);
    this.camera.near = Math.max(1, dist / 100);
    this.camera.far = dist * 10;
    this.camera.updateProjectionMatrix();
    this.controls.target.set(0, 0, 0);
    this.controls.minDistance = Math.max(width, height) * 0.2;
    this.controls.maxDistance = dist * 4;
    this.controls.update();
    this.request();
  }

  /** Relee los colores del tema (claro/oscuro). */
  repaint(): void {
    this.palette = readPalette(this.host);
    for (const e of this.entries) e.scene.setPalette(this.palette);
    (this.shelf?.material as MeshStandardMaterial | undefined)?.color.set(this.palette.frame);
    this.request();
  }

  private request(): void {
    if (!this.frame) this.frame = requestAnimationFrame((t) => this.tick(t));
  }

  private tick(t: number): void {
    this.frame = 0;
    const dt = this.last ? Math.min(0.05, (t - this.last) / 1000) : 1 / 60;
    let moving = false;
    for (const e of this.entries) moving = e.scene.step(dt) || moving;
    const changed = this.controls.update();
    this.renderer.render(this.scene, this.camera);
    if (moving || changed) {
      this.last = t;
      this.request();
    } else {
      this.last = 0;
    }
  }

  private disposeTitle(t: Mesh): void {
    this.scene.remove(t);
    t.geometry.dispose();
    const m = t.material as MeshBasicMaterial;
    m.map?.dispose();
    m.dispose();
  }

  dispose(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    for (const t of this.titles) this.disposeTitle(t);
    this.controls.dispose();
    for (const e of this.entries) e.scene.dispose();
    this.shelf?.geometry.dispose();
    this.renderer.dispose();
  }
}
