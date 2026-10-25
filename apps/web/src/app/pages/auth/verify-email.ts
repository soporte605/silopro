import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  type OnInit,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { EsButton } from '@elikarsystems/ui';
import { firstValueFrom } from 'rxjs';
import { SessionService } from '../../core/session';
import { AuthLayout } from './auth-layout';

/** Destino del enlace de confirmación: lo valida al abrir. */
@Component({
  selector: 'sp-verify-email',
  imports: [AuthLayout, RouterLink, EsButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sp-auth-layout title="Confirmar correo">
      @switch (state()) {
        @case ('checking') {
          <p class="text-sm text-fg-muted" role="status">Confirmando…</p>
        }
        @case ('ok') {
          <p class="rounded-md bg-success-soft px-2.5 py-2 text-sm text-success" role="status">
            ¡Gracias! Tu correo quedó confirmado.
          </p>
          <a esButton variant="primary" size="lg" class="mt-3 w-full" routerLink="/"
            >Ir a SiloPro</a
          >
        }
        @case ('invalid') {
          <p class="rounded-md bg-danger-soft px-2.5 py-2 text-sm text-danger" role="alert">
            El enlace no es válido o ya venció. Entra a SiloPro y pide uno nuevo desde el aviso de
            la parte superior.
          </p>
          <a esButton size="lg" class="mt-3 w-full" routerLink="/">Ir a SiloPro</a>
        }
      }
    </sp-auth-layout>
  `,
})
export default class VerifyEmail implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionService);
  readonly token = input<string>();
  protected readonly state = signal<'checking' | 'ok' | 'invalid'>('checking');

  async ngOnInit(): Promise<void> {
    try {
      await firstValueFrom(this.http.post('/api/auth/verify-email', { token: this.token() ?? '' }));
      this.state.set('ok');
      const me = this.session.me();
      if (me) this.session.me.set({ ...me, user: { ...me.user, emailVerified: true } });
    } catch {
      this.state.set('invalid');
    }
  }
}
