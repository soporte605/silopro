import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Marcador de carga. Dimensione con utilidades: `<es-skeleton class="h-4 w-32" />`. */
@Component({
  selector: 'es-skeleton',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block animate-pulse rounded-sm bg-surface-active motion-reduce:animate-none',
    'aria-hidden': 'true',
  },
})
export class EsSkeleton {}
