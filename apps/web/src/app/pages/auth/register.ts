import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { EsButton, EsFormField, EsInput } from '@elikarsystems/ui';
import { registerSchema } from '@silopro/contracts';
import { ApiRequestError } from '../../core/api';
import { zodErrors } from '../../core/forms';
import { SessionService } from '../../core/session';
import { AuthLayout } from './auth-layout';

@Component({
  selector: 'sp-register',
  imports: [AuthLayout, ReactiveFormsModule, RouterLink, EsButton, EsFormField, EsInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sp-auth-layout
      title="Crear cuenta"
      subtitle="Se creará tu organización y serás su propietario."
    >
      <form class="flex flex-col gap-3" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        @if (error()) {
          <p class="rounded-md bg-danger-soft px-2.5 py-2 text-sm text-danger" role="alert">
            {{ error() }}
          </p>
        }
        <es-form-field label="Nombre" required [error]="fields()['name']" #n="esFormField">
          <input
            esInput
            size="lg"
            autocomplete="name"
            formControlName="name"
            [id]="n.controlId"
            [attr.aria-describedby]="n.describedBy()"
            [attr.aria-invalid]="!!fields()['name']"
          />
        </es-form-field>
        <es-form-field
          label="Correo electrónico"
          required
          [error]="fields()['email']"
          #e="esFormField"
        >
          <input
            esInput
            size="lg"
            type="email"
            autocomplete="email"
            formControlName="email"
            [id]="e.controlId"
            [attr.aria-describedby]="e.describedBy()"
            [attr.aria-invalid]="!!fields()['email']"
          />
        </es-form-field>
        <es-form-field
          label="Contraseña"
          required
          hint="Mínimo 10 caracteres."
          [error]="fields()['password']"
          #p="esFormField"
        >
          <input
            esInput
            size="lg"
            type="password"
            autocomplete="new-password"
            formControlName="password"
            [id]="p.controlId"
            [attr.aria-describedby]="p.describedBy()"
            [attr.aria-invalid]="!!fields()['password']"
          />
        </es-form-field>
        <es-form-field
          label="Organización"
          required
          hint="Tu empresa, taller o laboratorio."
          [error]="fields()['organizationName']"
          #o="esFormField"
        >
          <input
            esInput
            size="lg"
            autocomplete="organization"
            formControlName="organizationName"
            [id]="o.controlId"
            [attr.aria-describedby]="o.describedBy()"
            [attr.aria-invalid]="!!fields()['organizationName']"
          />
        </es-form-field>
        <button esButton variant="primary" size="lg" type="submit" [loading]="busy()">
          Crear cuenta
        </button>
      </form>
      <p spAuthFooter>
        ¿Ya tienes cuenta?
        <a routerLink="/acceso" class="text-primary hover:underline">Iniciar sesión</a>
      </p>
    </sp-auth-layout>
  `,
})
export default class Register {
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: [''],
    email: [''],
    password: [''],
    organizationName: [''],
  });
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly fields = signal<Record<string, string>>({});

  protected async submit(): Promise<void> {
    const parsed = registerSchema.safeParse(this.form.getRawValue());
    this.fields.set(parsed.success ? {} : zodErrors(parsed.error));
    if (!parsed.success) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.session.register(parsed.data);
      await this.router.navigateByUrl('/');
    } catch (e) {
      const err = ApiRequestError.from(e);
      this.fields.set(err.fieldErrors());
      this.error.set(err.status === 409 ? 'Ya existe una cuenta con ese correo.' : err.message);
    } finally {
      this.busy.set(false);
    }
  }
}
