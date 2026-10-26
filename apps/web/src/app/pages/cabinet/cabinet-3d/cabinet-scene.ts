import type { CabinetSceneModel, SceneBox } from '@silopro/cabinet-engine';
import type { CompartmentState } from '@silopro/contracts';
import {
  BoxGeometry,
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  EdgesGeometry,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  type Raycaster,
  SRGBColorSpace,
} from 'three';

/** Colores de la escena, leídos de los tokens del tema. */
export interface ScenePalette {
  frame: string;
  empty: string;
  stocked: string;
  low: string;
  full: string;
  selection: string;
}

/** Más cajones que esto y no se dibujan etiquetas (la textura crecería demasiado). */
export const MAX_LABELS = 400;
/** Velocidad de apertura: fracción del recorrido por segundo. */
const OPEN_SPEED = 3.5;
/** Destellos por segundo del cajón localizado. */
const FLASH_RATE = 1.5;

const UNIT_BOX = new BoxGeometry(1, 1, 1);
const tmp = new Matrix4();
const tmpColor = new Color();
const MUTED = new Color('#9ca3af');
const FLASH = new Color();

const boxMatrix = (b: SceneBox, dz = 0): Matrix4 =>
  tmp.makeScale(b.width, b.height, b.depth).setPosition(b.x, b.y, b.z + dz);

/**
 * Escena Three.js de un gabinete, sin renderizador: se puede construir y
 * consultar (selección por rayos) sin WebGL, lo que permite probarla.
 * Cuerpos, frentes y paneles son `InstancedMesh`: pocas llamadas de dibujo
 * aunque el gabinete tenga cientos de cajones.
 */
export class CabinetScene {
  /** Raíz del gabinete; el visor la coloca en su escena (varios gabinetes, uno junto a otro). */
  readonly object = new Group();
  private readonly panels: InstancedMesh;
  private readonly bodies: InstancedMesh;
  private readonly fronts: InstancedMesh;
  private readonly labels: Mesh[] = [];
  private readonly outline: LineSegments;
  private readonly materials: { dispose(): void }[] = [];
  private readonly indexById = new Map<string, number>();
  /** Apertura actual (0 cerrado, 1 abierto) y objetivo, por cajón. */
  private readonly open: Float32Array;
  private readonly target: Float32Array;
  private states: ReadonlyMap<string, CompartmentState> = new Map();
  private matches: ReadonlySet<string> = new Set();
  private selected: string | null = null;
  /** Cajón que destella («¿dónde está?») y segundos que le quedan. */
  private flashing: { index: number; left: number; elapsed: number } | null = null;

  constructor(
    readonly model: CabinetSceneModel,
    private palette: ScenePalette,
  ) {
    const n = model.drawers.length;
    this.open = new Float32Array(n);
    this.target = new Float32Array(n);
    model.drawers.forEach((d, i) => this.indexById.set(d.id, i));

    const frameMat = new MeshStandardMaterial({ roughness: 0.7, metalness: 0 });
    const bodyMat = new MeshStandardMaterial({ roughness: 0.55, metalness: 0 });
    // Frente «transparente»: deja ver el color del cajón y su contenido.
    const frontMat = new MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.15,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    const outlineMat = new LineBasicMaterial();
    this.materials.push(frameMat, bodyMat, frontMat, outlineMat);

    this.panels = new InstancedMesh(UNIT_BOX, frameMat, model.panels.length);
    model.panels.forEach((p, i) => this.panels.setMatrixAt(i, boxMatrix(p)));

    this.bodies = new InstancedMesh(UNIT_BOX, bodyMat, n);
    this.fronts = new InstancedMesh(UNIT_BOX, frontMat, n);
    this.bodies.instanceMatrix.setUsage(DynamicDrawUsage);
    this.fronts.instanceMatrix.setUsage(DynamicDrawUsage);
    this.fronts.renderOrder = 1;

    this.outline = new LineSegments(new EdgesGeometry(UNIT_BOX), outlineMat);
    this.outline.visible = false;
    this.outline.renderOrder = 2;

    this.object.add(this.panels, this.bodies, this.fronts, this.outline);
    if (n <= MAX_LABELS) this.buildLabels();

    this.setPalette(palette);
    this.updateMatrices();
  }

