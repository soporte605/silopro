import { booleanAttribute, ChangeDetectionStrategy, Component, input } from '@angular/core';

let nextId = 0;

/**
 * Agrupa etiqueta, control, ayuda y error. El control proyectado debe usar
 * `[id]="field.controlId"` y `[attr.aria-describedby]="field.describedBy()"`.
 */
@Component({
  selector: 'es-form-field',
  exportAs: 'esFormField',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label [attr.for]="controlId" class="text-xs font-medium text-fg">
      {{ label() }}
      @if (required()) {
        <span class="text-danger" aria-hidden="true">*</span>
      }
    </label>
    <ng-content />
    @if (error()) {
      <p [id]="errorId" class="text-xs text-danger" role="alert">{{ error() }}</p>
    } @else if (hint()) {
      <p [id]="hintId" class="text-xs text-fg-muted">{{ hint() }}</p>
    }
  `,
  host: { class: 'flex flex-col gap-1' },
})
export class EsFormField {
  readonly label = input.required<string>();
  readonly hint = input<string>();
  readonly error = input<string | null>();
  readonly required = input(false, { transform: booleanAttribute });

  readonly controlId = `es-field-${++nextId}`;
  protected readonly hintId = `${this.controlId}-hint`;
  protected readonly errorId = `${this.controlId}-error`;

  describedBy(): string | null {
    if (this.error()) return this.errorId;
    if (this.hint()) return this.hintId;
    return null;
  }
}
