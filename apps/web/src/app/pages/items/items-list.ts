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
import { Router, RouterLink } from '@angular/router';
import {
  EsBadge,
  EsButton,
  EsDialogService,
  EsEmptyState,
  EsInput,
  EsPagination,
  EsSelect,
  EsSkeleton,
  EsTable,
} from '@elikarsystems/ui';
import { LucidePackageOpen, LucidePlus, LucideSearch } from '@lucide/angular';
import type { Category, Item, Page } from '@silopro/contracts';
import { Api } from '../../core/api';
import { categoryTree } from '../../core/categories';
import { fmtQty } from '../../core/format';
import { SessionService } from '../../core/session';
import { PageHeader } from '../page-header';
import { ItemForm, type ItemFormData } from './item-form';
import { LoadingImage } from '../../core/loading-image';

const PAGE_SIZE = 50;

@Component({
  selector: 'sp-items-list',
  imports: [
    LoadingImage,
    PageHeader,
    RouterLink,
    EsBadge,
    EsButton,
    EsEmptyState,
    EsInput,
    EsPagination,
    EsSelect,
    EsSkeleton,
    EsTable,
    LucidePlus,
    LucideSearch,
    LucidePackageOpen,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:p-6">
      <sp-page-header title="Artículos" description="Catálogo y existencias de la organización.">
        @if (session.canWrite()) {
          <button spActions esButton variant="primary" (click)="create()">
            <svg lucidePlus></svg> Nuevo artículo
          </button>
        }
      </sp-page-header>

      <div class="flex flex-wrap items-center gap-2" role="search">
        <div class="relative min-w-56 flex-1">
          <svg
            lucideSearch
            [size]="14"
            class="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-fg-subtle"
          ></svg>
          <input
            esInput
            type="search"
            class="pl-7"
            placeholder="Buscar por nombre, SKU, código, fabricante o modelo"
            aria-label="Buscar artículos"
            [value]="query()"
            (input)="onSearch($any($event.target).value)"
          />
        </div>
        <div class="w-full sm:w-52">
          <select
            esSelect
            aria-label="Filtrar por categoría"
            [value]="categoryId()"
            (change)="setCategory($any($event.target).value)"
          >
            <option value="">Todas las categorías</option>
            @for (c of categoryOptions(); track c.id) {
              <option [value]="c.id">{{ c.label }}</option>
            }
          </select>
        </div>
        <label class="flex h-7 cursor-pointer items-center gap-1.5 text-sm text-fg-muted">
          <input
            type="checkbox"
            class="accent-primary"
            [checked]="lowStock()"
            (change)="setLowStock($any($event.target).checked)"
          />
          Solo bajo mínimo
        </label>
      </div>

      <div class="overflow-x-auto rounded-lg border border-border bg-surface">
        @if (items.error()) {
          <p class="p-4 text-sm text-danger" role="alert">No se pudieron cargar los artículos.</p>
        } @else if (items.isLoading() && !items.hasValue()) {
          <div class="flex flex-col gap-2 p-3" aria-busy="true">
            @for (i of [1, 2, 3, 4]; track i) {
              <es-skeleton class="h-6 w-full" />
            }
          </div>
        } @else if (page().total === 0) {
          <es-empty-state
            class="m-3"
            [title]="filtered() ? 'Sin resultados' : 'Aún no hay artículos'"
            [description]="
              filtered()
                ? 'Pruebe con otro término o quite los filtros.'
                : 'Registre su primer artículo para empezar a controlar existencias.'
            "
          >
            <svg esEmptyIcon lucidePackageOpen></svg>
            @if (!filtered() && session.canWrite()) {
              <button esEmptyActions esButton variant="primary" (click)="create()">
                <svg lucidePlus></svg> Nuevo artículo
              </button>
            }
          </es-empty-state>
        } @else {
          <table esTable [attr.aria-busy]="items.isLoading()">
            <caption class="sr-only">
              Artículos
            </caption>
            <thead>
              <tr>
                <th scope="col" class="w-36">SKU</th>
                <th scope="col">Nombre</th>
                <th scope="col" class="w-40">Categoría</th>
                <th scope="col" class="num w-28">Existencia</th>
                <th scope="col" class="num w-28">Disponible</th>
                <th scope="col" class="w-28">Estado</th>
              </tr>
            </thead>
            <tbody>
              @for (item of page().items; track item.id) {
                <tr>
                  <td class="code">
                    <a [routerLink]="['/inventario', item.id]" class="hover:underline">{{
                      item.sku
                    }}</a>
                  </td>
                  <td>
                    <span
                      class="inline-flex size-6 shrink-0 overflow-hidden rounded-sm bg-surface-active align-middle mr-2"
                    >
                      @if (item.coverPhotoId) {
                        <img
                          spLoading
                          [src]="
                            api.url('/items/' + item.id + '/photos/' + item.coverPhotoId + '/thumb')
                          "
                          alt=""
                          loading="lazy"
                          width="24"
                          height="24"
                          class="size-full object-cover"
                        />
                      }
                    </span>
                    <a
                      [routerLink]="['/inventario', item.id]"
                      class="font-medium hover:underline"
                      >{{ item.name }}</a
                    >
                    @if (item.manufacturer || item.model) {
                      <span class="text-fg-muted"> · {{ item.manufacturer }} {{ item.model }}</span>
                    }
                  </td>
                  <td class="text-fg-muted">{{ item.categoryName ?? '—' }}</td>
                  <td class="num">{{ qty(item.onHand) }} {{ item.unitSymbol }}</td>
                  <td class="num">{{ qty(item.available) }}</td>
                  <td>
                    @if (item.lowStock) {
                      <es-badge tone="warning" dot>Bajo mínimo</es-badge>
                    } @else if (item.onHand === 0) {
                      <es-badge>Sin existencia</es-badge>
                    } @else {
                      <es-badge tone="success" dot>Disponible</es-badge>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
      @if (page().total > pageSize) {
        <es-pagination
          [page]="pageNumber()"
          [pageSize]="pageSize"
          [total]="page().total"
          (pageChange)="pageNumber.set($event)"
        />
      }
    </div>
  `,
})
export default class ItemsList {
  protected readonly api = inject(Api);
  private readonly dialog = inject(EsDialogService);
  private readonly router = inject(Router);
  protected readonly session = inject(SessionService);
  protected readonly pageSize = PAGE_SIZE;
  protected readonly qty = fmtQty;

  protected readonly query = signal('');
  private readonly debouncedQuery = signal('');
  protected readonly categoryId = signal('');
  protected readonly lowStock = signal(false);
  protected readonly pageNumber = signal(1);
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly filtered = computed(
    () => !!this.debouncedQuery() || !!this.categoryId() || this.lowStock(),
  );

  protected readonly items = resource({
    params: () => ({
      org: this.session.orgId(),
      q: this.debouncedQuery(),
      categoryId: this.categoryId(),
      lowStock: this.lowStock(),
      page: this.pageNumber(),
    }),
    loader: ({ params }) =>
      this.api.get<Page<Item>>('/items', {
        q: params.q || undefined,
        categoryId: params.categoryId || undefined,
        lowStock: params.lowStock || undefined,
        limit: PAGE_SIZE,
        offset: (params.page - 1) * PAGE_SIZE,
      }),
  });
  protected readonly page = computed<Page<Item>>(
    () => this.items.value() ?? { items: [], total: 0, limit: PAGE_SIZE, offset: 0 },
  );

  private readonly categories = resource({
    params: () => this.session.orgId(),
    loader: () => this.api.get<Category[]>('/categories'),
  });
  protected readonly categoryOptions = computed(() => categoryTree(this.categories.value() ?? []));

  constructor() {
    // Cualquier cambio de filtro vuelve a la primera página.
    effect(() => {
      this.debouncedQuery();
      this.categoryId();
      this.lowStock();
      untracked(() => this.pageNumber.set(1));
    });
  }

  protected onSearch(value: string): void {
    this.query.set(value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.debouncedQuery.set(value.trim()), 250);
  }

  protected setCategory(id: string): void {
    this.categoryId.set(id);
  }

  protected setLowStock(v: boolean): void {
    this.lowStock.set(v);
  }

  protected create(): void {
    const ref = this.dialog.open<Item, ItemFormData>(ItemForm, {
      placement: 'right',
      size: 'lg',
      ariaLabel: 'Nuevo artículo',
      data: {},
    });
    ref.closed.subscribe((item) => {
      if (item) void this.router.navigate(['/inventario', item.id]);
    });
  }
}
