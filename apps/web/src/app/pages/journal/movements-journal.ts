import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  resource,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  EsBadge,
  EsButton,
  EsEmptyState,
  EsFormField,
  EsInput,
  EsSelect,
  EsSkeleton,
  EsTable,
  EsToastService,
} from '@elikarsystems/ui';
import { LucideDownload, LucideHistory } from '@lucide/angular';
import type { JournalMovement, Location, MovementPage } from '@silopro/contracts';
import { ApiRequestError, Api } from '../../core/api';
import { fmtDate, fmtQty } from '../../core/format';
import { SessionService } from '../../core/session';
import { PageHeader } from '../page-header';

const KINDS = [
  { value: '', label: 'Todos' },
  { value: 'receipt', label: 'Entradas' },
  { value: 'issue', label: 'Salidas' },
  { value: 'adjustment', label: 'Ajustes' },
  { value: 'transfer', label: 'Transferencias' },
  { value: 'consumption', label: 'Consumos' },
] as const;

const KIND_LABELS: Record<JournalMovement['kind'], string> = {
  receipt: 'Entrada',
  issue: 'Salida',
  adjustment: 'Ajuste',
  transfer: 'Transferencia',
  consumption: 'Consumo',
};

/** Diario de movimientos de toda la organización, con filtros y exportación CSV. */
@Component({
  selector: 'sp-movements-journal',
  imports: [
    RouterLink,
    PageHeader,
    EsBadge,
    EsButton,
    EsEmptyState,
    EsFormField,
    EsInput,
    EsSelect,
    EsSkeleton,
    EsTable,
    LucideDownload,
    LucideHistory,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:p-6">
      <sp-page-header
        title="Movimientos"
        description="Todo lo que entró, salió, se movió o se ajustó, de la más reciente a la más antigua."
      >
        <a spActions esButton [href]="exportUrl()" download="movimientos.csv">
          <svg lucideDownload></svg> Exportar CSV
        </a>
      </sp-page-header>

      <form
        class="flex flex-wrap items-end gap-3"
        aria-label="Filtros"
        (submit)="$event.preventDefault()"
      >
        <es-form-field label="Tipo" #k="esFormField" class="w-40">
          <select
            esSelect
            [id]="k.controlId"
            [value]="kind()"
            (change)="kind.set($any($event.target).value)"
          >
            @for (o of kinds; track o.value) {
              <option [value]="o.value">{{ o.label }}</option>
            }
          </select>
        </es-form-field>
        <es-form-field label="Ubicación" #l="esFormField" class="w-64">
          <select
            esSelect
            [id]="l.controlId"
            [value]="locationId()"
            (change)="locationId.set($any($event.target).value)"
          >
            <option value="">Todas</option>
            @for (o of locations.value() ?? []; track o.id) {
              <option [value]="o.id">{{ o.path }}</option>
            }
          </select>
        </es-form-field>
        <es-form-field label="Desde" #f="esFormField" class="w-40">
          <input
            esInput
            type="date"
            [id]="f.controlId"
            [value]="from()"
            (change)="from.set($any($event.target).value)"
          />
        </es-form-field>
        <es-form-field label="Hasta" #t="esFormField" class="w-40">
          <input
            esInput
            type="date"
            [id]="t.controlId"
            [value]="to()"
            (change)="to.set($any($event.target).value)"
          />
        </es-form-field>
      </form>

      @if (loading() && !rows().length) {
        <es-skeleton class="h-40 w-full" />
      } @else if (!rows().length) {
        <es-empty-state
          title="Sin movimientos"
          description="Nada coincide con los filtros elegidos."
        >
          <svg esEmptyIcon lucideHistory></svg>
        </es-empty-state>
      } @else {
        <div class="overflow-x-auto rounded-lg border border-border">
          <table esTable>
            <caption class="sr-only">
              Movimientos
            </caption>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Tipo</th>
                <th scope="col">Artículo</th>
                <th scope="col">Ubicación</th>
                <th scope="col" class="num">Cantidad</th>
                <th scope="col">Motivo</th>
                <th scope="col">Quién</th>
              </tr>
            </thead>
            <tbody>
              @for (m of rows(); track m.id) {
                <tr>
                  <td class="whitespace-nowrap text-fg-muted">{{ date(m.occurredAt) }}</td>
                  <td>
                    <es-badge [tone]="m.delta < 0 ? 'neutral' : 'primary'">{{
                      kindLabel[m.kind]
                    }}</es-badge>
                  </td>
                  <td>
                    <a class="hover:underline" [routerLink]="['/inventario', m.itemId]">
                      <span class="block">{{ m.itemName }}</span>
                      <span class="code text-fg-muted">{{ m.sku }}</span>
                    </a>
                  </td>
                  <td>
                    <a class="hover:underline" [routerLink]="['/ubicaciones', m.locationId]">{{
                      m.locationPath
                    }}</a>
                  </td>
                  <td class="num whitespace-nowrap">
                    {{ m.delta > 0 ? '+' : '' }}{{ qty(m.delta) }} {{ m.unitSymbol }}
                  </td>
                  <td class="text-fg-muted">{{ m.reason }}</td>
                  <td class="text-fg-muted">{{ m.actorName }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (cursor()) {
          <button esButton class="self-center" [loading]="loading()" (click)="load(false)">
            Cargar más
          </button>
        }
      }
    </div>
  `,
})
export default class MovementsJournal {
  private readonly api = inject(Api);
  private readonly toast = inject(EsToastService);
  private readonly session = inject(SessionService);
  protected readonly qty = fmtQty;
  protected readonly date = fmtDate;
  protected readonly kinds = KINDS;
  protected readonly kindLabel = KIND_LABELS;

  protected readonly kind = signal('');
  protected readonly locationId = signal('');
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly rows = signal<JournalMovement[]>([]);
  protected readonly cursor = signal<string | null>(null);
  protected readonly loading = signal(false);

  protected readonly locations = resource({
    params: () => this.session.orgId(),
    loader: () => this.api.get<Location[]>('/locations'),
  });

  private readonly filters = computed(() => ({
    kind: this.kind() || undefined,
    locationId: this.locationId() || undefined,
    from: this.from() || undefined,
    to: this.to() || undefined,
  }));

  protected readonly exportUrl = computed(() => {
    if (!this.session.orgId()) return '#';
    const q = new URLSearchParams(
      Object.entries(this.filters()).filter((e): e is [string, string] => !!e[1]),
    ).toString();
    return this.api.url('/movements/export') + (q ? `?${q}` : '');
  });

  constructor() {
    effect(() => {
      this.filters();
      this.session.orgId();
      untracked(() => void this.load(true));
    });
  }

  /** Primera página (al cambiar filtros) o la siguiente. */
  protected async load(reset: boolean): Promise<void> {
    this.loading.set(true);
    try {
      const page = await this.api.get<MovementPage>('/movements', {
        ...this.filters(),
        before: reset ? undefined : (this.cursor() ?? undefined),
      });
      this.rows.update((r) => (reset ? page.movements : [...r, ...page.movements]));
      this.cursor.set(page.nextCursor);
    } catch (e) {
      this.toast.show(ApiRequestError.from(e).message, { tone: 'danger' });
    } finally {
      this.loading.set(false);
    }
  }
}
