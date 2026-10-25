import { ChangeDetectionStrategy, Component, computed, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EsButton, EsEmptyState, EsSkeleton, EsTable } from '@elikarsystems/ui';
import { LucideDownload, LucideWallet } from '@lucide/angular';
import type { ValuationReport as Report } from '@silopro/contracts';
import { Api } from '../../core/api';
import { fmtMoney, fmtQty } from '../../core/format';
import { SessionService } from '../../core/session';

/** Existencia × costo registrado, por categoría y por artículo. */
@Component({
  selector: 'sp-valuation-report',
  imports: [RouterLink, EsButton, EsEmptyState, EsSkeleton, EsTable, LucideDownload, LucideWallet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (report.isLoading() && !report.hasValue()) {
      <es-skeleton class="h-40 w-full" />
    } @else if (report.error()) {
      <p class="text-sm text-danger" role="alert">
        No se pudo cargar el reporte; recargue la página.
      </p>
    } @else if (!report.hasValue() || !report.value().rows.length) {
      <es-empty-state
        title="Sin existencias"
        description="Cuando registre entradas, aquí verá cuánto vale su inventario."
      >
        <svg esEmptyIcon lucideWallet></svg>
      </es-empty-state>
    } @else {
      @let r = report.value()!;
      <div class="flex flex-col gap-4">
        <div class="flex flex-wrap items-end gap-3">
          <div>
            <p class="text-xs text-fg-muted">Valor total</p>
            <p class="text-2xl font-semibold tabular-nums" data-testid="valor-total">
              {{ money(r.totalValue) }}
            </p>
            @if (r.missingCost) {
              <p class="text-xs text-fg-muted">
                {{
                  r.missingCost === 1
                    ? '1 artículo con existencia no tiene'
                    : r.missingCost + ' artículos con existencia no tienen'
                }}
                costo registrado
              </p>
            }
          </div>
          <a class="ml-auto" esButton [href]="exportUrl()" download="valor-del-inventario.csv">
            <svg lucideDownload></svg> Exportar CSV
          </a>
        </div>

        <div class="overflow-x-auto rounded-lg border border-border">
          <table esTable aria-label="Valor por categoría">
            <thead>
              <tr>
                <th scope="col">Categoría</th>
                <th scope="col" class="num">Artículos</th>
                <th scope="col" class="num">Sin costo</th>
                <th scope="col" class="num">Valor</th>
              </tr>
            </thead>
            <tbody>
              @for (c of r.byCategory; track c.categoryName) {
                <tr>
                  <td>{{ c.categoryName ?? 'Sin categoría' }}</td>
                  <td class="num">{{ c.itemCount }}</td>
                  <td class="num">{{ c.missingCost || '—' }}</td>
                  <td class="num font-medium">{{ money(c.value) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div class="overflow-x-auto rounded-lg border border-border">
          <table esTable aria-label="Valor por artículo">
            <thead>
              <tr>
                <th scope="col">Artículo</th>
                <th scope="col">Categoría</th>
                <th scope="col" class="num">Existencia</th>
                <th scope="col" class="num">Apartado</th>
                <th scope="col" class="num">Costo</th>
                <th scope="col" class="num">Valor</th>
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
                  <td class="text-fg-muted">{{ x.categoryName ?? '—' }}</td>
                  <td class="num whitespace-nowrap">{{ qty(x.onHand) }} {{ x.unitSymbol }}</td>
                  <td class="num">{{ x.reserved ? qty(x.reserved) : '—' }}</td>
                  <td class="num">{{ money(x.unitCost) }}</td>
                  <td class="num font-medium">{{ money(x.value) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }
  `,
})
export class ValuationReport {
  private readonly api = inject(Api);
  private readonly session = inject(SessionService);
  protected readonly qty = fmtQty;
  protected readonly money = fmtMoney;

  protected readonly report = resource({
    params: () => this.session.orgId(),
    loader: () => this.api.get<Report>('/reports/valuation'),
  });
  protected readonly exportUrl = computed(() => {
    this.session.orgId();
    return this.api.url('/reports/valuation/export');
  });
}
