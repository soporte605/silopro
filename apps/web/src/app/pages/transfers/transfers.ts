import { ChangeDetectionStrategy, Component, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  EsButton,
  EsDialogService,
  EsEmptyState,
  EsSkeleton,
  EsTable,
  EsToastService,
} from '@elikarsystems/ui';
import { LucideArrowLeftRight, LucidePlus } from '@lucide/angular';
import type { Item, StockByLocation, TransferSummary } from '@silopro/contracts';
import { firstValueFrom } from 'rxjs';
import { ApiRequestError, Api } from '../../core/api';
import { fmtDate, fmtQty } from '../../core/format';
import { SessionService } from '../../core/session';
import { ItemPicker } from '../locations/item-picker';
import { PageHeader } from '../page-header';
import { TransferDialog, type TransferDialogData } from './transfer-dialog';

/** Historial de transferencias y alta de una nueva. */
@Component({
  selector: 'sp-transfers',
  imports: [
    RouterLink,
    EsButton,
    EsEmptyState,
    EsSkeleton,
    EsTable,
    LucideArrowLeftRight,
    LucidePlus,
    PageHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <sp-page-header
        title="Transferencias"
        description="Mueva existencias de una ubicación a otra en un solo paso: la salida y la entrada quedan unidas en el historial."
      >
        @if (session.canMove()) {
          <button spActions esButton variant="primary" (click)="create()">
            <svg lucidePlus></svg> Nueva transferencia
          </button>
        }
      </sp-page-header>

      @if (list.isLoading() && !list.hasValue()) {
        <es-skeleton class="h-40 w-full" />
      } @else if (!list.value()?.length) {
        <es-empty-state
          title="Sin transferencias"
          description="Cuando mueva un artículo de una ubicación a otra aparecerá aquí."
        >
          <svg esEmptyIcon lucideArrowLeftRight></svg>
        </es-empty-state>
      } @else {
        <div class="overflow-x-auto rounded-lg border border-border">
          <table esTable>
            <caption class="sr-only">
              Transferencias recientes
            </caption>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Artículo</th>
                <th scope="col" class="num">Cantidad</th>
                <th scope="col">Desde → hacia</th>
                <th scope="col">Quién</th>
              </tr>
            </thead>
            <tbody>
              @for (t of list.value(); track t.id) {
                <tr>
                  <td class="whitespace-nowrap text-fg-muted tabular-nums">
                    {{ date(t.occurredAt) }}
                  </td>
                  <td>
                    <a class="hover:underline" [routerLink]="['/inventario', t.itemId]">
                      <span class="block font-medium">{{ t.itemName }}</span>
                      <span class="code text-fg-muted">{{ t.sku }}</span>
                    </a>
                  </td>
                  <td class="num whitespace-nowrap">{{ qty(t.quantity) }} {{ t.unitSymbol }}</td>
                  <td>
                    <a class="hover:underline" [routerLink]="['/ubicaciones', t.fromLocationId]">{{
                      t.fromPath
                    }}</a>
                    <span aria-label="hacia"> → </span>
                    <a class="hover:underline" [routerLink]="['/ubicaciones', t.toLocationId]">{{
                      t.toPath
                    }}</a>
                    @if (t.reason) {
                      <span class="block text-xs text-fg-muted">{{ t.reason }}</span>
                    }
                  </td>
                  <td class="whitespace-nowrap">{{ t.actorName }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export default class Transfers {
  private readonly api = inject(Api);
  private readonly dialog = inject(EsDialogService);
  private readonly toast = inject(EsToastService);
  protected readonly session = inject(SessionService);
  protected readonly qty = fmtQty;
  protected readonly date = fmtDate;

  protected readonly list = resource({
    params: () => ({ org: this.session.orgId() }),
    loader: () => this.api.get<TransferSummary[]>('/transfers'),
  });

  protected async create(): Promise<void> {
    const item = await firstValueFrom(
      this.dialog.open<Item, string>(ItemPicker, {
        data: 'Artículo a mover',
        ariaLabel: 'Elegir artículo',
      }).closed,
    );
    if (!item) return;
    try {
      const stock = await this.api.get<StockByLocation[]>(`/items/${item.id}/stock`);
      const done = await firstValueFrom(
        this.dialog.open<boolean, TransferDialogData>(TransferDialog, {
          data: { item, stock },
          ariaLabel: 'Mover existencias',
        }).closed,
      );
      if (done) this.list.reload();
    } catch (e) {
      this.toast.show(ApiRequestError.from(e).message, { tone: 'danger' });
    }
  }
}
