import { Directive, ElementRef, effect, inject, input, signal } from '@angular/core';

/**
 * Imagen con esqueleto de carga: mientras se descarga muestra un fondo que
 * pulsa, y aparece con un fundido al terminar. Uso: `<img spLoading [src]="…">`.
 */
@Directive({
  selector: 'img[spLoading]',
  host: {
    '[src]': 'src()',
    '[class.animate-pulse]': 'state() === "loading"',
    class: 'motion-reduce:animate-none',
    '[class.bg-surface-active]': 'state() !== "loaded"',
    '[attr.aria-busy]': 'state() === "loading" || null',
    '[attr.data-state]': 'state()',
    '(load)': 'state.set("loaded")',
    '(error)': 'state.set("failed")',
  },
})
export class LoadingImage {
  readonly src = input.required<string>();
  protected readonly state = signal<'loading' | 'loaded' | 'failed'>('loading');
  private readonly img = inject<ElementRef<HTMLImageElement>>(ElementRef).nativeElement;

  constructor() {
    effect(() => {
      this.src();
      // Una imagen ya en caché puede terminar antes de enlazar el evento.
      queueMicrotask(() =>
        this.state.set(this.img.complete && this.img.naturalWidth > 0 ? 'loaded' : 'loading'),
      );
    });
  }
}
