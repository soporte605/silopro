import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  EsBadge,
  EsButton,
  EsDialogService,
  EsEmptyState,
  EsSkeleton,
  EsTable,
  EsToastService,
} from '@elikarsystems/ui';
import { LucideBookmark, LucidePlus } from '@lucide/angular';
import type { Item, Reservation, ReservationStatus, StockByLocation } from '@silopro/contracts';
import { firstValueFrom } from 'rxjs';
import { ApiRequestError, Api } from '../../core/api';
import { ConfirmService } from '../../core/confirm';
import { fmtDate, fmtQty } from '../../core/format';
import { SessionService } from '../../core/session';
import { ItemPicker } from '../locations/item-picker';
import { PageHeader } from '../page-header';
import { ConsumeDialog } from './consume-dialog';
import { ReserveDialog, type ReserveDialogData } from './reserve-dialog';

const STATUS_LABELS: Record<ReservationStatus, string> = {
  active: 'Activa',
  released: 'Liberada',
  consumed: 'Consumida',
};

/** Reservas: lo apartado para proyectos o pedidos, con consumir y liberar. */
@Component({
  selector: 'sp-reservations',
  imports: [
    RouterLink,
    EsBadge,
    EsButton,
    EsEmptyState,
    EsSkeleton,
    EsTable,
    LucideBookmark,
    LucidePlus,
    PageHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:p-6">
      <sp-page-header
        title="Reservas"
        description="Aparte existencias para un proyecto o pedido: nadie más puede sacarlas ni moverlas hasta que se consuman o se liberen."
      >
        @if (session.canMove()) {
          <button spActions esButton variant="primary" (click)="create()">
            <svg lucidePlus></svg> Nueva reserva
          </button>
        }
      </sp-page-header>

      <div class="flex flex-wrap items-center gap-2" role="group" aria-label="Mostrar">
        <button
          esButton
          size="sm"
          [variant]="onlyActive() ? 'secondary' : 'ghost'"
          [attr.aria-pressed]="onlyActive()"
          (click)="onlyActive.set(true)"
        >
          Activas
        </button>
        <button
          esButton
          size="sm"
          [variant]="onlyActive() ? 'ghost' : 'secondary'"
          [attr.aria-pressed]="!onlyActive()"
          (click)="onlyActive.set(false)"
        >
          Todas
        </button>
        @if (articulo()) {
          <a esButton size="sm" variant="ghost" routerLink="/reservas">Quitar filtro de artículo</a>
        }
      </div>

      @if (list.isLoading() && !list.hasValue()) {
        <es-skeleton class="h-40 w-full" />
      } @else if (!list.value()?.length) {
        <es-empty-state
          [title]="onlyActive() ? 'Sin reservas activas' : 'Sin reservas'"
          description="Reserve desde aquí o desde un artículo con el botón «Reservar»."
        >
          <svg esEmptyIcon lucideBookmark></svg>
        </es-empty-state>
      } @else {
        <div class="overflow-x-auto rounded-lg border border-border">
          <table esTable>
            <caption class="sr-only">
              Reservas
            </caption>
            <thead>
              <tr>
                <th scope="col">Para qué</th>
                <th scope="col">Artículo</th>
                <th scope="col">Ubicación</th>
                <th scope="col" class="num">Apartado</th>
                <th scope="col">Estado</th>
                <th scope="col"><span class="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              @for (r of list.value(); track r.id) {
                <tr>
                  <td>
                    <span class="block font-medium">{{ r.purpose }}</span>
                    <span class="text-xs text-fg-muted"
                      >{{ r.createdByName }} · {{ date(r.createdAt) }}</span
                    >
                  </td>
                  <td>
                    <a class="hover:underline" [routerLink]="['/inventario', r.itemId]">
                      <span class="block">{{ r.itemName }}</span>
                      <span class="code text-fg-muted">{{ r.sku }}</span>
                    </a>
                  </td>
                  <td>
                    <a class="hover:underline" [routerLink]="['/ubicaciones', r.locationId]">{{
                      r.locationPath
                    }}</a>
                  </td>
                  <td class="num whitespace-nowrap">
                    @if (r.status === 'active') {
                      {{ qty(r.remaining) }} de {{ qty(r.quantity) }} {{ r.unitSymbol }}
                    } @else {
                      {{ qty(r.consumed) }} de {{ qty(r.quantity) }} usados
                    }
                  </td>
                  <td>
                    <es-badge [tone]="r.status === 'active' ? 'primary' : 'neutral'">{{
                      statusLabel[r.status]
                    }}</es-badge>
                  </td>
                  <td class="text-right whitespace-nowrap">
                    @if (r.status === 'active' && session.canMove()) {
                      <button esButton size="sm" (click)="consume(r)">Consumir</button>
                      <button esButton size="sm" variant="ghost" (click)="release(r)">
                        Liberar
                      </button>
                    }
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
export default class Reservations {
  private readonly api = inject(Api);
  private readonly dialog = inject(EsDialogService);
  private readonly toast = inject(EsToastService);
  private readonly confirm = inject(ConfirmService);
  protected readonly session = inject(SessionService);
  protected readonly qty = fmtQty;
  protected readonly date = fmtDate;
  protected readonly statusLabel = STATUS_LABELS;

  /** Filtro por artículo: `?articulo=<id>` (desde la ficha del artículo). */
  readonly articulo = input<string>();
  protected readonly onlyActive = signal(true);

  private readonly params = computed(() => ({
    org: this.session.orgId(),
    status: this.onlyActive() ? 'active' : undefined,
    itemId: this.articulo() || undefined,
  }));
  protected readonly list = resource({
    params: () => this.params(),
    loader: ({ params }) =>
      this.api.get<Reservation[]>('/reservations', {
        status: params.status,
        itemId: params.itemId,
      }),
  });

  protected async create(): Promise<void> {
    const item = await firstValueFrom(
      this.dialog.open<Item, string>(ItemPicker, {
        data: 'Artículo a reservar',
        ariaLabel: 'Elegir artículo',
      }).closed,
    );
    if (!item) return;
    try {
      const stock = await this.api.get<StockByLocation[]>(`/items/${item.id}/stock`);
      const done = await firstValueFrom(
        this.dialog.open<boolean, ReserveDialogData>(ReserveDialog, {
          data: { item, stock },
          ariaLabel: 'Reservar',
        }).closed,
      );
      if (done) this.list.reload();
    } catch (e) {
      this.toast.show(ApiRequestError.from(e).message, { tone: 'danger' });
    }
  }

  protected async consume(r: Reservation): Promise<void> {
    const done = await firstValueFrom(
      this.dialog.open<boolean, Reservation>(ConsumeDialog, {
        data: r,
        ariaLabel: 'Consumir reserva',
      }).closed,
    );
    if (done) this.list.reload();
  }

  protected async release(r: Reservation): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Liberar reserva',
      message: `${this.qty(r.remaining)} ${r.unitSymbol} de ${r.itemName} vuelven a estar disponibles en ${r.locationPath}.`,
      confirmLabel: 'Liberar',
    });
    if (!ok) return;
    try {
      await this.api.post(`/reservations/${r.id}/release`, {});
      this.toast.show('Reserva liberada', { tone: 'success' });
      this.list.reload();
    } catch (e) {
      this.toast.show(ApiRequestError.from(e).message, { tone: 'danger' });
    }
  }
}
