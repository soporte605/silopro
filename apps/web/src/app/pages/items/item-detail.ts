import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  resource,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  EsBadge,
  EsBreadcrumb,
  EsButton,
  EsDialogService,
  EsEmptyState,
  EsSkeleton,
  EsTab,
  EsTable,
  EsTabs,
  EsToastService,
} from '@elikarsystems/ui';
import {
  LucideArchive,
  LucideArrowDownToLine,
  LucideArrowUpFromLine,
  LucideClipboardCheck,
  LucidePencil,
  LucideQrCode,
} from '@lucide/angular';
import type { Category, Item, Movement, StockByLocation, Supplier } from '@silopro/contracts';
import { effectiveAttributes } from '@silopro/domain';
import { ApiRequestError, Api } from '../../core/api';
import { attributeChain } from '../../core/categories';
import { ConfirmService } from '../../core/confirm';
import { fmtDate, fmtMoney, fmtQty } from '../../core/format';
import { SessionService } from '../../core/session';
import { PageHeader } from '../page-header';
import { ItemForm, type ItemFormData } from './item-form';
import { ItemPhotos } from './item-photos';
import { MovementDialog, type MovementDialogData, type MovementKindInput } from './movement-dialog';

const KIND_LABELS: Record<Movement['kind'], string> = {
  receipt: 'Entrada',
  issue: 'Salida',
  adjustment: 'Ajuste',
  transfer: 'Transferencia',
  consumption: 'Consumo',
};

