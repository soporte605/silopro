import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { EsButton, EsToastService } from '@elikarsystems/ui';
import { Api, ApiRequestError } from '../core/api';
import { SessionService } from '../core/session';

/** Aviso mientras el usuario no confirme su correo, con reenvío del enlace. */
@Component({
  selector: 'sp-verify-banner',
  imports: [EsButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (session.me(); as me) {
      @if (!me.user.emailVerified) {
        <div
          class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-warning-soft px-4 py-1.5 text-sm"
          role="region"
          aria-label="Confirmar correo"
        >
          <span class="flex-1">
            Confirma tu correo: te enviamos un enlace a <strong>{{ me.user.email }}</strong
            >.
          </span>
          <button esButton size="sm" variant="ghost" [loading]="busy()" (click)="resend()">
            {{ sent() ? 'Enviado' : 'Reenviar enlace' }}
          </button>
        </div>
      }
    }
  `,
})
export class VerifyBanner {
  protected readonly session = inject(SessionService);
  private readonly api = inject(Api);
  private readonly toast = inject(EsToastService);
  protected readonly busy = signal(false);
  protected readonly sent = signal(false);

  protected async resend(): Promise<void> {
    this.busy.set(true);
    try {
      await this.api.post('/api/auth/verify-email/resend', {});
      this.sent.set(true);
      this.toast.show('Te enviamos un enlace nuevo.', { tone: 'success' });
    } catch (e) {
      this.toast.show(ApiRequestError.from(e).message, { tone: 'danger' });
    } finally {
      this.busy.set(false);
    }
  }
}
