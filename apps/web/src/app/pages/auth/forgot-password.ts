import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { EsButton, EsFormField, EsInput } from '@elikarsystems/ui';
import { firstValueFrom } from 'rxjs';
import { ApiRequestError } from '../../core/api';
import { AuthLayout } from './auth-layout';

/** Pide el enlace para elegir una contraseña nueva. */
@Component({
  selector: 'sp-forgot-password',
  imports: [AuthLayout, ReactiveFormsModule, RouterLink, EsButton, EsFormField, EsInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sp-auth-layout
      title="Recuperar contraseña"
      subtitle="Te enviamos un enlace para elegir una nueva."
    >
      @if (sent()) {
        <p class="rounded-md bg-success-soft px-2.5 py-2 text-sm text-success" role="status">
          Si hay una cuenta con {{ form.controls.email.value }}, en unos minutos llegará un correo
          con el enlace. Vence en 1 hora; revisa también la carpeta de spam.
        </p>
      } @else {
        <form class="flex flex-col gap-3" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          @if (error()) {
            <p class="rounded-md bg-danger-soft px-2.5 py-2 text-sm text-danger" role="alert">
              {{ error() }}
            </p>
          }
          <es-form-field label="Correo electrónico" #e="esFormField">
            <input
              esInput
              size="lg"
              type="email"
              autocomplete="email"
              formControlName="email"
              [id]="e.controlId"
            />
          </es-form-field>
          <button esButton variant="primary" size="lg" type="submit" [loading]="busy()">
            Enviar enlace
          </button>
        </form>
      }
      <p spAuthFooter>
        <a routerLink="/acceso" class="text-primary hover:underline">Volver a iniciar sesión</a>
      </p>
    </sp-auth-layout>
  `,
})
export default class ForgotPassword {
  private readonly http = inject(HttpClient);
  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
  });
  protected readonly busy = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.error.set('Escribe un correo válido.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(this.http.post('/api/auth/password/forgot', this.form.getRawValue()));
      this.sent.set(true);
    } catch (e) {
      this.error.set(ApiRequestError.from(e).message);
    } finally {
      this.busy.set(false);
    }
  }
}