@Component({
  selector: 'sp-item-detail',
  imports: [
    LucideQrCode,
    RouterLink,
    PageHeader,
    ItemPhotos,
    EsBadge,
    EsBreadcrumb,
    EsButton,
    EsEmptyState,
    EsSkeleton,
    EsTab,
    EsTable,
    EsTabs,
    LucidePencil,
    LucideArchive,
    LucideArrowDownToLine,
    LucideArrowUpFromLine,
    LucideClipboardCheck,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:p-6">
      @if (item.error()) {
        <es-empty-state
          title="Artículo no encontrado"
          description="Puede haber sido archivado o pertenecer a otra organización."
        />
      } @else if (item.value(); as it) {
        <sp-page-header [title]="it.name" [description]="subtitle(it)">
          <es-breadcrumb
            spBefore
            class="mb-1"
            [items]="[{ label: 'Artículos', link: '/inventario' }, { label: it.sku }]"
          />
          @if (it.coverPhotoId) {
            <img
              spBefore
              [src]="api.url('/items/' + it.id + '/photos/' + it.coverPhotoId + '/thumb')"
              alt=""
              class="mb-2 size-16 rounded-md border border-border object-cover"
              width="64"
              height="64"
            />
          }
          <ng-container spActions>
            @if (session.canMove()) {
              <button esButton (click)="move('receipt')">
                <svg lucideArrowDownToLine></svg> Entrada
              </button>
              <button esButton (click)="move('issue')" [disabled]="it.onHand <= 0">
                <svg lucideArrowUpFromLine></svg> Salida
              </button>
            }
            @if (session.canAdjust()) {
              <button esButton (click)="move('adjustment')">
                <svg lucideClipboardCheck></svg> Ajuste
              </button>
            }
            <a esButton routerLink="/etiquetas" [queryParams]="{ articulo: it.id }">
              <svg lucideQrCode></svg> Etiqueta
            </a>
            @if (session.canWrite()) {
              <button esButton (click)="edit(it)"><svg lucidePencil></svg> Editar</button>
              <button
                esButton
                variant="ghost"
                iconOnly
                aria-label="Archivar artículo"
                (click)="archive(it)"
              >
                <svg lucideArchive></svg>
              </button>
            }
          </ng-container>
        </sp-page-header>

        <dl
          class="grid grid-cols-2 divide-x divide-border rounded-lg border border-border bg-surface text-sm sm:grid-cols-4"
        >
          <div class="px-3 py-2.5">
            <dt class="text-xs text-fg-muted">Existencia</dt>
            <dd class="mt-0.5 text-lg font-semibold tabular-nums">
              {{ qty(it.onHand) }}
              <span class="text-sm font-normal text-fg-muted">{{ it.unitSymbol }}</span>
            </dd>
          </div>
          <div class="px-3 py-2.5">
            <dt class="text-xs text-fg-muted">Disponible</dt>
            <dd class="mt-0.5 text-lg font-semibold tabular-nums">{{ qty(it.available) }}</dd>
          </div>
          <div class="px-3 py-2.5">
            <dt class="text-xs text-fg-muted">Mínimo</dt>
            <dd class="mt-0.5 flex items-center gap-2 text-lg font-semibold tabular-nums">
              {{ qty(it.minStock) }}
              @if (it.lowStock) {
                <es-badge tone="warning" dot>Bajo mínimo</es-badge>
              }
            </dd>
          </div>
          <div class="px-3 py-2.5">
            <dt class="text-xs text-fg-muted">Costo / precio</dt>
            <dd class="mt-0.5 tabular-nums">{{ money(it.cost) }} / {{ money(it.price) }}</dd>
          </div>
        </dl>

        <es-tabs label="Información del artículo">
          <es-tab label="Existencias" value="stock">
            @if (stock.isLoading() && !stock.hasValue()) {
              <es-skeleton class="h-16 w-full" />
            } @else if (!(stock.value() ?? []).length) {
              <es-empty-state
                title="Sin existencias registradas"
                description="Registre una entrada para asignar existencias a una ubicación."
              />
            } @else {
              <div class="overflow-x-auto rounded-lg border border-border bg-surface">
                <table esTable>
                  <caption class="sr-only">
                    Existencias por ubicación
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Ubicación</th>
                      <th scope="col" class="num w-32">Existencia</th>
                      <th scope="col" class="num w-32">Reservado</th>
                      <th scope="col" class="num w-32">Disponible</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (s of stock.value(); track s.locationId) {
                      <tr>
                        <td>
                          @if (s.cabinetId) {
                            <a
                              class="hover:underline"
                              [routerLink]="['/gabinetes', s.cabinetId]"
                              [queryParams]="{ resaltar: s.locationId }"
                              [attr.aria-label]="s.locationPath + ': ver en el gabinete'"
                              >{{ s.locationPath }}</a
                            >
                            <a
                              class="ml-2 rounded px-1 text-xs font-medium text-accent hover:bg-accent-soft"
                              [routerLink]="['/gabinetes', s.cabinetId]"
                              [queryParams]="{ resaltar: s.locationId, vista: '3d' }"
                              [attr.aria-label]="s.locationPath + ': ver en 3D'"
                              >3D</a
                            >
                          } @else {
                            {{ s.locationPath }}
                          }
                        </td>
                        <td class="num">{{ qty(s.onHand) }}</td>
                        <td class="num">{{ qty(s.reserved) }}</td>
                        <td class="num">{{ qty(s.available) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </es-tab>
          <es-tab label="Movimientos" value="moves">
            @if (!(movements.value() ?? []).length) {
              <es-empty-state
                title="Sin movimientos"
                description="Aún no hay entradas, salidas ni ajustes."
              />
            } @else {
              <div class="overflow-x-auto rounded-lg border border-border bg-surface">
                <table esTable>
                  <caption class="sr-only">
                    Historial de movimientos
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col" class="w-44">Fecha</th>
                      <th scope="col" class="w-28">Tipo</th>
                      <th scope="col">Ubicación</th>
                      <th scope="col" class="num w-28">Cambio</th>
                      <th scope="col">Motivo</th>
                      <th scope="col" class="w-40">Usuario</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (m of movements.value(); track m.id) {
                      <tr>
                        <td class="text-fg-muted tabular-nums">{{ date(m.occurredAt) }}</td>
                        <td>
                          <es-badge [tone]="m.delta >= 0 ? 'success' : 'neutral'">{{
                            kindLabel(m.kind)
                          }}</es-badge>
                        </td>
                        <td>{{ m.locationPath }}</td>
                        <td class="num" [class.text-danger]="m.delta < 0">
                          {{ m.delta > 0 ? '+' : '' }}{{ qty(m.delta) }}
                        </td>
                        <td class="text-fg-muted">{{ m.reason ?? '—' }}</td>
                        <td class="text-fg-muted">{{ m.actorName }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </es-tab>
          <es-tab label="Fotografías" value="photos">
            <sp-item-photos
              [itemId]="it.id"
              [itemName]="it.name"
              [canWrite]="session.canWrite()"
              (changed)="item.reload()"
            />
          </es-tab>
          <es-tab label="Datos" value="data">
            <dl class="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              @for (row of details(); track row.label) {
                <div class="flex gap-2 border-b border-border py-1.5">
                  <dt class="w-40 shrink-0 text-fg-muted">{{ row.label }}</dt>
                  <dd class="min-w-0 break-words" [class.font-mono]="row.mono">{{ row.value }}</dd>
                </div>
              }
            </dl>
            @if (it.description) {
              <p class="mt-3 text-sm whitespace-pre-line text-fg-muted">{{ it.description }}</p>
            }
          </es-tab>
        </es-tabs>
      } @else {
        <es-skeleton class="h-8 w-64" />
        <es-skeleton class="h-20 w-full" />
      }
    </div>
  `,
})
export default class ItemDetail {
  protected readonly api = inject(Api);
  private readonly dialog = inject(EsDialogService);
  private readonly toast = inject(EsToastService);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmService);
  protected readonly session = inject(SessionService);
  readonly id = input.required<string>();

  protected readonly qty = fmtQty;
  protected readonly money = fmtMoney;
  protected readonly date = fmtDate;

  protected readonly item = resource({
    params: () => this.id(),
    loader: ({ params }) => this.api.get<Item>(`/items/${params}`),
  });
  protected readonly stock = resource({
    params: () => this.id(),
    loader: ({ params }) => this.api.get<StockByLocation[]>(`/items/${params}/stock`),
  });
  protected readonly movements = resource({
    params: () => this.id(),
    loader: ({ params }) => this.api.get<Movement[]>(`/items/${params}/movements`),
  });
  private readonly categories = resource({ loader: () => this.api.get<Category[]>('/categories') });
  private readonly suppliers = resource({ loader: () => this.api.get<Supplier[]>('/suppliers') });

  protected readonly details = computed(() => {
    const it = this.item.value();
    if (!it) return [];
    const defs = effectiveAttributes(attributeChain(this.categories.value() ?? [], it.categoryId));
    const supplierNames = (this.suppliers.value() ?? [])
      .filter((s) => it.supplierIds.includes(s.id))
      .map((s) => s.name);
    const rows: { label: string; value: string; mono?: boolean }[] = [
      { label: 'SKU', value: it.sku, mono: true },
      { label: 'Código interno', value: it.internalCode ?? '—', mono: true },
      { label: 'Categoría', value: it.categoryName ?? '—' },
      { label: 'Fabricante', value: it.manufacturer ?? '—' },
      { label: 'Modelo', value: it.model ?? '—' },
      { label: 'Proveedores', value: supplierNames.join(', ') || '—' },
      { label: 'Código QR', value: it.qrCode, mono: true },
    ];
    for (const d of defs) {
      const v = it.attributes[d.key];
      if (v === undefined) continue;
      const shown = typeof v === 'boolean' ? (v ? 'Sí' : 'No') : String(v);
      rows.push({ label: d.label, value: d.unit ? `${shown} ${d.unit}` : shown });
    }
    return rows;
  });

  protected subtitle(it: Item): string {
    return [it.sku, it.categoryName].filter(Boolean).join(' · ');
  }

  protected kindLabel(k: Movement['kind']): string {
    return KIND_LABELS[k];
  }

  protected edit(it: Item): void {
    this.dialog
      .open<Item, ItemFormData>(ItemForm, {
        placement: 'right',
        size: 'lg',
        data: { item: it },
        ariaLabel: 'Editar artículo',
      })
      .closed.subscribe((updated) => {
        if (updated) this.item.set(updated);
      });
  }

  protected move(kind: MovementKindInput): void {
    const it = this.item.value();
    if (!it) return;
    this.dialog
      .open<boolean, MovementDialogData>(MovementDialog, {
        data: { item: it, kind, stock: this.stock.value() ?? [] },
        ariaLabel: 'Movimiento de existencias',
      })
      .closed.subscribe((done) => {
        if (!done) return;
        this.item.reload();
        this.stock.reload();
        this.movements.reload();
      });
  }

  protected async archive(it: Item): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Archivar artículo',
      message: `«${it.name}» dejará de aparecer en el catálogo. Su historial se conserva.`,
      confirmLabel: 'Archivar',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.api.delete(`/items/${it.id}`);
      this.toast.show('Artículo archivado', { description: it.sku });
      await this.router.navigateByUrl('/inventario');
    } catch (e) {
      this.toast.show(ApiRequestError.from(e).message, { tone: 'danger' });
    }
  }
}
