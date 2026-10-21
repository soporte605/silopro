import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Isotipo oficial de SiloPro: concepto B · S-Estante.
 * En línea para que herede los tokens de color y responda al tema activo.
 * Fuente: brand/concepts/b-s-estante/04-isotipo.svg
 */
@Component({
  selector: 'sp-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="8 6 48 52" aria-hidden="true" class="h-full w-auto">
      <path
        class="stroke-primary"
        d="M50,12H18Q14,12 14,16V28Q14,32 18,32H46Q50,32 50,36V48Q50,52 46,52H14"
        fill="none"
        stroke-width="8"
        stroke-linejoin="round"
      />
      <rect class="fill-accent" x="32" y="18.5" width="11" height="9" rx="2" />
    </svg>
  `,
  host: { class: 'inline-flex', role: 'img', 'aria-label': 'SiloPro' },
})
export class Logo {}
