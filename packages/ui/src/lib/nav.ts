import { Directive } from '@angular/core';
import { focusRing } from './cn';

/**
 * Elemento de navegación lateral. Úselo con `routerLinkActive="is-active"`
 * y `ariaCurrentWhenActive="page"`.
 */
@Directive({
  selector: 'a[esNavItem], button[esNavItem]',
  host: {
    class: `flex h-7 items-center gap-2 rounded-md px-2 text-sm text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg [&.is-active]:bg-surface-active [&.is-active]:text-fg [&.is-active]:font-medium [&_svg]:size-4 [&_svg]:shrink-0 ${focusRing}`,
  },
})
export class EsNavItem {}
