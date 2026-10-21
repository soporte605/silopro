import { ChangeDetectionStrategy, Component, model } from '@angular/core';
import { cn, focusRing } from './cn';

const box = cn(
  'size-3.5 shrink-0 cursor-pointer appearance-none border border-border-strong bg-surface shadow-sm',
  'checked:border-primary checked:bg-primary disabled:cursor-not-allowed disabled:opacity-50',
  'bg-center bg-no-repeat transition-colors duration-(--es-duration)',
  focusRing,
);

/** `<input type="checkbox" esCheckbox>` nativo: soporta `indeterminate` y formularios. */
@Component({
  selector: 'input[type=checkbox][esCheckbox]',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'classes',
  },
})
export class EsCheckbox {
  protected readonly classes = cn(
    box,
    'rounded-[3px]',
    'checked:bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2016%2016%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-width%3D%222.5%22%3E%3Cpath%20d%3D%22m4%208.5%202.5%202.5L12%205%22/%3E%3C/svg%3E")]',
    'indeterminate:border-primary indeterminate:bg-primary indeterminate:bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2016%2016%22%20stroke%3D%22white%22%20stroke-width%3D%222.5%22%3E%3Cpath%20d%3D%22M4%208h8%22/%3E%3C/svg%3E")]',
  );
}

/** `<input type="radio" esRadio>` nativo. */
@Component({
  selector: 'input[type=radio][esRadio]',
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'classes',
  },
})
export class EsRadio {
  protected readonly classes = cn(box, 'rounded-full checked:bg-surface checked:border-[4.5px]');
}

/**
 * Interruptor accesible sobre `<button role="switch">`.
 * Uso: `<button esSwitch [(checked)]="valor" aria-label="..."></button>`.
 */
@Component({
  selector: 'button[esSwitch]',
  template: `<span
    class="pointer-events-none block size-3 rounded-full bg-white shadow-sm transition-transform duration-(--es-duration) ease-es"
    [class.translate-x-3]="checked()"
  ></span>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    type: 'button',
    role: 'switch',
    '[attr.aria-checked]': 'checked()',
    '(click)': 'toggle()',
    '[class]': 'classes',
    '[class.bg-primary]': 'checked()',
    '[class.bg-border-strong]': '!checked()',
  },
})
export class EsSwitch {
  readonly checked = model(false);

  protected readonly classes = cn(
    'inline-flex h-4 w-7 shrink-0 cursor-pointer items-center rounded-full p-0.5',
    'transition-colors duration-(--es-duration) disabled:cursor-not-allowed disabled:opacity-50',
    focusRing,
  );

  protected toggle(): void {
    this.checked.update((v) => !v);
  }
}
