import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  type OnInit,
  signal,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { EsButton, EsFormField, EsInput } from '@elikarsystems/ui';
import { ApiRequestError } from '../../core/api';
import { SessionService } from '../../core/session';
import { AuthLayout, safeReturnUrl } from './auth-layout';

@Component({
  selector: 'sp-login',
  imports: [AuthLayout, ReactiveFormsModule, RouterLink, EsButton, EsFormField, EsInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sp-auth-layout title="Iniciar sesión" subtitle="Accede a tu inventario.">
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
        <es-form-field label="Contraseña" #p="esFormField">
          <input
            esInput
            size="lg"
            type="password"
            autocomplete="current-password"
            formControlName="password"
            [id]="p.controlId"
          />
        </es-form-field>
        <button esButton variant="primary" size="lg" type="submit" [loading]="busy()">
          Entrar
        </button>
      </form>
      <p spAuthFooter>
        ¿No tienes cuenta?
        <a
          routerLink="/registro"
          queryParamsHandling="preserve"
          class="text-primary hover:underline"
          >Crear cuenta</a
        >
      </p>
    </sp-auth-layout>
  `,
})
export default class Login implements OnInit {
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  readonly volver = input<string>();
  readonly correo = input<string>();

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    const correo = this.correo();
    if (correo) this.form.controls.email.setValue(correo);
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.error.set('Escribe tu correo y contraseña.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.session.login(this.form.getRawValue());
      await this.router.navigateByUrl(safeReturnUrl(this.volver()));
    } catch (e) {
      const err = ApiRequestError.from(e);
      this.error.set(err.status === 401 ? 'Correo o contraseña incorrectos.' : err.message);
    } finally {
      this.busy.set(false);
    }
  }
}
