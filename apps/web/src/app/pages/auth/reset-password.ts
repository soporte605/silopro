import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { EsButton, EsFormField, EsInput } from '@elikarsystems/ui';
import { firstValueFrom } from 'rxjs';
import { ApiRequestError } from '../../core/api';
import { SessionService } from '../../core/session';
import { AuthLayout } from './auth-layout';

/** Elegir una contraseña nueva con el enlace recibido por correo. */
@Component({
  selector: 'sp-reset-password',
  imports: [AuthLayout, ReactiveFormsModule, RouterLink, EsButton, EsFormField, EsInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sp-auth-layout title="Nueva contraseña" subtitle="Mínimo 10 caracteres.">
      @if (done()) {
        <p class="rounded-md bg-success-soft px-2.5 py-2 text-sm text-success" role="status">
          Listo, tu contraseña cambió. Por seguridad cerramos las sesiones abiertas.
        </p>
        <a esButton variant="primary" size="lg" class="mt-3 w-full" routerLink="/acceso"
          >Iniciar sesión</a
        >
      } @else {
        <form class="flex flex-col gap-3" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          @if (error()) {
            <p class="rounded-md bg-danger-soft px-2.5 py-2 text-sm text-danger" role="alert">
              {{ error() }}
              @if (expired()) {
                <a routerLink="/recuperar-contrasena" class="underline">Pedir otro enlace</a>
              }
            </p>
          }
          <es-form-field label="Contraseña nueva" #p="esFormField">
            <input
              esInput
              size="lg"
              type="password"
              autocomplete="new-password"
              formControlName="password"
              [id]="p.controlId"
            />
          </es-form-field>
          <button esButton variant="primary" size="lg" type="submit" [loading]="busy()">
            Guardar contraseña
          </button>
        </form>
      }
    </sp-auth-layout>
  `,
})
export default class ResetPassword {
  private readonly http = inject(HttpClient);
  private readonly session = inject(SessionService);
  readonly token = input<string>();

  protected readonly form = inject(NonNullableFormBuilder).group({
    password: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(128)]],
  });
  protected readonly busy = signal(false);
  protected readonly done = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly expired = signal(false);

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.error.set('La contraseña debe tener al menos 10 caracteres.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(
        this.http.post('/api/auth/password/reset', {
          token: this.token() ?? '',
          password: this.form.getRawValue().password,
        }),
      );
      this.session.me.set(null);
      this.done.set(true);
    } catch (e) {
      const err = ApiRequestError.from(e);
      const invalidLink = err.code === 'INVALID_LINK' || 'token' in err.fieldErrors();
      this.expired.set(invalidLink);
      this.error.set(invalidLink ? 'El enlace no es válido o ya venció.' : err.message);
    } finally {
      this.busy.set(false);
    }
  }
}
