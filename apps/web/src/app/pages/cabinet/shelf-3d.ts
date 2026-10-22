import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  type ElementRef,
  inject,
  input,
  resource,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  EsBadge,
  EsBreadcrumb,
  EsButton,
  EsEmptyState,
  EsFormField,
  EsInput,
  EsSkeleton,
  normalizeSearch,
} from '@elikarsystems/ui';
import { LucideGrid3x3 } from '@lucide/angular';
import { buildCellIndex, type CabinetLayout, cabinetSceneModel } from '@silopro/cabinet-engine';
import { CABINET_STYLE_INFO } from '@silopro/contracts';
import type {
  Cabinet,
  CabinetStockEntry,
  CabinetSummary,
  CompartmentState,
  LocationDetail,
} from '@silopro/contracts';
import { Api } from '../../core/api';
import { fmtQty } from '../../core/format';
import { SessionService } from '../../core/session';
import type { CabinetViewer } from './cabinet-3d/cabinet-viewer';

interface ShelfCabinet {
  cabinet: Cabinet;
  layout: CabinetLayout;
  stock: CabinetStockEntry[];
}

interface Selection {
  cabinetId: string;
  compartmentId: string;
}

const toLayout = (c: Cabinet): CabinetLayout => ({
  rows: c.rows,
  columns: c.columns,
  addressing: c.addressing,
  rowOrigin: c.rowOrigin,
  compartments: c.compartments,
});

/**
 * Vista 3D de todos los gabinetes de un mismo lugar (estante, zona…), uno
 * junto a otro. Sirve para encontrar a simple vista en qué gabinete y cajón
 * está un artículo: la búsqueda atenúa todo lo que no coincide.
 */
