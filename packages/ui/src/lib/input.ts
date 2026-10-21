import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { cn, focusRing } from './cn';

export const inputBase = cn(
  'w-full min-w-0 rounded-md border border-border bg-surface px-2 text-sm text-fg shadow-sm',
  'placeholder:text-fg-subtle transition-colors duration-(--es-duration)',
  'hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-50',
  'aria-invalid:border-danger aria-invalid:focus-visible:ring-danger/40',
  focusRing,
);

/**
 * Campo de texto sobre `<input>` / `<textarea>` nativos, compatible con
 * formularios reactivos y de plantilla sin envoltorios adicionales.
 */
@Component({
  selector: 'input[esInput], textarea[esInput]',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'classes()' },
})
export class EsInput {
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly mono = input(false, { transform: booleanAttribute });

  protected readonly classes = computed(() =>
    cn(
      inputBase,
      { sm: 'h-6 text-xs', md: 'h-7', lg: 'h-8' }[this.size()],
      '[&:is(textarea)]:h-auto [&:is(textarea)]:py-1.5',
      this.mono() && 'font-mono',
    ),
  );
}

/** `<select esSelect>` nativo con estilo del sistema: accesible y usable en móvil. */
@Component({
  selector: 'select[esSelect]',
  template: '<ng-content />',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'classes',
  },
})
export class EsSelect {
  protected readonly classes = cn(
    inputBase,
    'h-7 cursor-pointer appearance-none bg-no-repeat pr-7',
    'bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20width%3D%2212%22%20height%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22%23888%22%20stroke-width%3D%222%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22/%3E%3C/svg%3E")] bg-position-[right_0.5rem_center]',
  );
}
