import type { CabinetSceneModel } from '@silopro/cabinet-engine';
import type { CompartmentState } from '@silopro/contracts';
import { PerspectiveCamera, Raycaster, Vector2, Vector3, WebGLRenderer } from 'three';
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

/**
 * Renderizador, cámara orbital y bucle de dibujo de un {@link CabinetScene}.
 * Solo dibuja cuando algo cambia (giro, animación, datos), para no gastar
 * batería en el celular. Es el único módulo que importa Three.js en tiempo de
 * ejecución y se carga de forma diferida.
 */
export class CabinetViewer {
  private readonly renderer: WebGLRenderer;
  private readonly camera = new PerspectiveCamera(FOV, 1, 1, 10_000);
  private readonly controls: OrbitControls;
  private readonly raycaster = new Raycaster();
  private palette: ScenePalette;
  private scene: CabinetScene | null = null;
  private fittedSize = '';
  private frame = 0;
  private last = 0;

  /** Lanza un error si el navegador no tiene WebGL. */
  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly host: HTMLElement,
  ) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.palette = readPalette(host);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.addEventListener('change', () => this.request());
  }

  /** Reconstruye la escena; solo reencuadra si cambió el tamaño, para no perder el giro. */
  setModel(model: CabinetSceneModel): void {
    this.scene?.dispose();
    this.scene = new CabinetScene(model, this.palette);
    const size = `${model.outer.width}x${model.outer.height}`;
    if (size !== this.fittedSize) {
      this.fittedSize = size;
      this.fit();
    }
    this.request();
  }

  setStates(states: ReadonlyMap<string, CompartmentState>): void {
    this.scene?.setStates(states);
    this.request();
  }

  setMatches(matches: ReadonlySet<string>): void {
    this.scene?.setMatches(matches);
    this.request();
  }

  setSelected(id: string | null): void {
    this.scene?.setSelected(id);
    this.request();
  }

  /** Abre o cierra el cajón seleccionado; devuelve si quedó abierto. */
  toggleSelected(id: string): boolean {
    this.scene?.toggleSelected();
    this.request();
    return this.isOpen(id);
  }

  isOpen(id: string): boolean {
    return this.scene?.isOpen(id) ?? false;
  }

  /** Cajón bajo un punto de la pantalla (coordenadas de cliente). */
  pick(clientX: number, clientY: number): string | null {
    if (!this.scene) return null;
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.scene.pick(this.raycaster);
  }

  resize(): void {
    const { clientWidth: w, clientHeight: h } = this.host;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.request();
  }

  /** Encuadra el gabinete completo. */
  fit(): void {
    if (!this.scene) return;
    const { width, height, depth } = this.scene.model.outer;
    const half = Math.tan(((FOV / 2) * Math.PI) / 180);
    const dist =
      (Math.max(height, width / Math.max(this.camera.aspect, 0.3)) / 2 / half) * 1.35 + depth;
    this.camera.position.copy(VIEW_DIR).multiplyScalar(dist);
    this.camera.near = Math.max(1, dist / 100);
    this.camera.far = dist * 10;
    this.camera.updateProjectionMatrix();
    this.controls.target.set(0, 0, 0);
    this.controls.minDistance = Math.max(width, height) * 0.3;
    this.controls.maxDistance = dist * 4;
    this.controls.update();
    this.request();
  }

  /** Relee los colores del tema (claro/oscuro). */
  repaint(): void {
    this.palette = readPalette(this.host);
    this.scene?.setPalette(this.palette);
    this.request();
  }

  private request(): void {
    if (!this.frame) this.frame = requestAnimationFrame((t) => this.tick(t));
  }

  private tick(t: number): void {
    this.frame = 0;
    if (!this.scene) return;
    const dt = this.last ? Math.min(0.05, (t - this.last) / 1000) : 1 / 60;
    const moving = this.scene.step(dt);
    const changed = this.controls.update();
    this.renderer.render(this.scene.scene, this.camera);
    if (moving || changed) {
      this.last = t;
      this.request();
    } else {
      this.last = 0;
    }
  }

  dispose(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.controls.dispose();
    this.scene?.dispose();
    this.renderer.dispose();
  }
}
