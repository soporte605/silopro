import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { EsButton, EsEmptyState, EsSkeleton, EsTable } from '@elikarsystems/ui';
import { LucideDownload, LucidePackageCheck } from '@lucide/angular';
import type { StaleReport as Report } from '@silopro/contracts';
import { Api } from '../../core/api';
import { fmtDate, fmtMoney, fmtQty } from '../../core/format';
import { SessionService } from '../../core/session';

/** Artículos con existencia que no se mueven desde hace N días: capital detenido. */
@Component({
  selector: 'sp-stale-report',
  imports: [
    RouterLink,
    EsButton,
    EsEmptyState,
    EsSkeleton,
    EsTable,
    LucideDownload,
    LucidePackageCheck,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-4">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-sm text-fg-muted">Sin movimiento en</span>
        <div class="flex gap-1" role="group" aria-label="Días sin movimiento">
          @for (d of options; track d) {
            <button
              esButton
              size="sm"
              [variant]="days() === d ? 'secondary' : 'ghost'"
              [attr.aria-pressed]="days() === d"
              (click)="days.set(d)"
            >
              {{ d }} días
            </button>
          }
        </div>
        @if (report.hasValue() && report.value().rows.length) {
          <a
            class="ml-auto"
            esButton
            [href]="exportUrl()"
            [download]="'sin-movimiento-' + days() + '-dias.csv'"
          >
            <svg lucideDownload></svg> Exportar CSV
          </a>
        }
      </div>

      @if (report.isLoading() && !report.hasValue()) {
        <es-skeleton class="h-40 w-full" />
      } @else if (report.error()) {
        <p class="text-sm text-danger" role="alert">
          No se pudo cargar el reporte; recargue la página.
        </p>
      } @else if (!report.hasValue() || !report.value().rows.length) {
        <es-empty-state
          title="Todo se mueve"
          description="Ningún artículo con existencia lleva tanto tiempo sin movimiento."
        >
          <svg esEmptyIcon lucidePackageCheck></svg>
        </es-empty-state>
      } @else {
        @let r = report.value()!;
        <p class="text-sm">
          <span class="font-medium"
            >{{ r.rows.length }} {{ r.rows.length === 1 ? 'artículo' : 'artículos' }}</span
          >
          @if (r.totalValue > 0) {
            · valor detenido
            <span class="font-medium tabular-nums">{{ money(r.totalValue) }}</span>
          }
        </p>
        <div class="overflow-x-auto rounded-lg border border-border">
          <table esTable aria-label="Artículos sin movimiento">
            <thead>
              <tr>
                <th scope="col">Artículo</th>
                <th scope="col" class="num">Existencia</th>
                <th scope="col" class="num">Valor</th>
                <th scope="col">Último movimiento</th>
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
                  <td class="num whitespace-nowrap">{{ qty(x.onHand) }} {{ x.unitSymbol }}</td>
                  <td class="num">{{ money(x.value) }}</td>
                  <td class="whitespace-nowrap text-fg-muted">
                    {{ x.lastMovementAt ? date(x.lastMovementAt) : 'Nunca' }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class StaleReport {
  private readonly api = inject(Api);
  private readonly session = inject(SessionService);
  protected readonly qty = fmtQty;
  protected readonly money = fmtMoney;
  protected readonly date = fmtDate;
  protected readonly options = [30, 90, 180, 365];
  protected readonly days = signal(90);

  protected readonly report = resource({
    params: () => ({ org: this.session.orgId(), days: this.days() }),
    loader: ({ params: { days } }) => this.api.get<Report>('/reports/stale', { days }),
  });
  protected readonly exportUrl = computed(() => {
    this.session.orgId();
    return `${this.api.url('/reports/stale/export')}?days=${this.days()}`;
  });
}
