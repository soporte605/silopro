import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Encabezado de página: título, descripción y acciones (`[spActions]`). */
@Component({
  selector: 'sp-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="min-w-0">
      <ng-content select="[spBefore]" />
      <h1 class="truncate text-xl font-semibold tracking-tight">{{ title() }}</h1>
      @if (description()) {
        <p class="text-sm text-fg-muted">{{ description() }}</p>
      }
    </div>
    <div class="flex flex-wrap items-center gap-2"><ng-content select="[spActions]" /></div>
  `,
  host: { class: 'flex flex-wrap items-end justify-between gap-3' },
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly description = input<string>();
}
