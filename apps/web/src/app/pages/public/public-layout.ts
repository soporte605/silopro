import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EsButton } from '@elikarsystems/ui';
import { SessionService } from '../../core/session';
import { Logo } from '../../layout/logo';
import { CONTACT_EMAIL } from '../billing/plan-copy';

/** Encabezado y pie de las páginas públicas (landing y avisos legales). */
@Component({
  selector: 'sp-public-layout',
  imports: [RouterLink, EsButton, Logo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex min-h-dvh flex-col bg-bg">
      <header class="border-b border-border bg-surface">
        <div class="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
          <a routerLink="/producto" class="flex items-center gap-2" aria-label="SiloPro, inicio">
            <sp-logo class="h-7" />
            <span class="text-base font-semibold tracking-tight">SiloPro</span>
          </a>
          <nav class="ml-auto flex items-center gap-1" aria-label="Cuenta">
            @if (session.me()) {
              <a esButton variant="primary" routerLink="/">Ir a mi inventario</a>
            } @else {
              <a esButton variant="ghost" routerLink="/acceso">Iniciar sesión</a>
              <a esButton variant="primary" routerLink="/registro">Prueba gratis</a>
            }
          </nav>
        </div>
      </header>
      <main id="contenido" class="flex-1" tabindex="-1">
        <ng-content />
      </main>
      <footer class="border-t border-border bg-surface">
        <div
          class="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-fg-muted sm:flex-row sm:items-center"
        >
          <p>
            SiloPro, un producto de
            <a class="underline" href="https://elikarsystems.com/">ElikarSystems</a>.
          </p>
          <nav class="flex flex-wrap gap-x-4 gap-y-1 sm:ml-auto" aria-label="Legal">
            <a class="hover:text-fg" routerLink="/privacidad">Aviso de privacidad</a>
            <a class="hover:text-fg" routerLink="/terminos">Términos y condiciones</a>
            <a class="hover:text-fg" [href]="'mailto:' + contact">{{ contact }}</a>
          </nav>
        </div>
      </footer>
    </div>
  `,
})
export class PublicLayout {
  protected readonly session = inject(SessionService);
  protected readonly contact = CONTACT_EMAIL;
}
