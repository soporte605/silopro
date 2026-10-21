import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { cn, focusRing } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-fg hover:bg-primary-hover shadow-sm',
  secondary: 'bg-surface-active text-fg hover:bg-border',
  outline: 'border border-border bg-surface text-fg hover:bg-surface-hover shadow-sm',
  ghost: 'text-fg-muted hover:bg-surface-hover hover:text-fg',
  danger: 'bg-danger text-white hover:opacity-90 shadow-sm',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-6 px-2 gap-1 text-xs rounded-sm',
  md: 'h-7 px-2.5 gap-1.5 text-sm rounded-md',
  lg: 'h-8 px-3 gap-2 text-sm rounded-md',
};

const ICON_SIZES: Record<ButtonSize, string> = {
  sm: 'size-6 rounded-sm',
  md: 'size-7 rounded-md',
  lg: 'size-8 rounded-md',
};

/**
 * Botón. Se aplica sobre elementos nativos para conservar su semántica:
 * `<button esButton>` o `<a esButton>`.
 * Para botones solo con icono use `iconOnly` y SIEMPRE un `aria-label`.
 */
@Component({
  selector: 'button[esButton], a[esButton]',
  template: '<ng-content />',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'classes()',
    '[attr.aria-busy]': 'loading() || null',
    '[attr.data-variant]': 'variant()',
  },
})
export class EsButton {
  readonly variant = input<ButtonVariant>('outline');
  readonly size = input<ButtonSize>('md');
  readonly iconOnly = input(false, { transform: booleanAttribute });
  readonly loading = input(false, { transform: booleanAttribute });

  protected readonly classes = computed(() =>
    cn(
      'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium',
      'transition-colors duration-(--es-duration) ease-es cursor-pointer',
      'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
      '[&_svg]:size-3.5 [&_svg]:shrink-0',
      focusRing,
      VARIANTS[this.variant()],
      this.iconOnly() ? ICON_SIZES[this.size()] : SIZES[this.size()],
      this.loading() && 'cursor-progress opacity-70',
    ),
  );
}
