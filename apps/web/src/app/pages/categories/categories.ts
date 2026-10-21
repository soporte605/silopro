import { ChangeDetectionStrategy, Component, computed, inject, resource } from '@angular/core';
import {
  EsButton,
  EsDialogService,
  EsEmptyState,
  EsSkeleton,
  EsTable,
  EsToastService,
} from '@elikarsystems/ui';
import { LucideArchive, LucideFolderTree, LucidePencil, LucidePlus } from '@lucide/angular';
import type { Category } from '@silopro/contracts';
import { ApiRequestError, Api } from '../../core/api';
import { categoryTree } from '../../core/categories';
import { ConfirmService } from '../../core/confirm';
import { SessionService } from '../../core/session';
import { PageHeader } from '../page-header';
import { CategoryForm, type CategoryFormData } from './category-form';

@Component({
  selector: 'sp-categories',
  imports: [
    PageHeader,
    EsButton,
    EsEmptyState,
    EsSkeleton,
    EsTable,
    LucidePlus,
    LucidePencil,
    LucideArchive,
    LucideFolderTree,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <sp-page-header
        title="Categorías"
        description="Clasificación jerárquica y atributos técnicos por tipo de artículo."
      >
        @if (session.canWrite()) {
          <button spActions esButton variant="primary" (click)="open()">
            <svg lucidePlus></svg> Nueva categoría
          </button>
        }
      </sp-page-header>
      <div class="overflow-x-auto rounded-lg border border-border bg-surface">
        @if (list.isLoading() && !list.hasValue()) {
          <div class="p-3"><es-skeleton class="h-16 w-full" /></div>
        } @else if (!rows().length) {
          <es-empty-state
            class="m-3"
            title="Sin categorías"
            description="Agrupe artículos y defina qué datos técnicos registrar de cada tipo."
          >
            <svg esEmptyIcon lucideFolderTree></svg>
          </es-empty-state>
        } @else {
          <table esTable>
            <caption class="sr-only">
              Categorías
            </caption>
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Atributos propios</th>
                <th scope="col" class="num w-24">Artículos</th>
                @if (session.canWrite()) {
                  <th scope="col" class="w-20"><span class="sr-only">Acciones</span></th>
                }
              </tr>
            </thead>
            <tbody>
              @for (r of rows(); track r.c.id) {
                <tr>
                  <td>
                    <span [style.padding-left.rem]="r.depth * 1.25" class="font-medium">{{
                      r.c.name
                    }}</span>
                  </td>
                  <td class="text-fg-muted">{{ attrLabels(r.c) }}</td>
                  <td class="num">
                    {{ r.c.itemCount }}
                  </td>
                  @if (session.canWrite()) {
                    <td>
                      <div class="flex justify-end gap-0.5">
                        <button
                          esButton
                          variant="ghost"
                          size="sm"
                          iconOnly
                          [attr.aria-label]="'Editar ' + r.c.name"
                          (click)="open(r.c)"
                        >
                          <svg lucidePencil></svg>
                        </button>
                        <button
                          esButton
                          variant="ghost"
                          size="sm"
                          iconOnly
                          [attr.aria-label]="'Archivar ' + r.c.name"
                          (click)="archive(r.c)"
                        >
                          <svg lucideArchive></svg>
                        </button>
                      </div>
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    </div>
  `,
})
export default class Categories {
  private readonly api = inject(Api);
  private readonly dialog = inject(EsDialogService);
  private readonly toast = inject(EsToastService);
  private readonly confirm = inject(ConfirmService);
  protected readonly session = inject(SessionService);

  protected readonly list = resource({
    params: () => this.session.orgId(),
    loader: () => this.api.get<Category[]>('/categories'),
  });
  protected readonly rows = computed(() => {
    const all = this.list.value() ?? [];
    const byId = new Map(all.map((c) => [c.id, c]));
    return categoryTree(all).map((o) => ({ c: byId.get(o.id)!, depth: o.depth }));
  });

  protected attrLabels(c: Category): string {
    return c.attributes.map((a) => a.label).join(', ') || '—';
  }

  protected open(category?: Category): void {
    this.dialog
      .open<Category, CategoryFormData>(CategoryForm, {
        placement: 'right',
        size: 'lg',
        ariaLabel: category ? 'Editar categoría' : 'Nueva categoría',
        data: { all: this.list.value() ?? [], ...(category ? { category } : {}) },
      })
      .closed.subscribe((saved) => saved && this.list.reload());
  }

  protected async archive(c: Category): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Archivar categoría',
      message: `«${c.name}» ya no se podrá elegir; los artículos existentes la conservan.`,
      confirmLabel: 'Archivar',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.api.delete(`/categories/${c.id}`);
      this.toast.show('Categoría archivada');
      this.list.reload();
    } catch (e) {
      this.toast.show(ApiRequestError.from(e).message, { tone: 'danger' });
    }
  }
}
