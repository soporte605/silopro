import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';
import { EsButton } from '@elikarsystems/ui';
import {
  buildCellIndex,
  type CabinetLayout,
  type CabinetPhysicalSpec,
  cabinetSceneModel,
  DEFAULT_PHYSICAL_SPEC,
} from '@silopro/cabinet-engine';
import type { CompartmentState } from '@silopro/contracts';
import type { CabinetViewer } from './cabinet-viewer';

type Status = 'loading' | 'ready' | 'failed';

/**
 * Vista 3D de un gabinete. Three.js llega en un fragmento aparte que solo se
 * descarga al abrir esta vista. Comparte la selección con la cuadrícula 2D:
 * elegir un cajón aquí lo abre con una animación y el editor muestra su
 * contenido en el panel lateral.
 */
@Component({
  selector: 'sp-cabinet-3d',
  imports: [EsButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'relative block size-full min-h-80' },
  template: `
    <canvas
      #canvas
      class="block size-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
      tabindex="0"
      role="application"
      aria-roledescription="Vista 3D"
      [attr.aria-label]="
        label() + '. Flechas para recorrer los cajones, Enter para abrir o cerrar.'
      "
      [attr.data-status]="status()"
      [attr.data-selected]="selectedId()"
      [attr.data-open]="openId()"
      [class.cursor-pointer]="!!hovered()"
      (pointerdown)="down($event)"
      (pointerup)="up($event)"
      (pointermove)="hover($event)"
      (pointerleave)="hovered.set(null)"
      (keydown)="key($event)"
    ></canvas>
    @switch (status()) {
      @case ('loading') {
        <p class="absolute top-4 left-4 text-sm text-fg-muted" role="status">Cargando vista 3D…</p>
      }
      @case ('failed') {
        <p
          class="absolute inset-x-4 top-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger"
          role="alert"
        >
          Este navegador no puede mostrar la vista 3D (WebGL no disponible). Use la cuadrícula.
        </p>
      }
      @default {
        @if (hovered(); as h) {
          <span
            class="pointer-events-none absolute top-3 left-3 rounded bg-surface/90 px-2 py-1 font-mono text-sm font-semibold shadow-sm"
            >{{ h }}</span
          >
        }
        <button esButton size="sm" class="absolute top-2 right-2" (click)="viewer?.fit()">
          Encuadrar
        </button>
        <p
          class="pointer-events-none absolute bottom-2 left-3 hidden text-xs text-fg-muted sm:block"
        >
          Arrastre para girar · rueda o pellizco para acercar · clic en un cajón para abrirlo
        </p>
      }
    }
  `,
})
export class Cabinet3d {
  readonly layout = input.required<CabinetLayout>();
  readonly states = input<ReadonlyMap<string, CompartmentState>>(new Map());
  readonly matches = input<ReadonlySet<string>>(new Set());
  readonly label = input('Gabinete');
  /** Medidas reales del gabinete (mm). */
  readonly spec = input<CabinetPhysicalSpec>(DEFAULT_PHYSICAL_SPEC);
  readonly selectedId = model<string | null>(null);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  protected readonly status = signal<Status>('loading');
  protected readonly hovered = signal<string | null>(null);
  /** Cajón abierto; se expone en `data-open` para pruebas. */
  protected readonly openId = signal<string | null>(null);

  private readonly sceneModel = computed(() => cabinetSceneModel(this.layout(), this.spec()));
  private readonly cells = computed(() => buildCellIndex(this.layout()));
  protected viewer: CabinetViewer | null = null;
  private destroyed = false;
  private cleanup = () => {};
  private press: { x: number; y: number } | null = null;

  constructor() {
    afterNextRender(() => void this.init());
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.cleanup();
      this.viewer?.dispose();
    });

    // Un diseño nuevo (p. ej. al fusionar en la cuadrícula) reconstruye la escena
    // y vuelve a aplicar estados, búsqueda y selección.
    effect(() => {
      const m = this.sceneModel();
      if (this.status() !== 'ready' || !this.viewer) return;
      this.viewer.setModel(m);
    });
    effect(() => {
      this.sceneModel();
      if (this.status() === 'ready') this.viewer?.setStates(this.states());
    });
    effect(() => {
      this.sceneModel();
      if (this.status() === 'ready') this.viewer?.setMatches(this.matches());
    });
    effect(() => {
      this.sceneModel();
      const id = this.selectedId();
      if (this.status() !== 'ready' || !this.viewer) return;
      this.viewer.setSelected(id);
      this.openId.set(id && this.viewer.isOpen(id) ? id : null);
    });
  }

  private async init(): Promise<void> {
    try {
      const { CabinetViewer } = await import('./cabinet-viewer');
      if (this.destroyed) return;
      this.viewer = new CabinetViewer(this.canvas().nativeElement, this.host);
    } catch {
      this.status.set('failed');
      return;
    }
    const viewer = this.viewer;
    const resize = new ResizeObserver(() => viewer.resize());
    resize.observe(this.host);
    // Cambio de tema (claro/oscuro): se releen los colores.
    const theme = new MutationObserver(() => viewer.repaint());
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const media = matchMedia('(prefers-color-scheme: dark)');
    const onMedia = () => viewer.repaint();
    media.addEventListener('change', onMedia);
    this.cleanup = () => {
      resize.disconnect();
      theme.disconnect();
      media.removeEventListener('change', onMedia);
    };
    viewer.resize();
    this.status.set('ready');
  }

  private addressOf(id: string): string {
    return this.layout().compartments.find((c) => c.id === id)?.address ?? id;
  }

  protected down(e: PointerEvent): void {
    this.press = { x: e.clientX, y: e.clientY };
  }

  /** Un clic (sin arrastrar) elige el cajón; sobre el ya elegido, lo abre o cierra. */
  protected up(e: PointerEvent): void {
    const p = this.press;
    this.press = null;
    if (!p || Math.hypot(e.clientX - p.x, e.clientY - p.y) > 6) return;
    const id = this.viewer?.pick(e.clientX, e.clientY);
    if (!id) return;
    if (id === this.selectedId()) this.toggle();
    else this.selectedId.set(id);
  }

  protected hover(e: PointerEvent): void {
    if (e.buttons || !this.viewer) return;
    const id = this.viewer.pick(e.clientX, e.clientY);
    this.hovered.set(id ? this.addressOf(id) : null);
  }

  private toggle(): void {
    const id = this.selectedId();
    if (!this.viewer || !id) return;
    this.openId.set(this.viewer.toggleSelected(id) ? id : null);
  }

  /** Teclado: flechas recorren los cajones vecinos; Enter o espacio abre o cierra. */
  protected key(e: KeyboardEvent): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.toggle();
      return;
    }
    const delta: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const d = delta[e.key];
    if (!d) return;
    e.preventDefault();
    const lay = this.layout();
    const cur = lay.compartments.find((c) => c.id === this.selectedId());
    if (!cur) {
      this.selectedId.set(lay.compartments[0]?.id ?? null);
      return;
    }
    const [dr, dc] = d;
    const row = dr < 0 ? cur.row - 1 : dr > 0 ? cur.row + cur.rowSpan : cur.row;
    const col = dc < 0 ? cur.column - 1 : dc > 0 ? cur.column + cur.columnSpan : cur.column;
    if (row < 0 || col < 0 || row >= lay.rows || col >= lay.columns) return;
    const next = this.cells()[row * lay.columns + col];
    if (next) this.selectedId.set(next);
  }
}
