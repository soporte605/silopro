import { ChangeDetectionStrategy, Component, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { BillingSummary } from '@silopro/contracts';
import { Api } from '../core/api';
import { SessionService } from '../core/session';

/** Aviso de fin de prueba o de cuenta en solo lectura, con enlace a «Plan y facturación». */
@Component({
  selector: 'sp-plan-banner',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (billing.hasValue()) {
      @let b = billing.value();
      @if (b.readOnly) {
        <div
          class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-danger-soft px-4 py-1.5 text-sm text-danger"
          role="region"
          aria-label="Plan"
        >
          <span class="flex-1">
            {{
              b.plan === 'trial' ? 'La prueba gratis terminó.' : 'La suscripción no está activa.'
            }}
            Puede consultar todo, pero para hacer cambios elija un plan.
          </span>
          <a routerLink="/plan" class="font-medium underline">Elegir plan</a>
        </div>
      } @else if (b.plan === 'trial' && b.trialDaysLeft !== null && b.trialDaysLeft <= 5) {
        <div
          class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-warning-soft px-4 py-1.5 text-sm"
          role="region"
          aria-label="Plan"
        >
          <span class="flex-1">
            {{ b.trialDaysLeft === 1 ? 'Queda 1 día' : 'Quedan ' + b.trialDaysLeft + ' días' }} de
            prueba gratis.
          </span>
          <a routerLink="/plan" class="font-medium underline">Ver planes</a>
        </div>
      }
    }
  `,
})
export class PlanBanner {
  private readonly api = inject(Api);
  private readonly session = inject(SessionService);
  protected readonly billing = resource({
    params: () => this.session.orgId() ?? undefined,
    loader: () => this.api.get<BillingSummary>('/billing'),
  });
}
