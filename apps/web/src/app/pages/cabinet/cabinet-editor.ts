import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  resource,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  type CabinetLayout,
  LayoutError,
  mergeCompartments,
  resizeLayout,
  splitCompartment,
} from '@silopro/cabinet-engine';
import type {
  Cabinet,
  CabinetCompartment,
  CabinetStockEntry,
  CompartmentState,
} from '@silopro/contracts';
import {
  EsBadge,
  EsBreadcrumb,
  EsButton,
  EsFormField,
  EsInput,
  EsSkeleton,
  EsToastService,
  normalizeSearch,
} from '@elikarsystems/ui';
import { ApiRequestError, Api } from '../../core/api';
import { fmtQty } from '../../core/format';
import { SessionService } from '../../core/session';
import { CabinetGrid, selectionRect } from './cabinet-grid';

const toLayout = (c: Cabinet): CabinetLayout => ({
  rows: c.rows,
  columns: c.columns,
  addressing: c.addressing,
  rowOrigin: c.rowOrigin,
  compartments: c.compartments.map(({ id, row, column, rowSpan, columnSpan, address }) => ({
    id,
    row,
    column,
    rowSpan,
    columnSpan,
    address,
  })),
});

/**
 * Editor de un gabinete guardado: el diseño se edita en local con el motor
 * (`@silopro/cabinet-engine`) y se guarda completo; la API sincroniza los
 * cajones y rechaza quitar los que tienen existencias.
 */
