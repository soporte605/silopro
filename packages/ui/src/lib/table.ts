import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { LucideChevronLeft, LucideChevronRight } from '@lucide/angular';
import { EsButton } from './button';

const TABLE_CLASSES = [
  'w-full border-separate border-spacing-0 text-sm',
  '[&_th]:sticky [&_th]:top-0 [&_th]:z-1 [&_th]:h-8 [&_th]:border-b [&_th]:border-border [&_th]:bg-surface-sunken [&_th]:px-2.5 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:text-fg-muted [&_th]:whitespace-nowrap',
  '[&_td]:h-8 [&_td]:border-b [&_td]:border-border [&_td]:px-2.5 [&_td]:text-fg',
  '[&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-surface-hover [&_tbody_tr[aria-selected=true]]:bg-primary/6',
  '[&_.num]:text-right [&_.num]:tabular-nums [&_.code]:font-mono [&_.code]:text-xs',
].join(' ');

/**
 * Estilo de tabla densa para `<table esTable>`. Mantiene el HTML semántico
 * (thead/th scope/tbody) para lectores de pantalla.
 * Filas seleccionables: añada `aria-selected="true"` a la `<tr>`.
 */
@Component({
  selector: 'table[esTable]',
  template: '<ng-content />',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'classes' },
})
export class EsTable {
  protected readonly classes = TABLE_CLASSES;
}

/** Paginación compacta basada en desplazamiento. */
@Component({
  selector: 'es-pagination',
  imports: [EsButton, LucideChevronLeft, LucideChevronRight],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="text-xs text-fg-muted tabular-nums">
      {{ from() }}–{{ to() }} de {{ total() }}
    </span>
    <div class="flex gap-1">
      <button
        esButton
        size="sm"
        iconOnly
        aria-label="Página anterior"
        [disabled]="page() <= 1"
        (click)="pageChange.emit(page() - 1)"
      >
        <svg lucideChevronLeft></svg>
      </button>
      <button
        esButton
        size="sm"
        iconOnly
        aria-label="Página siguiente"
        [disabled]="page() >= pages()"
        (click)="pageChange.emit(page() + 1)"
      >
        <svg lucideChevronRight></svg>
      </button>
    </div>
  `,
  host: {
    class: 'flex items-center justify-between gap-3',
    role: 'navigation',
    'aria-label': 'Paginación',
  },
})
export class EsPagination {
  readonly page = input.required<number>();
  readonly pageSize = input(50);
  readonly total = input.required<number>();
  readonly pageChange = output<number>();

  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  protected readonly from = computed(() =>
    this.total() === 0 ? 0 : (this.page() - 1) * this.pageSize() + 1,
  );
  protected readonly to = computed(() => Math.min(this.total(), this.page() * this.pageSize()));
}