@Component({
  selector: 'sp-shelf-3d',
  imports: [
    RouterLink,
    EsBadge,
    EsBreadcrumb,
    EsButton,
    EsEmptyState,
    EsFormField,
    EsInput,
    EsSkeleton,
    LucideGrid3x3,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block h-full' },
  template: `
    <div class="flex h-full min-h-0 flex-col">
      <div class="flex h-11 shrink-0 items-center gap-3 border-b border-border px-4">
        <es-breadcrumb
          [items]="[
            { label: 'Gabinetes', link: '/gabinetes' },
            { label: (place.value()?.code ?? '…') + ' · 3D' },
          ]"
        />
      </div>
      <div class="flex shrink-0 flex-wrap items-end gap-3 border-b border-border px-4 py-2.5">
        <div class="mr-auto min-w-0">
          <h1 class="truncate text-lg font-semibold">{{ place.value()?.name ?? 'Gabinetes' }}</h1>
          <p class="truncate text-xs text-fg-muted">
            {{ place.value()?.path }} · {{ shelf.value()?.length ?? 0 }} gabinetes
          </p>
        </div>
        <es-form-field label="¿Dónde está? Artículo, SKU o cajón" #fs="esFormField" class="w-72">
          <input
            esInput
            type="search"
            placeholder="p. ej. M3, ESP32, B2"
            [id]="fs.controlId"
            [value]="query()"
            (input)="query.set($any($event.target).value)"
          />
        </es-form-field>
      </div>

      @if (shelf.isLoading() && !shelf.hasValue()) {
        <div class="p-6"><es-skeleton class="h-64 w-full" /></div>
      } @else if (!shelf.value()?.length) {
        <es-empty-state
          class="m-6"
          title="Sin gabinetes aquí"
          description="Cree un gabinete en este lugar para verlo en 3D."
        >
          <svg esEmptyIcon lucideGrid3x3></svg>
          <a esEmptyActions esButton routerLink="/gabinetes">Ir a Gabinetes</a>
        </es-empty-state>
      } @else {
        <div class="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div class="relative h-[65vh] min-w-0 shrink-0 bg-surface-sunken lg:h-auto lg:flex-1">
            <canvas
              #canvas
              class="block size-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
              tabindex="0"
              role="application"
              aria-roledescription="Vista 3D"
              [attr.aria-label]="
                'Gabinetes de ' +
                (place.value()?.name ?? '') +
                '. Flechas para recorrer los cajones, Enter para abrir o cerrar.'
              "
              [attr.data-status]="status()"
              [attr.data-selected]="selectedKey()"
              [attr.data-open]="openKey()"
              [class.cursor-pointer]="!!hovered()"
              (pointerdown)="press = { x: $event.clientX, y: $event.clientY }"
              (pointerup)="up($event)"
              (pointermove)="hover($event)"
              (pointerleave)="hovered.set(null)"
              (keydown)="key($event)"
            ></canvas>
            @if (status() === 'failed') {
              <p
                class="absolute inset-x-4 top-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger"
                role="alert"
              >
                Este navegador no puede mostrar la vista 3D (WebGL no disponible).
              </p>
            } @else if (status() === 'loading') {
              <p class="absolute top-4 left-4 text-sm text-fg-muted" role="status">
                Cargando vista 3D…
              </p>
            } @else {
              @if (hovered(); as h) {
                <span
                  class="pointer-events-none absolute top-3 left-3 rounded bg-surface/90 px-2 py-1 font-mono text-sm font-semibold shadow-sm"
                  >{{ h }}</span
                >
              }
              <button esButton size="sm" class="absolute top-2 right-2" (click)="viewer?.fit()">
                Encuadrar
              </button>
            }
          </div>

          <aside
            class="w-full shrink-0 overflow-y-auto border-t border-border bg-surface lg:w-80 lg:border-t-0 lg:border-l"
            aria-label="Detalle del cajón"
          >
            @if (selectedInfo(); as s) {
              <div class="border-b border-border px-4 py-3">
                <p class="text-xs text-fg-muted">{{ s.cabinet.code }} · {{ s.cabinet.name }}</p>
                <p class="font-mono text-lg font-semibold">{{ s.compartment.address }}</p>
                <p class="text-sm">{{ s.compartment.name }}</p>
                <a
                  esButton
                  size="sm"
                  class="mt-2"
                  [routerLink]="['/gabinetes', s.cabinet.id]"
                  [queryParams]="{ resaltar: s.compartment.locationId, vista: '3d' }"
                  >Abrir {{ styleInfo(s.cabinet).label.toLowerCase() }}</a
                >
              </div>
              @if (s.entries.length) {
                <ul class="divide-y divide-border" aria-label="Contenido del cajón">
                  @for (e of s.entries; track e.itemId) {
                    <li class="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
                      <a class="min-w-0 hover:underline" [routerLink]="['/inventario', e.itemId]">
                        <span class="block truncate font-medium">{{ e.itemName }}</span>
                        <span class="code text-fg-muted">{{ e.sku }}</span>
                      </a>
                      <span class="shrink-0 text-right tabular-nums">
                        {{ qty(e.onHand) }} {{ e.unitSymbol }}
                        @if (e.lowStock) {
                          <es-badge tone="warning" class="ml-1">Bajo</es-badge>
                        }
                      </span>
                    </li>
                  }
                </ul>
              } @else {
                <p class="px-4 py-3 text-sm text-fg-muted">{{ styleInfo(s.cabinet).emptyCell }}.</p>
              }
            } @else {
              <p class="px-4 py-6 text-sm text-fg-muted">
                Toque un cajón o una charola para ver qué tiene, o busque un artículo.
              </p>
            }
            @if (query().trim()) {
              <div class="border-t border-border px-4 py-3 text-xs text-fg-muted" role="status">
                {{ matchCount() }} {{ matchCount() === 1 ? 'cajón coincide' : 'cajones coinciden' }}
              </div>
            }
          </aside>
        </div>
      }
    </div>
  `,
})
export default class Shelf3d {
  private readonly api = inject(Api);
  private readonly session = inject(SessionService);
  protected readonly qty = fmtQty;
  protected readonly styleInfo = (c: CabinetSummary) => CABINET_STYLE_INFO[c.style];

  /** Ubicación que contiene los gabinetes (parámetro de ruta). */
  readonly id = input.required<string>();

  protected readonly place = resource({
    params: () => ({ id: this.id(), org: this.session.orgId() }),
    loader: ({ params }) => this.api.get<LocationDetail>(`/locations/${params.id}`),
  });
  protected readonly shelf = resource({
    params: () => ({ id: this.id(), org: this.session.orgId() }),
    loader: async ({ params }): Promise<ShelfCabinet[]> => {
      const all = await this.api.get<CabinetSummary[]>('/cabinets');
      const here = all
        .filter((c) => c.parentId === params.id)
        .sort((a, b) => a.code.localeCompare(b.code, 'es', { numeric: true }));
      return Promise.all(
        here.map(async (c) => {
          const [cabinet, stock] = await Promise.all([
            this.api.get<Cabinet>(`/cabinets/${c.id}`),
            this.api.get<CabinetStockEntry[]>(`/cabinets/${c.id}/stock`),
          ]);
          return { cabinet, layout: toLayout(cabinet), stock };
        }),
      );
    },
  });

  private readonly canvas = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  protected readonly status = signal<'loading' | 'ready' | 'failed'>('loading');
  protected readonly query = signal('');
  protected readonly selected = signal<Selection | null>(null);
  protected readonly open = signal(false);
  protected readonly hovered = signal<string | null>(null);
  protected viewer: CabinetViewer | null = null;
  protected press: { x: number; y: number } | null = null;
  private destroyed = false;
  private cleanup = () => {};

  protected readonly selectedKey = computed(() => {
    const s = this.selected();
    return s ? `${this.byId().get(s.cabinetId)?.cabinet.code}/${s.compartmentId}` : null;
  });
  protected readonly openKey = computed(() => (this.open() ? this.selectedKey() : null));
  private readonly byId = computed(
    () => new Map((this.shelf.value() ?? []).map((c) => [c.cabinet.id, c])),
  );
  /** Coincidencias de la búsqueda por gabinete. */
  private readonly matches = computed(() => {
    const q = normalizeSearch(this.query().trim());
    const out = new Map<string, Set<string>>();
    for (const sc of this.shelf.value() ?? []) {
      const set = new Set<string>();
      if (q) {
        for (const c of sc.cabinet.compartments) {
          const items = sc.stock.filter((e) => e.locationId === c.locationId);
          const hay = normalizeSearch(
            [c.address, c.name, ...items.map((i) => `${i.itemName} ${i.sku}`)].join(' '),
          );
          if (c.address.toLowerCase() === q || (q.length > 1 && hay.includes(q))) set.add(c.id);
        }
      }
      out.set(sc.cabinet.id, set);
    }
    return out;
  });
  protected readonly matchCount = computed(() =>
    [...this.matches().values()].reduce((n, s) => n + s.size, 0),
  );
  protected readonly selectedInfo = computed(() => {
    const s = this.selected();
    const sc = s ? this.byId().get(s.cabinetId) : undefined;
    const compartment = sc?.cabinet.compartments.find((c) => c.id === s?.compartmentId);
    if (!sc || !compartment) return null;
    return {
      cabinet: sc.cabinet,
      compartment,
      entries: sc.stock.filter((e) => e.locationId === compartment.locationId),
    };
  });

  constructor() {
    // El lienzo aparece cuando llegan los gabinetes; ahí se carga Three.js.
    effect(() => {
      const c = this.canvas();
      if (c && !this.viewer && this.status() === 'loading') void this.init(c.nativeElement);
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.cleanup();
      this.viewer?.dispose();
    });
    effect(() => {
      const list = this.shelf.value();
      if (this.status() !== 'ready' || !this.viewer || !list) return;
      this.viewer.setModels(
        list.map((sc) => ({
          key: sc.cabinet.id,
          model: cabinetSceneModel(sc.layout, sc.cabinet.physical, sc.cabinet.style),
          title: sc.cabinet.code,
        })),
      );
      for (const sc of list) {
        const states = new Map<string, CompartmentState>();
        for (const c of sc.cabinet.compartments) states.set(c.id, c.state);
        this.viewer.setStates(states, sc.cabinet.id);
      }
    });
    effect(() => {
      const m = this.matches();
      this.shelf.value();
      if (this.status() !== 'ready' || !this.viewer) return;
      for (const [key, set] of m) this.viewer.setMatches(set, key);
    });
    effect(() => {
      const s = this.selected();
      this.shelf.value();
      if (this.status() !== 'ready' || !this.viewer) return;
      this.viewer.setSelected(s?.compartmentId ?? null, s?.cabinetId ?? '');
      this.open.set(!!s);
    });
  }

  private async init(canvas: HTMLCanvasElement): Promise<void> {
    try {
      const { CabinetViewer } = await import('./cabinet-3d/cabinet-viewer');
      if (this.destroyed) return;
      this.viewer = new CabinetViewer(canvas, canvas.parentElement!);
    } catch {
      this.status.set('failed');
      return;
    }
    const viewer = this.viewer;
    const resize = new ResizeObserver(() => viewer.resize());
    resize.observe(canvas.parentElement!);
    const theme = new MutationObserver(() => viewer.repaint());
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    this.cleanup = () => {
      resize.disconnect();
      theme.disconnect();
    };
    viewer.resize();
    this.status.set('ready');
  }

  private label(sel: Selection): string {
    const sc = this.byId().get(sel.cabinetId);
    const c = sc?.cabinet.compartments.find((x) => x.id === sel.compartmentId);
    return `${sc?.cabinet.code ?? ''} · ${c?.address ?? sel.compartmentId}`;
  }

  protected up(e: PointerEvent): void {
    const p = this.press;
    this.press = null;
    if (!p || Math.hypot(e.clientX - p.x, e.clientY - p.y) > 6) return;
    const hit = this.viewer?.pick(e.clientX, e.clientY);
    if (!hit) return;
    const cur = this.selected();
    if (cur && cur.cabinetId === hit.key && cur.compartmentId === hit.id) this.toggle();
    else this.selected.set({ cabinetId: hit.key, compartmentId: hit.id });
  }

  protected hover(e: PointerEvent): void {
    if (e.buttons || !this.viewer) return;
    const hit = this.viewer.pick(e.clientX, e.clientY);
    this.hovered.set(hit ? this.label({ cabinetId: hit.key, compartmentId: hit.id }) : null);
  }

  private toggle(): void {
    const s = this.selected();
    if (!this.viewer || !s) return;
    this.open.set(this.viewer.toggleSelected(s.compartmentId, s.cabinetId));
  }

  /**
   * Flechas: recorren los cajones del gabinete; al salir por un costado pasan
   * al gabinete vecino. Enter o espacio abre o cierra.
   */
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
    const list = this.shelf.value() ?? [];
    if (!d || !list.length) return;
    e.preventDefault();
    const s = this.selected();
    const idx = list.findIndex((sc) => sc.cabinet.id === s?.cabinetId);
    const sc = list[idx];
    const cur = sc?.layout.compartments.find((c) => c.id === s?.compartmentId);
    if (!sc || !cur) {
      const first = list[0]!;
      this.selected.set({
        cabinetId: first.cabinet.id,
        compartmentId: first.layout.compartments[0]!.id,
      });
      return;
    }
    const [dr, dc] = d;
    const lay = sc.layout;
    const row = dr < 0 ? cur.row - 1 : dr > 0 ? cur.row + cur.rowSpan : cur.row;
    const col = dc < 0 ? cur.column - 1 : dc > 0 ? cur.column + cur.columnSpan : cur.column;
    if (row >= 0 && row < lay.rows && col >= 0 && col < lay.columns) {
      const next = buildCellIndex(lay)[row * lay.columns + col];
      if (next) this.selected.set({ cabinetId: sc.cabinet.id, compartmentId: next });
      return;
    }
    // Salir por un costado: mismo renglón (acotado) en el gabinete vecino.
    const neighbor = dc !== 0 ? list[idx + dc] : undefined;
    if (!neighbor) return;
    const nl = neighbor.layout;
    const r = Math.min(cur.row, nl.rows - 1);
    const c = dc > 0 ? 0 : nl.columns - 1;
    const next = buildCellIndex(nl)[r * nl.columns + c];
    if (next) this.selected.set({ cabinetId: neighbor.cabinet.id, compartmentId: next });
  }
}