@Component({
  selector: 'sp-cabinet-editor',
  imports: [
    RouterLink,
    CabinetGrid,
    EsBadge,
    EsBreadcrumb,
    EsButton,
    EsFormField,
    EsInput,
    EsSkeleton,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex h-full min-h-0 flex-col">
      <div class="flex h-11 shrink-0 items-center gap-3 border-b border-border px-4">
        <es-breadcrumb
          [items]="[{ label: 'Gabinetes', link: '/gabinetes' }, { label: cabinet()?.code ?? '…' }]"
        />
        @if (dirty()) {
          <es-badge tone="warning" class="ml-auto">Cambios sin guardar</es-badge>
        }
      </div>

      @if (cabinet(); as cab) {
        @if (layout(); as lay) {
          <div class="flex shrink-0 flex-wrap items-end gap-3 border-b border-border px-4 py-2.5">
            <div class="mr-auto min-w-0">
              <h1 class="truncate text-lg font-semibold">{{ cab.name }}</h1>
              <p class="truncate text-xs text-fg-muted">
                {{ cab.path }} · QR <span class="code">{{ cab.qrCode }}</span>
              </p>
            </div>
            @if (session.canWrite()) {
              <es-form-field label="Filas" #fr="esFormField" class="w-20">
                <input
                  esInput
                  type="number"
                  min="1"
                  max="60"
                  [id]="fr.controlId"
                  [value]="lay.rows"
                  (change)="resize($any($event.target).value, lay.columns)"
                />
              </es-form-field>
              <es-form-field label="Columnas" #fc="esFormField" class="w-20">
                <input
                  esInput
                  type="number"
                  min="1"
                  max="60"
                  [id]="fc.controlId"
                  [value]="lay.columns"
                  (change)="resize(lay.rows, $any($event.target).value)"
                />
              </es-form-field>
            }
            <es-form-field label="Buscar artículo, SKU o cajón" #fs="esFormField" class="w-64">
              <input
                esInput
                type="search"
                placeholder="p. ej. ESP32, C4"
                [id]="fs.controlId"
                [value]="query()"
                (input)="query.set($any($event.target).value)"
              />
            </es-form-field>
            @if (session.canWrite()) {
              <div class="flex flex-wrap gap-2">
                <button esButton (click)="merge()" [disabled]="!rect()">Fusionar selección</button>
                <button esButton (click)="split()" [disabled]="!canSplit()">Dividir</button>
                <button esButton (click)="discard()" [disabled]="!dirty() || saving()">
                  Descartar
                </button>
                <button
                  esButton
                  variant="primary"
                  (click)="save()"
                  [disabled]="!dirty()"
                  [loading]="saving()"
                >
                  Guardar diseño
                </button>
              </div>
            }
          </div>

          <div class="flex min-h-0 flex-1 flex-col lg:flex-row">
            <div class="min-h-0 min-w-0 flex-1 overflow-auto bg-surface-sunken p-4">
              <sp-cabinet-grid
                [label]="'Gabinete ' + cab.name"
                [layout]="lay"
                [states]="states()"
                [matches]="matches()"
                [(selectedId)]="selectedId"
                [(anchorId)]="anchorId"
              />
            </div>

            <aside
              class="w-full shrink-0 overflow-y-auto border-t border-border bg-surface lg:w-80 lg:border-t-0 lg:border-l"
              aria-label="Detalle del cajón"
            >
              <p class="sr-only" aria-live="polite">{{ announcement() }}</p>
              @if (selected(); as c) {
                <div class="border-b border-border px-4 py-3">
                  <p class="text-xs text-fg-muted">Cajón</p>
                  <p class="font-mono text-lg font-semibold">{{ c.address }}</p>
                  <p class="text-xs text-fg-muted">
                    {{ c.rowSpan }}×{{ c.columnSpan }} celdas · fila {{ c.row + 1 }}, columna
                    {{ c.column + 1 }}
                  </p>
                </div>
                @if (saved(c.id); as sc) {
                  <div class="flex flex-col gap-2 border-b border-border px-4 py-3">
                    @if (session.canWrite()) {
                      <form
                        class="flex items-end gap-2"
                        (submit)="$event.preventDefault(); rename(c.id, draftName())"
                      >
                        <es-form-field label="Nombre del cajón" #fn="esFormField" class="flex-1">
                          <input
                            esInput
                            [id]="fn.controlId"
                            [value]="draftName()"
                            (input)="draftName.set($any($event.target).value)"
                            maxlength="120"
                          />
                        </es-form-field>
                        <button esButton type="submit" [disabled]="dirty()" [loading]="renaming()">
                          Guardar
                        </button>
                      </form>
                    } @else {
                      <p class="font-medium">{{ sc.name }}</p>
                    }
                    <p class="text-xs text-fg-muted">
                      QR <span class="code">{{ sc.qrCode }}</span>
                    </p>
                  </div>
                  @if (contents().get(sc.locationId); as entries) {
                    <ul class="divide-y divide-border" aria-label="Contenido del cajón">
                      @for (e of entries; track e.itemId) {
                        <li class="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
                          <a
                            class="min-w-0 hover:underline"
                            [routerLink]="['/inventario', e.itemId]"
                          >
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
                    <p class="px-4 py-3 text-sm text-fg-muted">
                      Cajón vacío. Para guardar algo aquí registre una entrada desde el artículo y
                      elija «{{ cab.path }} / {{ c.id }}».
                    </p>
                  }
                } @else {
                  <p class="px-4 py-3 text-sm text-fg-muted">
                    Este cajón es nuevo: guarde el diseño para crearlo.
                  </p>
                }
              } @else {
                <p class="px-4 py-6 text-sm text-fg-muted">
                  Seleccione un cajón para ver su contenido.
                </p>
              }
              <div class="border-t border-border px-4 py-3 text-xs text-fg-muted">
                {{ lay.compartments.length }} cajones · {{ cab.occupiedCount }} ocupados ·
                {{ matches().size }} coincidencias
              </div>
            </aside>
          </div>
        }
      } @else if (server.error()) {
        <p class="m-6 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          No se pudo abrir el gabinete. Puede que no exista o que no tenga acceso.
        </p>
      } @else {
        <div class="p-6"><es-skeleton class="h-64 w-full" /></div>
      }
    </div>
  `,
  host: { class: 'block h-full' },
})
export default class CabinetEditor {
  private readonly api = inject(Api);
  private readonly toast = inject(EsToastService);
  protected readonly session = inject(SessionService);
  private readonly grid = viewChild(CabinetGrid);

  /** Id del gabinete (parámetro de ruta). */
  readonly id = input.required<string>();
  /** Ubicación (cajón) a resaltar al abrir: `?resaltar=<locationId>`. */
  readonly resaltar = input<string>();

  protected readonly server = resource({
    params: () => ({ id: this.id(), org: this.session.orgId() }),
    loader: ({ params }) => this.api.get<Cabinet>(`/cabinets/${params.id}`),
  });
  private readonly stock = resource({
    params: () => ({ id: this.id(), org: this.session.orgId() }),
    loader: ({ params }) => this.api.get<CabinetStockEntry[]>(`/cabinets/${params.id}/stock`),
  });

  protected readonly cabinet = computed(() =>
    this.server.hasValue() ? this.server.value() : null,
  );
  /** Diseño en edición; se reinicia cada vez que llega una versión del servidor. */
  protected readonly layout = linkedSignal(() => {
    const c = this.cabinet();
    return c ? toLayout(c) : null;
  });
  protected readonly dirty = linkedSignal(() => {
    this.cabinet();
    return false;
  });
  protected readonly query = signal('');
  protected readonly selectedId = signal<string | null>(null);
  protected readonly anchorId = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly renaming = signal(false);
  private highlighted = false;

  private readonly savedById = computed(
    () => new Map((this.cabinet()?.compartments ?? []).map((c) => [c.id, c])),
  );
  protected readonly contents = computed(() => {
    const out = new Map<string, CabinetStockEntry[]>();
    for (const e of this.stock.value() ?? []) {
      out.set(e.locationId, [...(out.get(e.locationId) ?? []), e]);
    }
    return out;
  });
  protected readonly states = computed(() => {
    const out = new Map<string, CompartmentState>();
    for (const c of this.cabinet()?.compartments ?? []) out.set(c.id, c.state);
    return out;
  });
  protected readonly matches = computed(() => {
    const q = normalizeSearch(this.query().trim());
    const out = new Set<string>();
    const lay = this.layout();
    if (!q || !lay) return out;
    for (const c of lay.compartments) {
      const saved = this.savedById().get(c.id);
      const items = saved ? (this.contents().get(saved.locationId) ?? []) : [];
      const hay = normalizeSearch(
        [c.address, saved?.name ?? '', ...items.map((i) => `${i.itemName} ${i.sku}`)].join(' '),
      );
      if (c.address.toLowerCase() === q || (q.length > 1 && hay.includes(q))) out.add(c.id);
    }
    return out;
  });
  protected readonly selected = computed(
    () => this.layout()?.compartments.find((c) => c.id === this.selectedId()) ?? null,
  );
  /** Nombre en edición del cajón seleccionado. */
  protected readonly draftName = linkedSignal(
    () => this.savedById().get(this.selectedId() ?? '')?.name ?? '',
  );
  protected readonly rect = computed(() => {
    const lay = this.layout();
    return lay ? selectionRect(lay, this.anchorId(), this.selectedId()) : null;
  });
  protected readonly canSplit = computed(() => {
    const c = this.selected();
    return !!c && (c.rowSpan > 1 || c.columnSpan > 1) && !this.rect();
  });
  protected readonly announcement = computed(() => {
    const c = this.selected();
    if (!c) return '';
    const saved = this.savedById().get(c.id);
    const n = saved ? (this.contents().get(saved.locationId)?.length ?? 0) : 0;
    return `${c.address}: ${n ? `${n} artículos` : 'vacío'}`;
  });

  constructor() {
    // Selección inicial: el cajón resaltado (desde un artículo) o el primero.
    effect(() => {
      const cab = this.cabinet();
      if (!cab || this.highlighted) return;
      this.highlighted = true;
      const target =
        cab.compartments.find((c) => c.locationId === this.resaltar()) ?? cab.compartments[0];
      if (!target) return;
      this.selectedId.set(target.id);
      this.anchorId.set(target.id);
      if (this.resaltar()) setTimeout(() => this.grid()?.scrollTo(target.id));
    });
  }

  protected saved(id: string): CabinetCompartment | undefined {
    return this.dirty() && !this.savedById().has(id) ? undefined : this.savedById().get(id);
  }

  protected qty(n: number): string {
    return fmtQty(n);
  }

  private edit(fn: (l: CabinetLayout) => CabinetLayout, failTitle: string): CabinetLayout | null {
    const lay = this.layout();
    if (!lay) return null;
    try {
      const next = fn(lay);
      this.layout.set(next);
      this.dirty.set(true);
      return next;
    } catch (e) {
      const msg = e instanceof LayoutError ? e.message : 'Operación no válida';
      this.toast.show(failTitle, { description: msg, tone: 'danger' });
      return null;
    }
  }

  protected resize(rows: number | string, columns: number | string): void {
    const r = Math.max(1, Math.min(60, Math.trunc(Number(rows)) || 1));
    const c = Math.max(1, Math.min(60, Math.trunc(Number(columns)) || 1));
    const next = this.edit((l) => resizeLayout(l, r, c), 'No se pudo cambiar el tamaño');
    if (next && !next.compartments.some((x) => x.id === this.selectedId())) {
      this.selectedId.set(next.compartments[0]?.id ?? null);
      this.anchorId.set(next.compartments[0]?.id ?? null);
    }
  }

  protected merge(): void {
    const rect = this.rect();
    if (!rect) return;
    const next = this.edit((l) => mergeCompartments(l, rect), 'Fusión no válida');
    const merged = next?.compartments.find((c) => c.row === rect.row && c.column === rect.column);
    if (merged) {
      this.selectedId.set(merged.id);
      this.anchorId.set(merged.id);
    }
  }

  protected split(): void {
    const c = this.selected();
    if (c) this.edit((l) => splitCompartment(l, c.id), 'No se pudo dividir');
  }

  protected discard(): void {
    const cab = this.cabinet();
    if (cab) this.layout.set(toLayout(cab));
    this.dirty.set(false);
  }

  protected async save(): Promise<void> {
    const cab = this.cabinet();
    const lay = this.layout();
    if (!cab || !lay) return;
    this.saving.set(true);
    try {
      const next = await this.api.put<Cabinet>(`/cabinets/${cab.id}/layout`, {
        version: cab.version,
        rows: lay.rows,
        columns: lay.columns,
        compartments: lay.compartments,
      });
      this.server.set(next);
      this.stock.reload();
      this.toast.show('Diseño guardado', {
        tone: 'success',
        description: `${next.compartments.length} cajones`,
      });
    } catch (e) {
      const err = ApiRequestError.from(e);
      if (err.code === 'STALE_VERSION') {
        this.toast.show('Otra persona cambió este gabinete', {
          description: 'Se cargó la versión actual; repita sus cambios.',
          tone: 'danger',
        });
        this.server.reload();
      } else {
        this.toast.show('No se pudo guardar el diseño', {
          description: err.message,
          tone: 'danger',
        });
      }
    } finally {
      this.saving.set(false);
    }
  }

  protected async rename(compartmentId: string, name: string): Promise<void> {
    const cab = this.cabinet();
    if (!cab || !name.trim()) return;
    this.renaming.set(true);
    try {
      this.server.set(
        await this.api.patch<Cabinet>(`/cabinets/${cab.id}/compartments/${compartmentId}`, {
          name: name.trim(),
        }),
      );
      this.toast.show('Nombre guardado', { tone: 'success' });
    } catch (e) {
      this.toast.show('No se pudo renombrar', {
        description: ApiRequestError.from(e).message,
        tone: 'danger',
      });
    } finally {
      this.renaming.set(false);
    }
  }
}
