import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Estado vacío compacto: explica por qué no hay datos y qué hacer.
 * Proyecte un icono con `[esEmptyIcon]` y acciones con `[esEmptyActions]`.
 */
@Component({
  selector: 'es-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mb-1 text-fg-subtle [&_svg]:size-5"><ng-content select="[esEmptyIcon]" /></div>
    <p class="text-sm font-medium text-fg">{{ title() }}</p>
    @if (description()) {
      <p class="max-w-sm text-xs text-fg-muted">{{ description() }}</p>
    }
    <div class="mt-2 flex gap-2"><ng-content select="[esEmptyActions]" /></div>
  `,
  host: {
    class:
      'flex flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border px-6 py-8 text-center',
  },
})
export class EsEmptyState {
  readonly title = input.required<string>();
  readonly description = input<string>();
}
