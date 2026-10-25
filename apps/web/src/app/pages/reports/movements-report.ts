import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  EsButton,
  EsEmptyState,
  EsFormField,
  EsInput,
  EsSkeleton,
  EsTable,
} from '@elikarsystems/ui';
import { LucideDownload, LucideHistory } from '@lucide/angular';
import type { MovementReport as Report } from '@silopro/contracts';
import { Api, ApiRequestError } from '../../core/api';
import { fmtDate, fmtQty } from '../../core/format';
import { SessionService } from '../../core/session';

/** Fecha local AAAA-MM-DD. */
const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Entradas, salidas y ajustes por artículo en un periodo (días completos de la hora local). */
@Component({
  selector: 'sp-movements-report',
  imports: [
    RouterLink,
    EsButton,
    EsEmptyState,
    EsFormField,
    EsInput,
    EsSkeleton,
    EsTable,
    LucideDownload,
    LucideHistory,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-4">
      <div class="flex flex-wrap items-end gap-3">
        <es-form-field label="Desde" #f="esFormField" class="w-40">
          <input
            esInput
            type="date"
            [id]="f.controlId"
            [value]="from()"
            [max]="to()"
            (change)="from.set($any($event.target).value)"
          />
        </es-form-field>
        <es-form-field label="Hasta" #t="esFormField" class="w-40">
          <input
            esInput
            type="date"
            [id]="t.controlId"
            [value]="to()"
            [min]="from()"
            (change)="to.set($any($event.target).value)"
          />
        </es-form-field>
        <div class="flex gap-1 pb-0.5" role="group" aria-label="Periodos rápidos">
          @for (p of presets; track p.days) {
            <button esButton size="sm" variant="ghost" (click)="last(p.days)">
              {{ p.label }}
            </button>
          }
        </div>
        @if (report.hasValue() && report.value().rows.length) {
          <a class="ml-auto" esButton [href]="exportUrl()" [download]="fileName()">
            <svg lucideDownload></svg> Exportar CSV
          </a>
        }
      </div>

      @if (invalid(); as msg) {
        <p class="text-sm text-danger" role="alert">{{ msg }}</p>
      } @else if (report.error(); as e) {
        <p class="text-sm text-danger" role="alert">{{ errorText(e) }}</p>
      } @else if (!report.hasValue()) {
        <es-skeleton class="h-40 w-full" />
      } @else if (!report.value().rows.length) {
        <es-empty-state title="Sin movimientos" description="No hubo movimientos en este periodo.">
          <svg esEmptyIcon lucideHistory></svg>
        </es-empty-state>
      } @else {
        @let r = report.value()!;
        <p class="text-sm">
          <span class="font-medium"
            >{{ r.rows.length }} {{ r.rows.length === 1 ? 'artículo' : 'artículos' }}</span
          >
          · {{ r.totals.movements }} movimientos
        </p>
        <div class="overflow-x-auto rounded-lg border border-border">
          <table esTable aria-label="Movimientos por artículo">
            <thead>
              <tr>
                <th scope="col">Artículo</th>
                <th scope="col" class="num">Entradas</th>
                <th scope="col" class="num">Salidas</th>
                <th scope="col" class="num">Ajustes</th>
                <th scope="col" class="num">Neto</th>
                <th scope="col" class="num">Transferido</th>
                <th scope="col" class="num">Movimientos</th>
                <th scope="col">Último</th>
              </tr>
            </thead>
            <tbody>
              @for (x of r.rows; track x.itemId) {
                <tr [attr.data-sku]="x.sku">
                  <td>
                    <a class="hover:underline" [routerLink]="['/inventario', x.itemId]">
                      <span class="block font-medium">{{ x.itemName }}</span>
                      <span class="code text-fg-muted">{{ x.sku }}</span>
                    </a>
                  </td>
                  <td class="num">{{ x.received ? '+' + qty(x.received) : '—' }}</td>
                  <td class="num">{{ x.issued ? '−' + qty(x.issued) : '—' }}</td>
                  <td class="num">{{ signed(x.adjusted) }}</td>
                  <td class="num font-medium whitespace-nowrap">
                    {{ signed(x.net) }} {{ x.unitSymbol }}
                  </td>
                  <td class="num">{{ x.transferred ? qty(x.transferred) : '—' }}</td>
                  <td class="num">{{ x.movements }}</td>
                  <td class="whitespace-nowrap text-fg-muted">{{ date(x.lastAt) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class MovementsReport {
  private readonly api = inject(Api);
  private readonly session = inject(SessionService);
  protected readonly qty = fmtQty;
  protected readonly date = fmtDate;
  protected readonly presets = [
    { days: 7, label: '7 días' },
    { days: 30, label: '30 días' },
    { days: 90, label: '90 días' },
  ];

  protected readonly from = signal(localDate(new Date(Date.now() - 29 * 86_400_000)));
  protected readonly to = signal(localDate(new Date()));
  private readonly query = computed(() => ({ from: this.from(), to: this.to(), tz }));
  /** Mismas reglas que la API, para no pedir un periodo imposible. */
  protected readonly invalid = computed(() => {
    const { from, to } = this.query();
    if (!from || !to) return 'Elija las dos fechas';
    if (from > to) return 'La fecha inicial va antes de la final';
    if (Date.parse(to) - Date.parse(from) > 366 * 86_400_000)
      return 'El periodo puede ser de hasta un año';
    return null;
  });

  protected readonly report = resource({
    params: () => (this.invalid() ? undefined : { org: this.session.orgId(), ...this.query() }),
    loader: ({ params: { from, to } }) =>
      this.api.get<Report>('/reports/movements', { from, to, tz }),
  });
  protected readonly exportUrl = computed(() => {
    this.session.orgId();
    return `${this.api.url('/reports/movements/export')}?${new URLSearchParams(this.query())}`;
  });
  protected readonly fileName = computed(() => `movimientos-${this.from()}-a-${this.to()}.csv`);

  protected last(days: number): void {
    this.from.set(localDate(new Date(Date.now() - (days - 1) * 86_400_000)));
    this.to.set(localDate(new Date()));
  }

  protected signed(n: number): string {
    if (!n) return '—';
    return (n > 0 ? '+' : '−') + fmtQty(Math.abs(n));
  }

  protected errorText(e: unknown): string {
    const err = ApiRequestError.from(e);
    return Object.values(err.fieldErrors())[0] ?? err.message;
  }
}
