import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  type AddressingScheme,
  type CabinetLayout,
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
  EsSelect,
  EsToastService,
  normalizeSearch,
} from '@elikarsystems/ui';
import type { CompartmentState } from '@silopro/contracts';
import { CabinetGrid, selectionRect } from './cabinet-grid';
import { demoStock, type DemoStock } from './demo-data';

/**
 * Vista frontal 2D de un gabinete (demostración de Fase 1).
 * Valida el motor de gabinetes (@silopro/cabinet-engine) en la interfaz:
 * direccionamiento, selección, fusión/división, búsqueda y ocupación.
 * El editor completo con persistencia llega en la Fase 3.
 */
@Component({
  selector: 'sp-cabinet-demo',
  imports: [
    FormsModule,
    CabinetGrid,
    EsBadge,
    EsBreadcrumb,
    EsButton,
    EsFormField,
    EsInput,
    EsSelect,
  ],
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
          <sp-cabinet-grid
            label="Gabinete de demostración"
            [layout]="layout()"
            [states]="states()"
            [matches]="matches()"
            [(selectedId)]="selectedId"
            [(anchorId)]="anchorId"
          />
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

  protected readonly rows = signal(10);
  protected readonly columns = signal(8);
  protected readonly scheme = signal<AddressingScheme>('row-letter');
  protected readonly layout = signal<CabinetLayout>(createGridLayout({ rows: 10, columns: 8 }));
  protected readonly query = signal('');
  protected readonly selectedId = signal<string | null>('A1');
  protected readonly anchorId = signal<string | null>('A1');

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

  protected readonly selectionRect = computed(() =>
    selectionRect(this.layout(), this.anchorId(), this.selectedId()),
  );

  protected readonly states = computed(() => {
    const out = new Map<string, CompartmentState>();
    for (const [address, st] of this.stock()) {
      out.set(address, this.isLow(st) ? 'low' : 'stocked');
    }
    return out;
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

  protected isLow(s: DemoStock): boolean {
    return isLowStock(s.quantity, s.minimum);
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
}
