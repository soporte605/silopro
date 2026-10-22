import { ChangeDetectionStrategy, Component, inject, resource, signal } from '@angular/core';
import {
  DIALOG_DATA,
  DialogRef,
  EsDialogShell,
  EsFormField,
  EsInput,
  EsSkeleton,
} from '@elikarsystems/ui';
import type { Item, Page } from '@silopro/contracts';
import { Api } from '../../core/api';

/** Elige un artículo del catálogo con búsqueda por nombre, SKU o código. */
@Component({
  selector: 'sp-item-picker',
  imports: [EsDialogShell, EsFormField, EsInput, EsSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full w-full' },
  template: `
    <es-dialog-shell title="Elegir artículo" [description]="data">
      <div class="flex flex-col gap-3">
        <es-form-field label="Buscar" #b="esFormField">
          <input
            esInput
            type="search"
            [id]="b.controlId"
            placeholder="Nombre, SKU, fabricante…"
            [value]="q()"
            (input)="q.set($any($event.target).value)"
          />
        </es-form-field>
        @if (results.isLoading() && !results.hasValue()) {
          <es-skeleton class="h-24 w-full" />
        } @else if (!results.value()?.items?.length) {
          <p class="text-sm text-fg-muted">Sin resultados.</p>
        } @else {
          <ul class="divide-y divide-border rounded-md border border-border" aria-label="Artículos">
            @for (it of results.value()!.items; track it.id) {
              <li>
                <button
                  type="button"
                  class="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-surface-hover"
                  (click)="ref.close(it)"
                >
                  <span class="min-w-0">
                    <span class="block truncate font-medium">{{ it.name }}</span>
                    <span class="code text-fg-muted">{{ it.sku }}</span>
                  </span>
                  <span class="shrink-0 text-xs text-fg-muted tabular-nums"
                    >{{ it.onHand }} {{ it.unitSymbol }}</span
                  >
                </button>
              </li>
            }
          </ul>
        }
      </div>
    </es-dialog-shell>
  `,
})
export class ItemPicker {
  protected readonly ref = inject<DialogRef<Item>>(DialogRef);
  /** Texto de contexto (p. ej. la ruta de la ubicación). */
  protected readonly data = inject<string>(DIALOG_DATA);
  private readonly api = inject(Api);
  protected readonly q = signal('');
  protected readonly results = resource({
    params: () => this.q().trim(),
    loader: ({ params }) =>
      this.api.get<Page<Item>>('/items', { q: params || undefined, limit: 20 }),
  });
}
