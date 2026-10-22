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
    @if (reason() === 'load') {
      <p>No se pudo cargar la vista 3D. Puede que haya una versión nueva de SiloPro.</p>
      <div><button esButton size="sm" (click)="reload()">Recargar la página</button></div>
    } @else {
      <p>
        Este navegador no puede mostrar la vista 3D (WebGL no disponible).
        @if (fallback()) {
          {{ fallback() }}
        }
      </p>
      <p class="text-xs">
        Revise que la aceleración por hardware esté activada en la configuración del navegador.
      </p>
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