  /** Etiquetas blancas con la dirección, como las impresas, en una sola textura. */
  private buildLabels(): void {
    const drawers = this.model.drawers;
    const cellW = 128;
    const cellH = 48;
    const perRow = 16;
    const canvas = document.createElement('canvas');
    canvas.width = cellW * perRow;
    canvas.height = cellH * Math.max(1, Math.ceil(drawers.length / perRow));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    drawers.forEach((d, i) => {
      const x = (i % perRow) * cellW;
      const y = Math.floor(i / perRow) * cellH;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 2, y + 2, cellW - 4, cellH - 4);
      ctx.fillStyle = '#111111';
      const size = Math.min(34, (cellW - 16) / (Math.max(d.address.length, 2) * 0.62));
      ctx.font = `700 ${size}px ui-monospace, "Geist Mono Variable", monospace`;
      ctx.fillText(d.address, x + cellW / 2, y + cellH / 2 + 1);
    });
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = 4;
    const mat = new MeshBasicMaterial({ map: texture, transparent: true });
    this.materials.push(mat, texture);
    drawers.forEach((d, i) => {
      // Proporción fija de la etiqueta (128×48), lo más grande que quepa.
      const w = Math.min(d.front.width * 0.8, d.front.height * 0.5 * (cellW / cellH));
      const h = w * (cellH / cellW);
      const geo = new PlaneGeometry(w, h);
      const u0 = ((i % perRow) * cellW) / canvas.width;
      const u1 = u0 + cellW / canvas.width;
      const v1 = 1 - (Math.floor(i / perRow) * cellH) / canvas.height;
      const v0 = v1 - cellH / canvas.height;
      geo.setAttribute('uv', geo.getAttribute('uv').clone());
      const uv = geo.getAttribute('uv');
      // PlaneGeometry: (0,1) (1,1) (0,0) (1,0).
      uv.setXY(0, u0, v1);
      uv.setXY(1, u1, v1);
      uv.setXY(2, u0, v0);
      uv.setXY(3, u1, v0);
      const label = new Mesh(geo, mat);
      label.raycast = () => undefined;
      label.renderOrder = 3;
      this.labels.push(label);
      this.object.add(label);
    });
  }

  setPalette(palette: ScenePalette): void {
    this.palette = palette;
    (this.panels.material as MeshStandardMaterial).color.set(palette.frame);
    (this.outline.material as LineBasicMaterial).color.set(palette.selection);
    this.updateColors();
  }

  setStates(states: ReadonlyMap<string, CompartmentState>): void {
    this.states = states;
    this.updateColors();
  }

  /** Cajones que coinciden con la búsqueda; el resto se atenúa. */
  setMatches(matches: ReadonlySet<string>): void {
    this.matches = matches;
    this.updateColors();
  }

  /** Selecciona y abre un cajón; los demás se cierran. */
  setSelected(id: string | null, open = true): void {
    this.selected = id;
    this.target.fill(0);
    const i = id === null ? undefined : this.indexById.get(id);
    if (i !== undefined && open) this.target[i] = 1;
    this.updateMatrices();
  }

  /** Abre o cierra el cajón seleccionado. */
  toggleSelected(): void {
    const i = this.selected === null ? undefined : this.indexById.get(this.selected);
    if (i === undefined) return;
    this.target[i] = this.target[i] ? 0 : 1;
  }

  /** Hace destellar un cajón unos segundos para encontrarlo de un vistazo. */
  flash(id: string, seconds = 4): void {
    const index = this.indexById.get(id);
    this.flashing = index === undefined ? null : { index, left: seconds, elapsed: 0 };
    this.updateColors();
  }

  /** ¿Sigue destellando algún cajón? */
  isFlashing(): boolean {
    return this.flashing !== null;
  }

  isOpen(id: string): boolean {
    const i = this.indexById.get(id);
    return i !== undefined && this.target[i] === 1;
  }

  /** Avanza la animación; devuelve `true` mientras algún cajón siga moviéndose. */
  step(dt: number): boolean {
    let moving = false;
    if (this.flashing) {
      this.flashing.left -= dt;
      this.flashing.elapsed += dt;
      if (this.flashing.left <= 0) this.flashing = null;
      else moving = true;
      this.updateColors();
    }
    for (let i = 0; i < this.open.length; i++) {
      const cur = this.open[i]!;
      const to = this.target[i]!;
      if (cur === to) continue;
      const next = cur + Math.sign(to - cur) * Math.min(Math.abs(to - cur), OPEN_SPEED * dt);
      this.open[i] = next;
      if (next !== to) moving = true;
    }
    this.updateMatrices();
    return moving;
  }

  /** Id del cajón que toca el rayo, o `null`. */
  pick(raycaster: Raycaster): string | null {
    return this.hit(raycaster)?.id ?? null;
  }

  /** Primer impacto del rayo: cajón (`id`) o pared (`id: null`), con su distancia. */
  hit(raycaster: Raycaster): { id: string | null; distance: number } | null {
    this.object.updateMatrixWorld();
    const hit = raycaster.intersectObjects([this.fronts, this.bodies, this.panels], false)[0];
    if (!hit) return null;
    const id =
      hit.object === this.panels || hit.instanceId === undefined
        ? null
        : (this.model.drawers[hit.instanceId]?.id ?? null);
    return { id, distance: hit.distance };
  }

  /** Posición del frente de un cajón (cerrado), para encuadrarlo con la cámara. */
  frontOf(id: string): SceneBox | null {
    const i = this.indexById.get(id);
    return i === undefined ? null : this.model.drawers[i]!.front;
  }

  private ease(t: number): number {
    return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  }

  private updateMatrices(): void {
    const drawers = this.model.drawers;
    for (let i = 0; i < drawers.length; i++) {
      const d = drawers[i]!;
      const dz = this.ease(this.open[i]!) * d.travel;
      this.bodies.setMatrixAt(i, boxMatrix(d.body, dz));
      this.fronts.setMatrixAt(i, boxMatrix(d.front, dz));
      const label = this.labels[i];
      if (label)
        label.position.set(d.front.x, d.front.y, d.front.z + d.front.depth / 2 + 0.05 + dz);
      if (d.id === this.selected) {
        const pad = 0.6;
        this.outline.scale.set(d.front.width + pad, d.front.height + pad, d.front.depth + pad);
        this.outline.position.set(d.front.x, d.front.y, d.front.z + dz);
      }
    }
    this.outline.visible = this.selected !== null && this.indexById.has(this.selected);
    this.bodies.instanceMatrix.needsUpdate = true;
    this.fronts.instanceMatrix.needsUpdate = true;
    // La selección por rayos usa la esfera envolvente: se recalcula al consultar.
    this.bodies.boundingSphere = null;
    this.fronts.boundingSphere = null;
    this.bodies.boundingBox = null;
    this.fronts.boundingBox = null;
  }

  private updateColors(): void {
    const filtering = this.matches.size > 0;
    this.model.drawers.forEach((d, i) => {
      const state = this.states.get(d.id) ?? 'empty';
      tmpColor.set(this.palette[state]);
      if (filtering && !this.matches.has(d.id)) tmpColor.lerp(MUTED, 0.75);
      if (this.flashing?.index === i) {
        const wave = 0.5 - 0.5 * Math.cos(this.flashing.elapsed * FLASH_RATE * 2 * Math.PI);
        tmpColor.lerp(FLASH.set(this.palette.selection), wave * 0.85);
      }
      this.bodies.setColorAt(i, tmpColor);
    });
    if (this.bodies.instanceColor) this.bodies.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.outline.geometry.dispose();
    for (const l of this.labels) l.geometry.dispose();
    for (const m of this.materials) m.dispose();
    this.panels.dispose();
    this.bodies.dispose();
    this.fronts.dispose();
  }
}
