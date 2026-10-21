import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Logo } from '../../layout/logo';

/** Marco común de las pantallas de acceso y registro. */
@Component({
  selector: 'sp-auth-layout',
  imports: [Logo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="flex min-h-dvh items-center justify-center bg-bg p-4">
      <div class="w-full max-w-sm">
        <div class="mb-6 flex items-center gap-2">
          <sp-logo class="h-7" />
          <span class="text-base font-semibold tracking-tight">SiloPro</span>
        </div>
        <div class="rounded-lg border border-border bg-surface p-5 shadow-sm">
          <h1 class="text-lg font-semibold tracking-tight">{{ title() }}</h1>
          @if (subtitle()) {
            <p class="mt-0.5 mb-4 text-sm text-fg-muted">{{ subtitle() }}</p>
          }
          <ng-content />
        </div>
        <div class="mt-4 text-center text-sm text-fg-muted">
          <ng-content select="[spAuthFooter]" />
        </div>
      </div>
    </main>
  `,
})
export class AuthLayout {
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
}

/** Acepta solo rutas internas como destino tras iniciar sesión. */
export function safeReturnUrl(value: string | null | undefined): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}
