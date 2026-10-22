import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { encode } from 'uqr';

/** Trazo SVG de un QR: un rectángulo por cada tramo horizontal de módulos oscuros. */
export function qrPath(text: string): { size: number; d: string } {
  const { size, data } = encode(text, { ecc: 'M', border: 0 });
  let d = '';
  data.forEach((row, y) => {
    let x = 0;
    while (x < size) {
      if (!row[x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < size && row[x]) x++;
      d += `M${start} ${y}h${x - start}v1h-${x - start}z`;
    }
  });
  return { size, d };
}

/**
 * Código QR como SVG nítido a cualquier tamaño (pantalla o impresión).
 * Deja un margen de 2 módulos alrededor, suficiente para lectores de celular.
 */
@Component({
  selector: 'sp-qr',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <svg
      role="img"
      [attr.aria-label]="label()"
      [attr.viewBox]="'-2 -2 ' + (qr().size + 4) + ' ' + (qr().size + 4)"
      shape-rendering="crispEdges"
      class="block size-full"
    >
      <rect x="-2" y="-2" [attr.width]="qr().size + 4" [attr.height]="qr().size + 4" fill="#fff" />
      <path [attr.d]="qr().d" fill="#000" />
    </svg>
  `,
})
export class QrCode {
  readonly value = input.required<string>();
  readonly label = input('Código QR');
  protected readonly qr = computed(() => qrPath(this.value()));
}
