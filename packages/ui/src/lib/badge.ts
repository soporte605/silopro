import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { cn } from './cn';

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-active text-fg-muted',
  primary: 'bg-primary/10 text-primary',
  success: 'bg-accent-soft text-accent-fg',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
};

@Component({
  selector: 'es-badge',
  template: `@if (dot()) {
      <span class="size-1.5 rounded-full bg-current" aria-hidden="true"></span>
    }
    <ng-content />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'classes()' },
})
export class EsBadge {
  readonly tone = input<BadgeTone>('neutral');
  readonly dot = input(false, { transform: booleanAttribute });

  protected readonly classes = computed(() =>
    cn(
      'inline-flex h-5 items-center gap-1 rounded-sm px-1.5 text-2xs font-medium whitespace-nowrap',
      TONES[this.tone()],
    ),
  );
}
