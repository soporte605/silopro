import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  resource,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  EsBadge,
  EsButton,
  EsDialogService,
  EsEmptyState,
  EsSkeleton,
  EsToastService,
} from '@elikarsystems/ui';
import { LucideGrid3x3, LucideMinus, LucidePackageOpen, LucidePlus } from '@lucide/angular';
import type { Item, LocationDetail, StockByLocation } from '@silopro/contracts';
import { LOCATION_KIND_LABELS } from '@silopro/domain';
import { firstValueFrom } from 'rxjs';
import { ApiRequestError, Api } from '../../core/api';
import { fmtQty } from '../../core/format';
import { SessionService } from '../../core/session';
import {
  MovementDialog,
  type MovementDialogData,
  type MovementKindInput,
} from '../items/movement-dialog';
import { ItemPicker } from './item-picker';

/**
 * Ficha de una ubicación o cajón: lo que se abre al escanear su etiqueta con
 * el celular. Muestra qué hay dentro y permite registrar entradas y salidas
 * sin buscar el artículo ni la ubicación.
 */
@Component({
  selector: 'sp-location-detail',
  imports: [
    RouterLink,
    EsBadge,
    EsButton,
    EsEmptyState,
    EsSkeleton,
    LucideGrid3x3,
    LucideMinus,
    LucidePackageOpen,
    LucidePlus,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-2xl flex-col gap-4 p-4 md:p-6">
      @if (loc.isLoading() && !loc.hasValue()) {
        <es-skeleton class="h-24 w-full" />
      } @else if (loc.error()) {
        <es-empty-state title="Ubicación no encontrada" description="Puede que se haya archivado.">
          <a esEmptyActions esButton routerLink="/ubicaciones">Ir a Ubicaciones</a>
        </es-empty-state>
      } @else if (loc.value(); as l) {
        <header class="flex flex-col gap-1">
          <p class="truncate text-xs text-fg-muted">{{ parentPath() }}</p>
          <div class="flex items-baseline gap-3">
            <h1 class="font-mono text-3xl font-bold">{{ l.code }}</h1>
            <span class="truncate text-lg">{{ l.name }}</span>
          </div>
          <div class="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
            <es-badge>{{ kindLabel() }}</es-badge>
            <span>
              {{ l.contents.length }}
              {{ l.contents.length === 1 ? 'artículo' : 'artículos' }}
              @if (l.maxItems !== null) {
                de {{ l.maxItems }}
              }
            </span>
            @if (full()) {
              <es-badge tone="primary">Lleno</es-badge>
            }
          </div>
        </header>

        <div class="flex flex-wrap gap-2">
          @if (session.canMove()) {
            <button esButton variant="primary" [disabled]="full()" (click)="addItem(l)">
              <svg lucidePlus></svg> Guardar un artículo aquí
            </button>
          }
          @if (l.parentCabinetId ?? l.cabinetId; as cabId) {
            <a
              esButton
              [routerLink]="['/gabinetes', cabId]"
              [queryParams]="l.parentCabinetId ? { resaltar: l.id } : {}"
            >
              <svg lucideGrid3x3></svg> Ver en el gabinete
            </a>
            <a
              esButton
              [routerLink]="['/gabinetes', cabId]"
              [queryParams]="l.parentCabinetId ? { resaltar: l.id, vista: '3d' } : { vista: '3d' }"
            >
              Ver en 3D
            </a>
          }
        </div>

        @if (!l.contents.length) {
          <es-empty-state
            title="Vacío"
            description="Aún no hay existencias registradas en esta ubicación."
          >
            <svg esEmptyIcon lucidePackageOpen></svg>
          </es-empty-state>
        } @else {
          <ul
            class="divide-y divide-border rounded-lg border border-border bg-surface"
            aria-label="Contenido"
          >
            @for (e of l.contents; track e.itemId) {
              <li class="flex items-center gap-3 px-3 py-3">
                <a class="min-w-0 flex-1" [routerLink]="['/inventario', e.itemId]">
                  <span class="block truncate font-medium">{{ e.itemName }}</span>
                  <span class="code text-fg-muted">{{ e.sku }}</span>
                </a>
                <span class="shrink-0 text-right tabular-nums">
                  <span class="text-lg font-semibold">{{ qty(e.onHand) }}</span>
                  <span class="text-xs text-fg-muted"> {{ e.unitSymbol }}</span>
                  @if (e.lowStock) {
                    <es-badge tone="warning" class="ml-1">Bajo</es-badge>
                  }
                </span>
                @if (session.canMove()) {
                  <span class="flex shrink-0 gap-1">
                    <button
                      esButton
                      iconOnly
                      [attr.aria-label]="'Salida de ' + e.itemName"
                      (click)="move(e.itemId, 'issue')"
                    >
                      <svg lucideMinus></svg>
                    </button>
                    <button
                      esButton
                      iconOnly
                      [attr.aria-label]="'Entrada de ' + e.itemName"
                      (click)="move(e.itemId, 'receipt')"
                    >
                      <svg lucidePlus></svg>
                    </button>
                  </span>
                }
              </li>
            }
          </ul>
        }
      }
    </div>
  `,
})
export default class LocationDetailPage {
  private readonly api = inject(Api);
  private readonly dialog = inject(EsDialogService);
  private readonly toast = inject(EsToastService);
  protected readonly session = inject(SessionService);
  protected readonly qty = fmtQty;

  readonly id = input.required<string>();

  protected readonly loc = resource({
    params: () => ({ id: this.id(), org: this.session.orgId() }),
    loader: ({ params }) => this.api.get<LocationDetail>(`/locations/${params.id}`),
  });
  protected readonly parentPath = computed(() => {
    const path = this.loc.value()?.path ?? '';
    return path.includes(' / ') ? path.slice(0, path.lastIndexOf(' / ')) : '';
  });
  protected readonly kindLabel = computed(() => {
    const l = this.loc.value();
    return l ? LOCATION_KIND_LABELS[l.kind] : '';
  });
  protected readonly full = computed(() => {
    const l = this.loc.value();
    return !!l && l.maxItems !== null && l.contents.length >= l.maxItems;
  });

  protected async move(itemId: string, kind: MovementKindInput): Promise<void> {
    try {
      const [item, stock] = await Promise.all([
        this.api.get<Item>(`/items/${itemId}`),
        this.api.get<StockByLocation[]>(`/items/${itemId}/stock`),
      ]);
      await this.openMovement(item, stock, kind);
    } catch (e) {
      this.toast.show(ApiRequestError.from(e).message, { tone: 'danger' });
    }
  }

  protected async addItem(l: LocationDetail): Promise<void> {
    const item = await firstValueFrom(
      this.dialog.open<Item, string>(ItemPicker, { data: l.path, ariaLabel: 'Elegir artículo' })
        .closed,
    );
    if (!item) return;
    const stock = await this.api.get<StockByLocation[]>(`/items/${item.id}/stock`);
    await this.openMovement(item, stock, 'receipt');
  }

  private async openMovement(
    item: Item,
    stock: StockByLocation[],
    kind: MovementKindInput,
  ): Promise<void> {
    const done = await firstValueFrom(
      this.dialog.open<boolean, MovementDialogData>(MovementDialog, {
        data: { item, kind, stock, locationId: this.id() },
        ariaLabel: 'Movimiento de existencias',
      }).closed,
    );
    if (done) this.loc.reload();
  }
}
