import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { EsButton, EsSkeleton } from '@elikarsystems/ui';
import type { InvitationPreview } from '@silopro/contracts';
import { ROLE_LABELS } from '@silopro/domain';
import { firstValueFrom } from 'rxjs';
import { ApiRequestError } from '../../core/api';
import { fmtDate } from '../../core/format';
import { SessionService } from '../../core/session';
import { AuthLayout } from './auth-layout';

/** Página pública del enlace de invitación: `/invitacion/:orgId/:token`. */
@Component({
  selector: 'sp-invitation',
  imports: [AuthLayout, RouterLink, EsButton, EsSkeleton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sp-auth-layout title="Invitación">
      @if (preview.isLoading()) {
        <es-skeleton class="mt-3 h-16 w-full" />
      } @else if (preview.error() || !preview.value()) {
        <p class="mt-2 text-sm text-fg-muted" role="alert">
          El enlace no es válido. Pide a quien te invitó que genere uno nuevo.
        </p>
      } @else if (preview.value(); as p) {
        <p class="mt-2 text-sm">
          <strong>{{ p.invitedByName }}</strong> te invita a
          <strong>{{ p.organizationName }}</strong> como <strong>{{ roleLabel(p.role) }}</strong
          >.
        </p>
        <p class="mt-1 text-xs text-fg-muted">
          Para {{ p.email }} · vence el {{ date(p.expiresAt) }}
        </p>

        @if (error()) {
          <p class="mt-3 rounded-md bg-danger-soft px-2.5 py-2 text-sm text-danger" role="alert">
            {{ error() }}
          </p>
        }

        <div class="mt-4 flex flex-col gap-2">
          @if (p.status !== 'pending') {
            <p class="text-sm text-fg-muted" role="status">{{ statusText(p.status) }}</p>
          } @else if (session.me(); as me) {
            @if (me.user.email === p.email) {
              <button esButton variant="primary" size="lg" [loading]="busy()" (click)="accept()">
                Unirme a {{ p.organizationName }}
              </button>
            } @else {
              <p class="text-sm text-fg-muted">
                Iniciaste sesión como {{ me.user.email }}. Esta invitación es para {{ p.email }}.
              </p>
              <button esButton (click)="switchAccount()">Cambiar de cuenta</button>
            }
          } @else {
            <a
              esButton
              variant="primary"
              size="lg"
              routerLink="/registro"
              [queryParams]="authParams()"
            >
              Crear cuenta con {{ p.email }}
            </a>
            <a esButton size="lg" routerLink="/acceso" [queryParams]="authParams()"
              >Ya tengo cuenta</a
            >
          }
        </div>
      }
    </sp-auth-layout>
  `,
})
export default class Invitation {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  protected readonly session = inject(SessionService);
  readonly orgId = input.required<string>();
  readonly token = input.required<string>();
  protected readonly date = fmtDate;
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly preview = resource({
    params: () => ({ org: this.orgId(), token: this.token() }),
    loader: ({ params }) =>
      firstValueFrom(
        this.http.get<InvitationPreview>(`/api/invitations/${params.org}/${params.token}`),
      ),
  });
  private readonly here = computed(() => `/invitacion/${this.orgId()}/${this.token()}`);
  protected readonly authParams = computed(() => ({
    volver: this.here(),
    correo: this.preview.value()?.email,
  }));

  protected roleLabel(r: InvitationPreview['role']): string {
    return ROLE_LABELS[r].toLowerCase();
  }

  protected statusText(s: InvitationPreview['status']): string {
    return {
      pending: '',
      accepted: 'Esta invitación ya fue usada.',
      revoked: 'Esta invitación fue cancelada.',
      expired: 'Esta invitación venció. Pide una nueva.',
    }[s];
  }

  protected async accept(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(
        this.http.post(`/api/invitations/${this.orgId()}/${this.token()}/accept`, {}),
      );
      await this.session.load();
      this.session.selectOrg(this.orgId());
      await this.router.navigateByUrl('/');
    } catch (e) {
      this.error.set(ApiRequestError.from(e).message);
    } finally {
      this.busy.set(false);
    }
  }

  protected async switchAccount(): Promise<void> {
    await this.session.logout();
    await this.router.navigate(['/acceso'], { queryParams: this.authParams() });
  }
}
