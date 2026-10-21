import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

export interface BreadcrumbItem {
  label: string;
  link?: string;
}

@Component({
  selector: 'es-breadcrumb',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="flex min-w-0 items-center gap-1.5 text-sm">
      @for (item of items(); track $index; let last = $last) {
        <li class="flex min-w-0 items-center gap-1.5">
          @if (item.link && !last) {
            <a [routerLink]="item.link" class="truncate text-fg-muted hover:text-fg">{{
              item.label
            }}</a>
          } @else {
            <span class="truncate font-medium text-fg" [attr.aria-current]="last ? 'page' : null">
              {{ item.label }}
            </span>
          }
          @if (!last) {
            <span class="text-fg-subtle" aria-hidden="true">/</span>
          }
        </li>
      }
    </ol>
  `,
  host: { 'aria-label': 'Ruta de navegación', role: 'navigation', class: 'block min-w-0' },
})
export class EsBreadcrumb {
  readonly items = input.required<BreadcrumbItem[]>();
}
