import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { QrCode } from '../../core/qr-code';

/** Una etiqueta: el QR lleva el enlace; el texto, lo que se lee a simple vista. */
export interface LabelData {
  key: string;
  qr: string;
  /** Dirección del cajón, SKU o código: lo más visible. */
  title: string;
  name: string;
  /** Ruta o detalle secundario. */
  sub: string;
  /** Encabezado del diseño «Cajón»: gabinete, ubicación padre o categoría. */
  group?: string;
}

/** «Detalle»: QR y tres líneas. «Cajón»: encabezado y dirección grande, legible de lejos. */
export type LabelDesign = 'detalle' | 'cajon';
const MM_TO_PT = 2.835;

/** Medidas en milímetros. Las hojas siguen plantillas comerciales comunes. */
export interface LabelFormat {
  id: string;
  name: string;
  /** Tamaño de página para `@page`. */
  page: string;
  pageWidth: number;
  pageHeight: number;
  /** Etiquetas por hoja; en rollo (térmica) es 1×1 y la página es la etiqueta. */
  columns: number;
  rows: number;
  width: number;
  height: number;
  top: number;
  left: number;
  gapX: number;
  gapY: number;
}

export const LABEL_FORMATS: readonly LabelFormat[] = [
  {
    id: 'carta-30',
    name: 'Carta · 30 por hoja · 66,7 × 25,4 mm (tipo 5160)',
    page: 'letter',
    pageWidth: 215.9,
    pageHeight: 279.4,
    columns: 3,
    rows: 10,
    width: 66.7,
    height: 25.4,
    top: 12.7,
    left: 4.8,
    gapX: 3.2,
    gapY: 0,
  },
  {
    id: 'a4-21',
    name: 'A4 · 21 por hoja · 63,5 × 38,1 mm (tipo L7160)',
    page: 'A4',
    pageWidth: 210,
    pageHeight: 297,
    columns: 3,
    rows: 7,
    width: 63.5,
    height: 38.1,
    top: 15.2,
    left: 7.2,
    gapX: 2.5,
    gapY: 0,
  },
  {
    id: 'rollo-50x25',
    name: 'Rollo térmico · 50 × 25 mm',
    page: '50mm 25mm',
    pageWidth: 50,
    pageHeight: 25,
    columns: 1,
    rows: 1,
    width: 50,
    height: 25,
    top: 0,
    left: 0,
    gapX: 0,
    gapY: 0,
  },
  {
    id: 'rollo-40x30',
    name: 'Rollo térmico · 40 × 30 mm',
    page: '40mm 30mm',
    pageWidth: 40,
    pageHeight: 30,
    columns: 1,
    rows: 1,
    width: 40,
    height: 30,
    top: 0,
    left: 0,
    gapX: 0,
    gapY: 0,
  },
];

/**
 * Páginas de etiquetas a tamaño real (mm). La misma vista sirve de vista
 * previa y de impresión: el navegador la imprime o la guarda como PDF.
 */
@Component({
  selector: 'sp-label-sheet',
  imports: [QrCode],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col items-start gap-4' },
  template: `
    @for (page of pages(); track $index) {
      <div
        class="sp-label-page relative shrink-0 overflow-hidden bg-white text-black"
        [style.width.mm]="format().pageWidth"
        [style.height.mm]="format().pageHeight"
      >
        @for (l of page; track l.key; let i = $index) {
          <div
            [class.sp-label]="!!l.qr"
            class="absolute flex items-center gap-[1.5mm] overflow-hidden p-[1.5mm]"
            [class.outline]="outline()"
            [class.outline-dashed]="outline()"
            [class.outline-gray-300]="outline()"
            [style.left.mm]="x(i)"
            [style.top.mm]="y(i)"
            [style.width.mm]="format().width"
            [style.height.mm]="format().height"
            [attr.data-label]="l.title"
          >
            @if (l.qr && design() === 'cajon') {
              <div class="flex size-full min-w-0 flex-col">
                <span
                  class="truncate border-b border-black pb-[0.6mm] text-center font-bold tracking-wide uppercase"
                  [style.font-size.pt]="groupSize()"
                  >{{ l.group || l.name }}</span
                >
                <div class="flex min-h-0 flex-1 items-center gap-[1.5mm] pt-[1mm]">
                  <sp-qr
                    class="shrink-0"
                    [value]="l.qr"
                    [label]="'QR de ' + l.title"
                    [style.width.mm]="bigQrSize()"
                    [style.height.mm]="bigQrSize()"
                  />
                  <span
                    class="min-w-0 flex-1 truncate text-right font-mono leading-none font-bold"
                    [style.font-size.pt]="bigTitleSize(l.title)"
                    >{{ l.title }}</span
                  >
                </div>
              </div>
            } @else if (l.qr) {
              <sp-qr
                class="shrink-0"
                [value]="l.qr"
                [label]="'QR de ' + l.title"
                [style.width.mm]="qrSize()"
                [style.height.mm]="qrSize()"
              />
              <div class="flex min-w-0 flex-col leading-tight">
                <span class="truncate font-mono font-bold" [style.font-size.pt]="titleSize()">{{
                  l.title
                }}</span>
                <span class="line-clamp-2 text-[7pt]">{{ l.name }}</span>
                @if (l.sub) {
                  <span class="truncate text-[5.5pt] text-gray-600">{{ l.sub }}</span>
                }
              </div>
            }
          </div>
        }
      </div>
    }
  `,
})
export class LabelSheet {
  readonly labels = input.required<readonly LabelData[]>();
  readonly format = input.required<LabelFormat>();
  /** Contorno punteado para ubicar las etiquetas en pantalla (no se imprime). */
  readonly outline = input(false);
  readonly design = input<LabelDesign>('detalle');

  protected readonly pages = computed(() => {
    const per = this.format().columns * this.format().rows;
    const all = this.labels();
    const out: LabelData[][] = [];
    for (let i = 0; i < all.length; i += per) out.push(all.slice(i, i + per));
    return out;
  });
  protected readonly qrSize = computed(() => this.format().height - 3);
  protected readonly titleSize = computed(() => (this.format().height >= 30 ? 14 : 11));
  protected readonly groupSize = computed(() => (this.format().height >= 30 ? 10.5 : 8.5));
  /** Alto útil bajo el encabezado del diseño «Cajón» (mm). */
  private readonly bodyHeight = computed(
    () => this.format().height - 3 - this.groupSize() / MM_TO_PT - 2,
  );
  protected readonly bigQrSize = computed(() => this.bodyHeight());

  /** Dirección tan grande como quepa: limitada por el alto y por el ancho libre junto al QR. */
  protected bigTitleSize(title: string): number {
    const free = this.format().width - 3 - this.bigQrSize() - 1.5;
    const byHeight = this.bodyHeight() * 0.8;
    const byWidth = free / (Math.max(title.length, 2) * 0.62);
    return Math.round(Math.min(byHeight, byWidth) * MM_TO_PT * 10) / 10;
  }

  protected x(i: number): number {
    const f = this.format();
    return f.left + (i % f.columns) * (f.width + f.gapX);
  }
  protected y(i: number): number {
    const f = this.format();
    return f.top + Math.floor(i / f.columns) * (f.height + f.gapY);
  }
}
