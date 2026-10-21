import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Isotipo de SiloPro (concepto A, provisional hasta la elección final).
 * En línea para que herede los tokens de color y responda al tema activo.
 * Fuente: brand/concepts/a-silo-de-cajones/04-isotipo.svg
 */
@Component({
  selector: 'sp-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="12 4 40 56" aria-hidden="true" class="h-full w-auto">
      <path class="fill-primary" d="M14,19A18,12 0 0 1 50,19Z" />
      <path
        class="fill-primary"
        fill-rule="evenodd"
        d="M16,22H48A2,2 0 0 1 50,24V30A2,2 0 0 1 48,32H16A2,2 0 0 1 14,30V24A2,2 0 0 1 16,22ZM28.2,25.8H35.8A1.2,1.2 0 0 1 35.8,28.2H28.2A1.2,1.2 0 0 1 28.2,25.8Z"
      />
      <path
        class="fill-accent"
        fill-rule="evenodd"
        d="M16,35H48A2,2 0 0 1 50,37V43A2,2 0 0 1 48,45H16A2,2 0 0 1 14,43V37A2,2 0 0 1 16,35ZM28.2,38.8H35.8A1.2,1.2 0 0 1 35.8,41.2H28.2A1.2,1.2 0 0 1 28.2,38.8Z"
      />
      <path
        class="fill-primary"
        fill-rule="evenodd"
        d="M16,48H48A2,2 0 0 1 50,50V56A2,2 0 0 1 48,58H16A2,2 0 0 1 14,56V50A2,2 0 0 1 16,48ZM28.2,51.8H35.8A1.2,1.2 0 0 1 35.8,54.2H28.2A1.2,1.2 0 0 1 28.2,51.8Z"
      />
    </svg>
  `,
  host: { class: 'inline-flex', role: 'img', 'aria-label': 'SiloPro' },
})
export class Logo {}
