import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { EsBadge, EsButton, EsSkeleton, EsToastService } from '@elikarsystems/ui';
import type { BillingSummary } from '@silopro/contracts';
import { type BillingInterval, type PlanId, PLANS } from '@silopro/domain';
import { Api, ApiRequestError } from '../../core/api';
import { fmtMoney } from '../../core/format';
import { SessionService } from '../../core/session';
import { PageHeader } from '../page-header';

const STATUS: Record<string, string> = {
  active: 'Activa',
  trialing: 'En prueba',
  past_due: 'Pago pendiente',
  canceled: 'Cancelada',
  unpaid: 'Sin pagar',
  incomplete: 'Incompleta',
  incomplete_expired: 'Vencida',
  paused: 'En pausa',
};

const gb = (bytes: number) =>
  `${(bytes / 1024 ** 3).toLocaleString('es-MX', { maximumFractionDigits: 1 })} GB`;
const dateFmt = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' });

/** Plan actual, uso de cada límite y contratación con Stripe. */
@Component({
  selector: 'sp-billing',
  imports: [EsBadge, EsButton, EsSkeleton, PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-5xl flex-col gap-6 p-4 md:p-6">
      <sp-page-header
        title="Plan y facturación"
        description="Su plan, cuánto usa de cada límite y cómo contratar o cambiar de plan. Precios en pesos mexicanos más IVA."
      />

      @if (pago() === 'ok') {
        <p class="rounded-md bg-success-soft px-3 py-2 text-sm text-success" role="status">
          ¡Gracias! Recibimos su pago. El plan se activa en unos segundos; recargue si aún no lo ve.
        </p>
      }

      @if (!summary.hasValue()) {
        <es-skeleton class="h-40 w-full" />
      } @else {
        @let b = summary.value();
        <section
          class="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
          aria-labelledby="plan-actual"
        >
          <div class="flex flex-wrap items-center gap-2">
            <h2 id="plan-actual" class="text-base font-semibold">Plan {{ planName(b.plan) }}</h2>
            @if (b.readOnly) {
              <es-badge tone="danger">Solo lectura</es-badge>
            } @else if (b.plan === 'trial') {
              <es-badge tone="warning">{{ b.trialDaysLeft }} días de prueba</es-badge>
            } @else if (b.subscriptionStatus) {
              <es-badge tone="success">{{ status(b.subscriptionStatus) }}</es-badge>
            }
            @if (b.stripeManaged && session.can('organization.manage')) {
              <button
                esButton
                size="sm"
                class="ml-auto"
                [loading]="busy() === 'portal'"
                (click)="portal()"
              >
                Administrar suscripción
              </button>
            }
          </div>
          <p class="text-sm text-fg-muted">
            @if (b.readOnly) {
              Puede consultar todo, pero para hacer cambios elija un plan. No se borra nada.
            } @else if (b.plan === 'trial' && b.trialEndsAt) {
              La prueba gratis termina el {{ longDate(b.trialEndsAt) }}. Después la cuenta queda en
              solo lectura hasta que elija un plan.
            } @else if (b.currentPeriodEnd) {
              {{ b.billingInterval === 'year' ? 'Pago anual' : 'Pago mensual' }}; el periodo actual
              termina el {{ longDate(b.currentPeriodEnd) }}.
            }
          </p>
          <dl class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            @for (u of usage(); track u.label) {
              <div>
                <dt class="text-xs text-fg-muted">{{ u.label }}</dt>
                <dd class="mt-0.5 text-sm font-medium tabular-nums">{{ u.text }}</dd>
                @if (u.ratio !== null) {
                  <div
                    class="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-active"
                    role="meter"
                    [attr.aria-label]="u.label"
                    aria-valuemin="0"
                    aria-valuemax="100"
                    [attr.aria-valuenow]="round(u.ratio * 100)"
                  >
                    <div
                      class="h-full rounded-full"
                      [class.bg-primary]="u.ratio < 0.9"
                      [class.bg-warning]="u.ratio >= 0.9"
                      [style.width.%]="u.ratio * 100"
                    ></div>
                  </div>
                }
              </div>
            }
          </dl>
        </section>

        <section class="flex flex-col gap-3" aria-labelledby="planes">
          <div class="flex flex-wrap items-center gap-2">
            <h2 id="planes" class="text-base font-semibold">Planes</h2>
            <div class="ml-auto flex gap-1" role="group" aria-label="Forma de pago">
              @for (i of intervals; track i.value) {
                <button
                  esButton
                  size="sm"
                  [variant]="interval() === i.value ? 'secondary' : 'ghost'"
                  [attr.aria-pressed]="interval() === i.value"
                  (click)="interval.set(i.value)"
                >
                  {{ i.label }}
                </button>
              }
            </div>
          </div>
          <ul class="grid grid-cols-1 gap-3 md:grid-cols-3">
            @for (p of offers; track p.id) {
              <li
                class="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
                [attr.aria-label]="'Plan ' + p.name"
              >
                <div>
                  <h3 class="font-semibold">{{ p.name }}</h3>
                  @if (p.monthly !== null) {
                    <p class="mt-1">
                      <span class="text-2xl font-semibold tabular-nums">{{
                        money(interval() === 'year' ? p.yearly! / 12 : p.monthly)
                      }}</span>
                      <span class="text-sm text-fg-muted"> / mes + IVA</span>
                    </p>
                    @if (interval() === 'year') {
                      <p class="text-xs text-fg-muted">
                        {{ money(p.yearly) }} al año (2 meses gratis)
                      </p>
                    }
                  } @else {
                    <p class="mt-1 text-2xl font-semibold">A la medida</p>
                  }
                </div>
                <ul class="flex flex-col gap-1 text-sm">
                  <li>
                    {{
                      p.limits.members === null
                        ? 'Usuarios ilimitados'
                        : 'Hasta ' + p.limits.members + ' usuarios'
                    }}
                  </li>
                  <li>
                    {{
                      p.limits.items === null
                        ? 'Artículos ilimitados'
                        : 'Hasta ' + num(p.limits.items) + ' artículos'
                    }}
                  </li>
                  <li>
                    {{
                      p.limits.photoBytes === null
                        ? 'Fotografías sin límite'
                        : gb(p.limits.photoBytes) + ' de fotografías'
                    }}
                  </li>
                  <li class="text-fg-muted">
                    Gabinetes 2D y 3D, QR, proyectos, compras y reportes
                  </li>
                </ul>
                <div class="mt-auto">
                  @if (p.id === 'enterprise') {
                    <a
                      esButton
                      class="w-full"
                      href="mailto:soporte@elikarsystems.com?subject=SiloPro%20Empresa"
                      >Contactar</a
                    >
                  } @else if (isCurrent(p.id)) {
                    <button esButton class="w-full" disabled>Su plan actual</button>
                  } @else if (!session.can('organization.manage')) {
                    <p class="text-xs text-fg-muted">Solo un propietario puede contratar.</p>
                  } @else if (!b.checkoutAvailable) {
                    <a
                      esButton
                      class="w-full"
                      href="mailto:soporte@elikarsystems.com?subject=Contratar%20SiloPro"
                      >Escríbanos para contratar</a
                    >
                  } @else {
                    <button
                      esButton
                      variant="primary"
                      class="w-full"
                      [loading]="busy() === p.id"
                      (click)="checkout(p.id)"
                    >
                      Elegir {{ p.name }}
                    </button>
                  }
                </div>
              </li>
            }
          </ul>
          <p class="text-xs text-fg-muted">
            El pago se hace en Stripe; SiloPro no ve ni guarda los datos de su tarjeta. Puede
            cancelar cuando quiera desde «Administrar suscripción».
          </p>
        </section>
      }
    </div>
  `,
})
export default class Billing {
  private readonly api = inject(Api);
  private readonly toast = inject(EsToastService);
  protected readonly session = inject(SessionService);
  /** `?pago=ok` al volver de Stripe Checkout. */
  readonly pago = input<string>();
  protected readonly money = fmtMoney;
  protected readonly gb = gb;
  protected readonly num = (n: number) => n.toLocaleString('es-MX');
  protected readonly round = Math.round;
  protected readonly offers = [PLANS.basic, PLANS.pro, PLANS.enterprise];
  protected readonly intervals: { value: BillingInterval; label: string }[] = [
    { value: 'month', label: 'Mensual' },
    { value: 'year', label: 'Anual' },
  ];
  protected readonly interval = signal<BillingInterval>('month');
  protected readonly busy = signal<string | null>(null);

  protected readonly summary = resource({
    params: () => this.session.orgId(),
    loader: async () => {
      const b = await this.api.get<BillingSummary>('/billing');
      return { ...b, stripeManaged: !!b.subscriptionStatus };
    },
  });

  protected readonly usage = computed(() => {
    if (!this.summary.hasValue()) return [];
    const { usage, limits } = this.summary.value();
    const row = (
      label: string,
      used: number,
      limit: number | null,
      fmt: (n: number) => string,
    ) => ({
      label,
      text: limit === null ? `${fmt(used)} (sin límite)` : `${fmt(used)} de ${fmt(limit)}`,
      ratio: limit === null ? null : Math.min(1, used / limit),
    });
    return [
      row('Usuarios e invitaciones', usage.members, limits.members, this.num),
      row('Artículos', usage.items, limits.items, this.num),
      row('Fotografías', usage.photoBytes, limits.photoBytes, gb),
    ];
  });

  protected planName(id: keyof typeof PLANS): string {
    return PLANS[id].name;
  }
  protected status(s: string): string {
    return STATUS[s] ?? s;
  }
  protected longDate(iso: string): string {
    return dateFmt.format(new Date(iso));
  }
  protected isCurrent(id: string): boolean {
    const b = this.summary.value();
    return !!b && b.plan === id && !b.readOnly && b.billingInterval === this.interval();
  }

  protected async checkout(plan: PlanId): Promise<void> {
    if (plan !== 'basic' && plan !== 'pro') return;
    this.busy.set(plan);
    try {
      const { url } = await this.api.post<{ url: string }>('/billing/checkout', {
        plan,
        interval: this.interval(),
      });
      location.assign(url);
    } catch (e) {
      this.toast.show(ApiRequestError.from(e).message, { tone: 'danger' });
      this.busy.set(null);
    }
  }

  protected async portal(): Promise<void> {
    this.busy.set('portal');
    try {
      const { url } = await this.api.post<{ url: string }>('/billing/portal', {});
      location.assign(url);
    } catch (e) {
      this.toast.show(ApiRequestError.from(e).message, { tone: 'danger' });
      this.busy.set(null);
    }
  }
}
