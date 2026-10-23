import { ChangeDetectionStrategy, Component, computed, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EsBadge, EsButton, EsEmptyState, EsSkeleton, EsTable } from '@elikarsystems/ui';
import { LucideDownload, LucideShoppingCart } from '@lucide/angular';
import type { ShoppingLine, ShoppingList as List } from '@silopro/contracts';
import { Api } from '../../core/api';
import { fmtMoney, fmtQty } from '../../core/format';
import { SessionService } from '../../core/session';
import { PageHeader } from '../page-header';

interface Group {
  supplier: string;
  lines: ShoppingLine[];
}

/** Qué comprar: faltantes de proyectos abiertos y artículos bajo su mínimo. */
@Component({
  selector: 'sp-shopping-list',
  imports: [
    RouterLink,
    EsBadge,
    EsButton,
    EsEmptyState,
    EsSkeleton,
    EsTable,
    LucideDownload,
    LucideShoppingCart,
    PageHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:p-6">
      <sp-page-header
        title="Lista de compras"
        description="Lo que falta para los proyectos abiertos y para que cada artículo quede en su mínimo, agrupado por proveedor."
      >
        @if (list.value()?.lines?.length) {
          <a spActions esButton [href]="exportUrl()" download="lista-de-compras.csv">
            <svg lucideDownload></svg> Exportar CSV
          </a>
        }
      </sp-page-header>

      @if (list.isLoading() && !list.hasValue()) {
        <es-skeleton class="h-40 w-full" />
      } @else if (!list.value()?.lines?.length) {
        <es-empty-state
          title="Nada que comprar"
          description="Aquí aparecen los artículos bajo su mínimo y lo que les falta a los proyectos abiertos."
        >
          <svg esEmptyIcon lucideShoppingCart></svg>
        </es-empty-state>
      } @else {
        <p class="text-sm">
          <span class="font-medium">{{ list.value()!.lines.length }} artículos</span>
          @if (list.value()!.estimatedTotal > 0) {
            · total estimado
            <span class="font-medium tabular-nums">{{ money(list.value()!.estimatedTotal) }}</span>
          }
          @if (list.value()!.missingCost) {
            <span class="text-fg-muted">
              ({{ list.value()!.missingCost }} sin costo registrado)</span
            >
          }
        </p>
        @for (g of groups(); track g.supplier) {
          <section class="flex flex-col gap-2">
            <h2 class="text-sm font-semibold">{{ g.supplier }}</h2>
            <div class="overflow-x-auto rounded-lg border border-border">
              <table esTable [attr.aria-label]="'Comprar a ' + g.supplier">
                <thead>
                  <tr>
                    <th scope="col">Artículo</th>
                    <th scope="col" class="num">Comprar</th>
                    <th scope="col" class="num">Disponible</th>
                    <th scope="col" class="num">Mínimo</th>
                    <th scope="col">Motivo</th>
                    <th scope="col" class="num">Costo est.</th>
                  </tr>
                </thead>
                <tbody>
                  @for (l of g.lines; track l.itemId) {
                    <tr [attr.data-sku]="l.sku">
                      <td>
                        <a class="hover:underline" [routerLink]="['/inventario', l.itemId]">
                          <span class="block font-medium">{{ l.itemName }}</span>
                          <span class="code text-fg-muted">{{ l.sku }}</span>
                        </a>
                      </td>
                      <td class="num font-semibold whitespace-nowrap">
                        {{ qty(l.toBuy) }} {{ l.unitSymbol }}
                      </td>
                      <td class="num">{{ qty(l.available) }}</td>
                      <td class="num">{{ qty(l.minStock) }}</td>
                      <td>
                        <span class="flex flex-wrap gap-1">
                          @for (r of l.reasons; track $index) {
                            @if (r.kind === 'project') {
                              <es-badge tone="primary"
                                >{{ r.projectCode }} · {{ qty(r.quantity) }}</es-badge
                              >
                            } @else {
                              <es-badge tone="warning">Stock mínimo</es-badge>
                            }
                          }
                        </span>
                      </td>
                      <td class="num whitespace-nowrap">
                        {{ l.unitCost === null ? '—' : money(l.unitCost * l.toBuy) }}
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        }
      }
    </div>
  `,
})
export default class ShoppingList {
  private readonly api = inject(Api);
  private readonly session = inject(SessionService);
  protected readonly qty = fmtQty;
  protected readonly money = fmtMoney;

  protected readonly list = resource({
    params: () => this.session.orgId(),
    loader: () => this.api.get<List>('/shopping-list'),
  });
  protected readonly groups = computed<Group[]>(() => {
    const map = new Map<string, ShoppingLine[]>();
    for (const l of this.list.value()?.lines ?? []) {
      const key = l.supplierName ?? 'Sin proveedor';
      map.set(key, [...(map.get(key) ?? []), l]);
    }
    return [...map].map(([supplier, lines]) => ({ supplier, lines }));
  });
  protected readonly exportUrl = computed(() => {
    this.session.orgId();
    return this.api.url('/shopping-list/export');
  });
}
