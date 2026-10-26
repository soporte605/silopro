import { ChangeDetectionStrategy, Component, computed, inject, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EsButton, EsSkeleton } from '@elikarsystems/ui';
import type { BillingSummary, JournalMovement, MovementPage } from '@silopro/contracts';
import { PLANS } from '@silopro/domain';
import { AlertsService } from '../../core/alerts';
import { Api } from '../../core/api';
import { fmtDate, fmtQty } from '../../core/format';
import { SessionService } from '../../core/session';
import { CONTACT_EMAIL, gb } from '../billing/plan-copy';

const KIND_LABELS: Record<JournalMovement['kind'], string> = {
  receipt: 'Entrada',
  issue: 'Salida',
  adjustment: 'Ajuste',
  transfer: 'Transferencia',
  consumption: 'Consumo',
};

const num = (n: number) => n.toLocaleString('es-MX');

/** Inicio de la organización: resumen, avisos y actividad reciente. */
@Component({
  selector: 'sp-home',
  imports: [EsButton, EsSkeleton, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-5xl flex-col gap-6 p-4 md:p-6">
      <header class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold tracking-tight">
            {{ session.membership()?.organizationName }}
          </h1>
          <p class="text-sm text-fg-muted">Hola, {{ firstName() }}.</p>
        </div>
        <div class="flex gap-2">
          <a esButton routerLink="/escanear">Escanear etiqueta</a>
          <a esButton variant="primary" routerLink="/inventario">Ver artículos</a>
        </div>
      </header>

      @if (empty()) {
        <section aria-labelledby="pasos">
          <h2 id="pasos" class="mb-2 text-xs font-medium text-fg-muted">Primeros pasos</h2>
          <ol class="grid grid-cols-1 gap-2 sm:grid-cols-3">
            @for (s of steps; track s.n) {
              <li>
                <a
                  [routerLink]="s.link"
                  class="flex h-full flex-col gap-0.5 rounded-lg border border-border bg-surface p-3 hover:border-border-strong"
                >
                  <span class="font-mono text-2xs text-fg-subtle">{{ s.n }}</span>
                  <span class="text-sm font-medium">{{ s.title }}</span>
                  <span class="text-xs text-fg-muted">{{ s.text }}</span>
                </a>
              </li>
            }
          </ol>
        </section>
      }

      <section aria-labelledby="resumen">
        <h2 id="resumen" class="mb-2 text-xs font-medium text-fg-muted">Resumen</h2>
        <ul class="grid grid-cols-2 gap-2 lg:grid-cols-4">
          @for (s of summary(); track s.label) {
            <li>
              <a
                [routerLink]="s.link"
                class="flex h-full flex-col gap-0.5 rounded-lg border border-border bg-surface p-3 hover:border-border-strong"
              >
                @if (s.value === null) {
                  <es-skeleton class="h-8 w-16" />
                } @else {
                  <span class="text-2xl font-semibold tabular-nums" [class.text-warning]="s.warn">{{
                    s.value
                  }}</span>
                }
                <span class="text-sm">{{ s.label }}</span>
                @if (s.hint) {
                  <span class="text-xs text-fg-muted">{{ s.hint }}</span>
                }
              </a>
            </li>
          }
        </ul>
      </section>

      <section aria-labelledby="avisos">
        <h2 id="avisos" class="mb-2 text-xs font-medium text-fg-muted">Avisos</h2>
        @if (alerts.counts(); as a) {
          <ul class="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <li>
              <a
                routerLink="/inventario"
                [queryParams]="{ bajo: 1 }"
                class="flex h-full flex-col gap-0.5 rounded-lg border border-border bg-surface p-3 hover:border-border-strong"
              >
                <span
                  class="text-2xl font-semibold tabular-nums"
                  [class.text-warning]="a.lowStock"
                  >{{ a.lowStock }}</span
                >
                <span class="text-sm">Artículos con stock bajo</span>
              </a>
            </li>
            <li>
              <a
                routerLink="/compras"
                class="flex h-full flex-col gap-0.5 rounded-lg border border-border bg-surface p-3 hover:border-border-strong"
              >
                <span class="text-2xl font-semibold tabular-nums">{{ a.toBuy }}</span>
                <span class="text-sm">Por comprar</span>
              </a>
            </li>
            <li>
              <a
                routerLink="/proyectos"
                class="flex h-full flex-col gap-0.5 rounded-lg border border-border bg-surface p-3 hover:border-border-strong"
              >
                <span
                  class="text-2xl font-semibold tabular-nums"
                  [class.text-warning]="a.projectsShort"
                  >{{ a.projectsShort }}</span
                >
                <span class="text-sm">Proyectos con faltantes</span>
              </a>
            </li>
          </ul>
        } @else {
          <es-skeleton class="h-20 w-full" />
        }
      </section>

      <section
        aria-labelledby="actividad"
        class="overflow-hidden rounded-lg border border-border bg-surface"
      >
        <div class="flex items-center justify-between border-b border-border px-3 py-2">
          <h2 id="actividad" class="text-xs font-medium text-fg-muted">Actividad reciente</h2>
          <a routerLink="/movimientos" class="text-xs font-medium text-primary hover:underline"
            >Ver todos los movimientos</a
          >
        </div>
        @if (movements.hasValue()) {
          @let rows = movements.value().movements;
          @if (rows.length) {
            <ul class="divide-y divide-border text-sm">
              @for (m of rows; track m.id) {
                <li class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-3 py-2">
                  <a [routerLink]="['/inventario', m.itemId]" class="min-w-0 flex-1 truncate">
                    <span class="font-medium">{{ m.itemName }}</span>
                    <span class="text-fg-muted"> · {{ m.locationPath }}</span>
                  </a>
                  <span
                    class="tabular-nums"
                    [class.text-success]="m.delta > 0"
                    [class.text-danger]="m.delta < 0"
                    >{{ m.delta > 0 ? '+' : '' }}{{ qty(m.delta) }} {{ m.unitSymbol }}</span
                  >
                  <span class="w-full text-xs text-fg-muted sm:w-auto">
                    {{ kind[m.kind] }} · {{ m.actorName }} · {{ date(m.occurredAt) }}
                  </span>
                </li>
              }
            </ul>
          } @else {
            <p class="px-3 py-4 text-sm text-fg-muted">
              Aún no hay movimientos. Aparecerán aquí las entradas, salidas y transferencias.
            </p>
          }
        } @else if (movements.isLoading()) {
          <div class="p-3"><es-skeleton class="h-24 w-full" /></div>
        } @else {
          <p class="px-3 py-4 text-sm text-fg-muted">No se pudo cargar la actividad reciente.</p>
        }
      </section>

      <p class="text-xs text-fg-subtle">
        ¿Necesita ayuda? Escríbanos a
        <a class="underline" [href]="'mailto:' + contact">{{ contact }}</a
        >.
      </p>
    </div>
  `,
})
export default class Home {
  private readonly api = inject(Api);
  protected readonly session = inject(SessionService);
  protected readonly alerts = inject(AlertsService);
  protected readonly contact = CONTACT_EMAIL;
  protected readonly kind = KIND_LABELS;
  protected readonly qty = fmtQty;
  protected readonly date = fmtDate;
  protected readonly steps = [
    {
      n: 1,
      title: 'Cree una ubicación',
      text: 'Su almacén, taller o laboratorio.',
      link: '/ubicaciones',
    },
    {
      n: 2,
      title: 'Defina categorías',
      text: 'Con los atributos técnicos de cada tipo.',
      link: '/categorias',
    },
    {
      n: 3,
      title: 'Registre artículos',
      text: 'Y sus entradas de existencias.',
      link: '/inventario',
    },
  ];

  private readonly billing = resource({
    params: () => this.session.orgId() ?? undefined,
    loader: () => this.api.get<BillingSummary>('/billing'),
  });
  protected readonly movements = resource({
    params: () => this.session.orgId() ?? undefined,
    loader: () => this.api.get<MovementPage>('/movements', { limit: 6 }),
  });

  protected readonly firstName = computed(() => this.session.me()?.user.name.split(' ')[0] ?? '');
  /** Sin artículos todavía: se muestran los primeros pasos. */
  protected readonly empty = computed(
    () => this.billing.hasValue() && this.billing.value().usage.items === 0,
  );

  protected readonly summary = computed(() => {
    const b = this.billing.hasValue() ? this.billing.value() : null;
    const near = (used: number, limit: number | null) => limit !== null && used >= limit * 0.9;
    const of = (limit: number | null, fmt: (n: number) => string) =>
      limit === null ? 'Sin límite' : `de ${fmt(limit)} en su plan`;
    return [
      {
        label: 'Artículos',
        value: b && num(b.usage.items),
        hint: b && of(b.limits.items, num),
        warn: !!b && near(b.usage.items, b.limits.items),
        link: '/inventario',
      },
      {
        label: 'Miembros',
        value: b && num(b.usage.members),
        hint: b && of(b.limits.members, num),
        warn: !!b && near(b.usage.members, b.limits.members),
        link: '/miembros',
      },
      {
        label: 'Fotografías',
        value: b && gb(b.usage.photoBytes),
        hint: b && of(b.limits.photoBytes, gb),
        warn: !!b && near(b.usage.photoBytes, b.limits.photoBytes),
        link: '/plan',
      },
      {
        label: !b ? 'Plan' : b.plan === 'trial' ? PLANS.trial.name : `Plan ${PLANS[b.plan].name}`,
        value: b && this.planValue(b),
        hint: b && this.planHint(b),
        warn: !!b && (b.readOnly || (b.trialDaysLeft !== null && b.trialDaysLeft <= 5)),
        link: '/plan',
      },
    ];
  });

  private planValue(b: BillingSummary): string {
    if (b.readOnly) return 'Solo lectura';
    if (b.plan === 'trial' && b.trialDaysLeft !== null)
      return b.trialDaysLeft === 1 ? '1 día' : `${b.trialDaysLeft} días`;
    return 'Activo';
  }

  private planHint(b: BillingSummary): string {
    if (b.readOnly) return 'Elija un plan para hacer cambios';
    if (b.plan === 'trial') return 'restantes; ver planes';
    return 'Ver plan y facturación';
  }
}
