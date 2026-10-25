import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { EsButton } from '@elikarsystems/ui';
import type { ViewerFailure } from './load-viewer';

/** Aviso cuando la vista 3D no se puede abrir, con lo que el usuario puede hacer. */
@Component({
  selector: 'sp-viewer-failure',
  imports: [EsButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class:
      'absolute inset-x-4 top-4 flex flex-col gap-2 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger',
    role: 'alert',
  },
  template: `
    @switch (reason().kind) {
      @case ('load') {
        <p>No se pudo cargar la vista 3D. Puede que haya una versión nueva de SiloPro.</p>
        <div><button esButton size="sm" (click)="reload()">Recargar la página</button></div>
      }
      @case ('error') {
        <p>
          No se pudo abrir la vista 3D.
          @if (fallback()) {
            {{ fallback() }}
          }
        </p>
        <p class="text-xs">
          Recargue la página; si se repite, envíe a soporte este detalle:
          <code class="font-mono break-all">{{ reason().detail }}</code>
        </p>
      }
      @default {
        <p>
          @if (reason().kind === 'webgl1') {
            Este navegador solo tiene WebGL 1 y la vista 3D necesita WebGL 2.
          } @else {
            Este navegador no puede mostrar la vista 3D (WebGL no disponible).
          }
          @if (fallback()) {
            {{ fallback() }}
          }
        </p>
        <p class="text-xs">
          Use Chrome, Edge o Firefox actualizados con la aceleración por hardware activada
          (Configuración › Sistema). Si ya lo está, actualice el controlador de video; en
          chrome://gpu la línea «WebGL2» debe decir «Hardware accelerated».
        </p>
      }
    }
  `,
})
export class ViewerFailureNotice {
  readonly reason = input.required<ViewerFailure>();
  /** Alternativa sugerida, p. ej. «Use la cuadrícula.». */
  readonly fallback = input<string>('');

  protected reload(): void {
    location.reload();
  }
}
