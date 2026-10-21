import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  type AddressingScheme,
  type CabinetLayout,
  type Compartment,
  createGridLayout,
  LayoutError,
  mergeCompartments,
  splitCompartment,
} from '@silopro/cabinet-engine';
import { isLowStock } from '@silopro/domain';
import {
  EsBadge,
  EsBreadcrumb,
  EsButton,
  EsFormField,
  EsInput,
  EsKbd,
  EsSelect,
  EsToastService,
  normalizeSearch,
} from '@elikarsystems/ui';
import { demoStock, type DemoStock } from './demo-data';

type CellState = 'empty' | 'ok' | 'low';

const CELL_W = 44;
const CELL_H = 28;
const GAP = 3;

/**
 * Vista frontal 2D de un gabinete (demostración de Fase 1).
 * Valida el motor de gabinetes (@silopro/cabinet-engine) en la interfaz:
 * direccionamiento, selección, fusión/división, búsqueda y ocupación.
 * El editor completo con persistencia llega en la Fase 3.
 */
@Component({
  selector: 'sp-cabinet-demo',
  imports: [FormsModule, EsBadge, EsBreadcrumb, EsButton, EsFormField, EsInput, EsKbd, EsSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex h-full min-h-0 flex-col">
      <div class="flex h-11 shrink-0 items-center gap-3 border-b border-border px-4">
        <es-breadcrumb [items]="[{ label: 'Gabinetes' }, { label: 'Demostración' }]" />
        <es-badge tone="warning" class="ml-auto">Datos ficticios</es-badge>
      </div>

      <div class="flex shrink-0 flex-wrap items-end gap-3 border-b border-border px-4 py-2.5">
        <es-form-field label="Filas" #fr="esFormField" class="w-20">
          <input
            esInput
            type="number"
            min="1"
            max="60"
            [id]="fr.controlId"
            [ngModel]="rows()"
            (ngModelChange)="resize($event, columns())"
          />
        </es-form-field>
        <es-form-field label="Columnas" #fc="esFormField" class="w-20">
          <input
            esInput
            type="number"
            min="1"
            max="40"
            [id]="fc.controlId"
            [ngModel]="columns()"
            (ngModelChange)="resize(rows(), $event)"
          />
        </es-form-field>
        <es-form-field label="Direccionamiento" #fa="esFormField" class="w-44">
          <select
            esSelect
            [id]="fa.controlId"
            [ngModel]="scheme()"
            (ngModelChange)="setScheme($event)"
          >
            <option value="row-letter">Fila letra · A1</option>
            <option value="column-letter">Columna letra · A1</option>
            <option value="numeric">Numérico · 1-1</option>
          </select>
        </es-form-field>
        <es-form-field
          label="Buscar artículo, SKU o posición"
          #fs="esFormField"
          class="min-w-56 flex-1"
        >
          <input
            esInput
            type="search"
            placeholder="p. ej. ESP32, RES-10K, C4"
            [id]="fs.controlId"
            [ngModel]="query()"
            (ngModelChange)="query.set($event)"
          />
        </es-form-field>
        <div class="flex gap-2">
          <button esButton (click)="merge()" [disabled]="!selectionRect()">
            Fusionar selección
          </button>
          <button esButton (click)="split()" [disabled]="!canSplit()">Dividir</button>
        </div>
      </div>

      <div class="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div class="min-h-0 min-w-0 flex-1 overflow-auto bg-surface-sunken p-4">
          <svg
            role="application"
            aria-roledescription="gabinete"
            [attr.aria-label]="
              'Gabinete de ' +
              rows() +
              ' por ' +
              columns() +
              '. Use las flechas para moverse y Mayús para seleccionar un rango.'
            "
            tabindex="0"
            class="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
            [attr.width]="svgWidth()"
            [attr.height]="svgHeight()"
            [attr.viewBox]="'0 0 ' + svgWidth() + ' ' + svgHeight()"
            (keydown)="onKeydown($event)"
          >
            <rect
              [attr.width]="svgWidth()"
              [attr.height]="svgHeight()"
              rx="6"
              class="fill-(--es-primary-700) dark:fill-border-strong"
            />
            @for (c of layout().compartments; track c.id) {
              <g class="cursor-pointer" (click)="select(c, $event.shiftKey)">
                <rect
                  [attr.x]="x(c.column)"
                  [attr.y]="y(c.row)"
                  [attr.width]="c.columnSpan * cellW + (c.columnSpan - 1) * gap"
                  [attr.height]="c.rowSpan * cellH + (c.rowSpan - 1) * gap"
                  rx="2.5"
                  [class]="cellClass(c)"
                />
                <text
                  [attr.x]="x(c.column) + 4"
                  [attr.y]="y(c.row) + 11"
                  class="pointer-events-none fill-fg-muted font-mono text-[8px]"
                >
                  {{ c.address }}
                </text>
                @if (stateOf(c) !== 'empty') {
                  <rect
                    [attr.x]="x(c.column) + 4"
                    [attr.y]="y(c.row) + 16"
                    [attr.width]="c.columnSpan * cellW + (c.columnSpan - 1) * gap - 8"
                    height="4"
                    rx="2"
                    [class]="stateOf(c) === 'low' ? 'fill-warning' : 'fill-accent'"
                  />
                }
              </g>
            }
          </svg>
          <div class="mt-3 flex flex-wrap items-center gap-3 text-xs text-fg-muted">
            <span class="flex items-center gap-1.5"
              ><span class="h-1 w-4 rounded-full bg-accent"></span> Con existencias</span
            >
            <span class="flex items-center gap-1.5"
              ><span class="h-1 w-4 rounded-full bg-warning"></span> Stock bajo</span
            >
            <span class="flex items-center gap-1.5"
              ><span class="size-3 rounded-sm ring-2 ring-info"></span> Coincidencia</span
            >
            <span class="ml-auto flex items-center gap-1"
              ><kbd esKbd>←↑→↓</kbd> mover <kbd esKbd>Mayús</kbd> rango</span
            >
          </div>
        </div>

        <aside
          class="w-full shrink-0 border-t border-border bg-surface lg:w-72 lg:border-t-0 lg:border-l"
          aria-label="Detalle del compartimento"
        >
          <p class="sr-only" aria-live="polite">{{ announcement() }}</p>
          @if (selected(); as c) {
            <div class="border-b border-border px-4 py-3">
              <p class="text-xs text-fg-muted">Compartimento</p>
              <p class="font-mono text-lg font-semibold">{{ c.address }}</p>
              <p class="text-xs text-fg-muted">
                {{ c.rowSpan }}×{{ c.columnSpan }} celdas · fila {{ c.row + 1 }}, columna
                {{ c.column + 1 }}
              </p>
            </div>
            @if (stock().get(c.address); as s) {
              <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 px-4 py-3 text-sm">
                <dt class="text-fg-muted">Artículo</dt>
                <dd>{{ s.item }}</dd>
                <dt class="text-fg-muted">SKU</dt>
                <dd class="font-mono text-xs leading-5">{{ s.sku }}</dd>
                <dt class="text-fg-muted">Cantidad</dt>
                <dd class="tabular-nums">
                  {{ s.quantity }} pzas
                  @if (isLow(s)) {
                    <es-badge tone="warning" class="ml-1">Bajo (mín. {{ s.minimum }})</es-badge>
                  }
                </dd>
              </dl>
            } @else {
              <p class="px-4 py-3 text-sm text-fg-muted">Compartimento vacío.</p>
            }
          } @else {
            <p class="px-4 py-6 text-sm text-fg-muted">
              Seleccione un compartimento para ver su contenido.
            </p>
          }
          <div class="border-t border-border px-4 py-3 text-xs text-fg-muted">
            {{ layout().compartments.length }} compartimentos · {{ occupied() }} ocupados ·
            {{ matches().size }} coincidencias
          </div>
        </aside>
      </div>
    </div>
  `,
  host: { class: 'block h-full' },
})
export default class CabinetDemo {
  private readonly toast = inject(EsToastService);
  protected readonly cellW = CELL_W;
  protected readonly cellH = CELL_H;
  protected readonly gap = GAP;

  protected readonly rows = signal(10);
  protected readonly columns = signal(8);
  protected readonly scheme = signal<AddressingScheme>('row-letter');
  protected readonly layout = signal<CabinetLayout>(createGridLayout({ rows: 10, columns: 8 }));
  protected readonly query = signal('');
  protected readonly selectedId = signal<string | null>('A1');
  private readonly anchorId = signal<string | null>('A1');

  protected readonly stock = computed(() =>
    demoStock(this.layout().compartments.map((c) => c.address)),
  );
  protected readonly occupied = computed(() => this.stock().size);
  protected readonly selected = computed(
    () => this.layout().compartments.find((c) => c.id === this.selectedId()) ?? null,
  );
  protected readonly matches = computed(() => {
    const q = normalizeSearch(this.query().trim());
    const out = new Set<string>();
    if (!q) return out;
    for (const c of this.layout().compartments) {
      const s = this.stock().get(c.address);
      const hay = normalizeSearch(`${c.address} ${s?.item ?? ''} ${s?.sku ?? ''}`);
      if (c.address.toLowerCase() === q || (q.length > 1 && hay.includes(q))) out.add(c.id);
    }
    return out;
  });

  /** Rectángulo entre el ancla y la selección actual (selección con Mayús). */
  protected readonly selectionRect = computed(() => {
    const comps = this.layout().compartments;
    const a = comps.find((c) => c.id === this.anchorId());
    const b = comps.find((c) => c.id === this.selectedId());
    if (!a || !b || a.id === b.id) return null;
    const row = Math.min(a.row, b.row);
    const column = Math.min(a.column, b.column);
    return {
      row,
      column,
      rowSpan: Math.max(a.row + a.rowSpan, b.row + b.rowSpan) - row,
      columnSpan: Math.max(a.column + a.columnSpan, b.column + b.columnSpan) - column,
    };
  });

  protected readonly canSplit = computed(() => {
    const c = this.selected();
    return !!c && (c.rowSpan > 1 || c.columnSpan > 1) && !this.selectionRect();
  });

  protected readonly announcement = computed(() => {
    const c = this.selected();
    if (!c) return '';
    const s = this.stock().get(c.address);
    return `${c.address}: ${s ? `${s.item}, ${s.quantity} piezas` : 'vacío'}`;
  });

  protected readonly svgWidth = computed(() => this.columns() * (CELL_W + GAP) + GAP + 8);
  protected readonly svgHeight = computed(() => this.rows() * (CELL_H + GAP) + GAP + 8);

  protected x(column: number): number {
    return 4 + GAP + column * (CELL_W + GAP);
  }

  protected y(row: number): number {
    return 4 + GAP + row * (CELL_H + GAP);
  }

  protected stateOf(c: Compartment): CellState {
    const s = this.stock().get(c.address);
    if (!s) return 'empty';
    return this.isLow(s) ? 'low' : 'ok';
  }

  protected isLow(s: DemoStock): boolean {
    return isLowStock(s.quantity, s.minimum);
  }

  protected cellClass(c: Compartment): string {
    const rect = this.selectionRect();
    const inRect =
      rect &&
      c.row >= rect.row &&
      c.column >= rect.column &&
      c.row < rect.row + rect.rowSpan &&
      c.column < rect.column + rect.columnSpan;
    const base = 'transition-[fill] duration-75';
    if (c.id === this.selectedId()) return `${base} fill-surface stroke-accent stroke-[2.5]`;
    if (inRect) return `${base} fill-surface-hover stroke-accent stroke-1`;
    if (this.matches().has(c.id)) return `${base} fill-surface stroke-info stroke-2`;
    return `${base} fill-surface-raised hover:fill-surface-hover`;
  }

  protected select(c: Compartment, extend: boolean): void {
    this.selectedId.set(c.id);
    if (!extend) this.anchorId.set(c.id);
  }

  protected resize(rows: number, columns: number): void {
    const r = Math.max(1, Math.min(60, Math.trunc(Number(rows)) || 1));
    const col = Math.max(1, Math.min(40, Math.trunc(Number(columns)) || 1));
    this.rows.set(r);
    this.columns.set(col);
    this.rebuild();
  }

  protected setScheme(scheme: AddressingScheme): void {
    this.scheme.set(scheme);
    this.rebuild();
  }

  private rebuild(): void {
    const layout = createGridLayout({
      rows: this.rows(),
      columns: this.columns(),
      addressing: this.scheme(),
    });
    this.layout.set(layout);
    const first = layout.compartments[0]?.id ?? null;
    this.selectedId.set(first);
    this.anchorId.set(first);
  }

  protected merge(): void {
    const rect = this.selectionRect();
    if (!rect) return;
    try {
      const next = mergeCompartments(this.layout(), rect);
      this.layout.set(next);
      const merged = next.compartments.find((c) => c.row === rect.row && c.column === rect.column);
      this.selectedId.set(merged?.id ?? null);
      this.anchorId.set(merged?.id ?? null);
      this.toast.show(`Compartimento ${merged?.address} creado`, { tone: 'success' });
    } catch (e) {
      const msg = e instanceof LayoutError ? e.message : 'No se pudo fusionar';
      this.toast.show('Fusión no válida', { description: msg, tone: 'danger' });
    }
  }

  protected split(): void {
    const c = this.selected();
    if (!c) return;
    this.layout.set(splitCompartment(this.layout(), c.id));
    this.toast.show(`Compartimento ${c.address} dividido`);
  }

  /** Navegación con flechas por celdas; Mayús extiende la selección. */
  protected onKeydown(event: KeyboardEvent): void {
    const deltas: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const d = deltas[event.key];
    const current = this.selected();
    if (!d || !current) return;
    event.preventDefault();
    const row = d[0] < 0 ? current.row - 1 : d[0] > 0 ? current.row + current.rowSpan : current.row;
    const col =
      d[1] < 0
        ? current.column - 1
        : d[1] > 0
          ? current.column + current.columnSpan
          : current.column;
    const target = this.layout().compartments.find(
      (c) =>
        row >= c.row && row < c.row + c.rowSpan && col >= c.column && col < c.column + c.columnSpan,
    );
    if (target) this.select(target, event.shiftKey);
  }
}
