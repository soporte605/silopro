import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'kbd[esKbd]',
  template: '<ng-content />',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-sm border border-border bg-surface-sunken px-1 font-mono text-2xs text-fg-muted',
  },
})
export class EsKbd {}
