import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { EsButton, EsEmptyState } from '@elikarsystems/ui';
import { LucideQrCode } from '@lucide/angular';
import { type QrTarget, qrTypeFromLetter } from '@silopro/contracts';
import { ApiRequestError, Api } from '../../core/api';
import { SessionService } from '../../core/session';

/** Adónde lleva una etiqueta resuelta. */
export function qrDestination(t: QrTarget): { commands: string[]; queryParams?: object } {
  if (t.type === 'item') return { commands: ['/inventario', t.id] };
  if (t.cabinetId) {
    return { commands: ['/gabinetes', t.cabinetId], queryParams: { resaltar: t.id } };
  }
  return { commands: ['/ubicaciones'], queryParams: { resaltar: t.id } };
}

/**
 * Destino de los enlaces impresos en las etiquetas (`/q/<letra>/<código>`).
 * Resuelve el código con la sesión actual y redirige; si no hay sesión, el
 * guard de acceso pide iniciarla y vuelve aquí.
 */
@Component({
  selector: 'sp-qr-resolve',
  imports: [RouterLink, EsButton, EsEmptyState, LucideQrCode],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto max-w-md p-6">
      @if (error()) {
        <es-empty-state title="Etiqueta no encontrada" [description]="error()!">
          <svg esEmptyIcon lucideQrCode></svg>
          <a esEmptyActions esButton routerLink="/">Ir al inicio</a>
        </es-empty-state>
      } @else {
        <p class="text-sm text-fg-muted" role="status">Abriendo etiqueta…</p>
      }
    </div>
  `,
})
export default class QrResolve {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly session = inject(SessionService);

  readonly tipo = input.required<string>();
  readonly codigo = input.required<string>();
  protected readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      const type = qrTypeFromLetter(this.tipo());
      const code = this.codigo().toUpperCase();
      if (!this.session.orgId()) return;
      if (!type) {
        this.error.set('El código no tiene un formato válido.');
        return;
      }
      void this.open(type, code);
    });
  }

  private async open(type: string, code: string): Promise<void> {
    try {
      const target = await this.api.get<QrTarget>(`/qr/${type}/${code}`);
      const dest = qrDestination(target);
      await this.router.navigate(dest.commands, {
        queryParams: dest.queryParams,
        replaceUrl: true,
      });
    } catch (e) {
      const err = ApiRequestError.from(e);
      this.error.set(
        err.status === 404
          ? `El código ${code} no existe en ${this.session.membership()?.organizationName ?? 'esta organización'} o fue archivado.`
          : err.message,
      );
    }
  }
}
