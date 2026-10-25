import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  LucideBox,
  LucideChartColumn,
  LucideClipboardList,
  LucideFileSpreadsheet,
  LucideGrid3x3,
  LucideQrCode,
  LucideUsers,
} from '@lucide/angular';
import { EsButton } from '@elikarsystems/ui';
import { type BillingInterval, PLANS, TRIAL_DAYS } from '@silopro/domain';
import { fmtMoney } from '../../core/format';
import { CONTACT_EMAIL, PLAN_INCLUDES, planLimitLines } from '../billing/plan-copy';
import { PublicLayout } from './public-layout';

/** Página comercial pública: qué hace SiloPro, precios y registro de prueba. */
@Component({
  selector: 'sp-landing',
  imports: [
    RouterLink,
    EsButton,
    PublicLayout,
    LucideBox,
    LucideChartColumn,
    LucideClipboardList,
    LucideFileSpreadsheet,
    LucideGrid3x3,
    LucideQrCode,
    LucideUsers,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sp-public-layout>
      <section class="mx-auto max-w-6xl px-4 pt-14 pb-12 sm:pt-20" aria-labelledby="titulo">
        <p class="text-sm font-medium text-primary">Inventario con ubicación física</p>
        <h1
          id="titulo"
          class="mt-2 max-w-3xl text-3xl font-semibold tracking-tight text-balance sm:text-5xl"
        >
          Sabe qué tienes y en qué cajón está.
        </h1>
        <p class="mt-4 max-w-2xl text-base text-fg-muted sm:text-lg">
          SiloPro lleva tu inventario y lo conecta con tus gabinetes, cajones y anaqueles. Busca una
          pieza y ve su cajón resaltado; escanea el QR de un cajón y ve lo que contiene. Hecho para
          talleres, refaccionarias, laboratorios y almacenes pequeños.
        </p>
        <div class="mt-6 flex flex-wrap gap-2">
          <a esButton variant="primary" size="lg" routerLink="/registro"
            >Prueba gratis {{ trialDays }} días</a
          >
          <a esButton size="lg" href="#precios">Ver precios</a>
        </div>
        <p class="mt-3 text-sm text-fg-muted">
          Sin tarjeta. Al terminar la prueba tus datos se conservan y eliges plan cuando quieras.
        </p>
      </section>

      <section class="border-y border-border bg-surface" aria-labelledby="funciones">
        <div class="mx-auto max-w-6xl px-4 py-12">
          <h2 id="funciones" class="text-2xl font-semibold tracking-tight">Qué puedes hacer</h2>
          <ul class="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <li class="flex gap-3">
              <svg lucideGrid3x3 class="mt-0.5 shrink-0 text-primary" aria-hidden="true"></svg>
              <div>
                <h3 class="font-semibold">Gabinetes en 2D y 3D</h3>
                <p class="mt-1 text-sm text-fg-muted">
                  Dibuja tus gabinetes y anaqueles; cada cajón es una ubicación con su contenido y
                  capacidad.
                </p>
              </div>
            </li>
            <li class="flex gap-3">
              <svg lucideQrCode class="mt-0.5 shrink-0 text-primary" aria-hidden="true"></svg>
              <div>
                <h3 class="font-semibold">Etiquetas QR</h3>
                <p class="mt-1 text-sm text-fg-muted">
                  Imprime etiquetas para cajones y artículos. Al escanearlas con el celular se abre
                  la ficha; el código no revela datos del artículo.
                </p>
              </div>
            </li>
            <li class="flex gap-3">
              <svg lucideBox class="mt-0.5 shrink-0 text-primary" aria-hidden="true"></svg>
              <div>
                <h3 class="font-semibold">Existencias y movimientos</h3>
                <p class="mt-1 text-sm text-fg-muted">
                  Entradas, salidas, ajustes por conteo, transferencias y reservas, con historial y
                  avisos de stock mínimo.
                </p>
              </div>
            </li>
            <li class="flex gap-3">
              <svg
                lucideClipboardList
                class="mt-0.5 shrink-0 text-primary"
                aria-hidden="true"
              ></svg>
              <div>
                <h3 class="font-semibold">Proyectos y compras</h3>
                <p class="mt-1 text-sm text-fg-muted">
                  Arma la lista de materiales de un proyecto, ve qué falta y pásalo a la lista de
                  compras.
                </p>
              </div>
            </li>
            <li class="flex gap-3">
              <svg
                lucideFileSpreadsheet
                class="mt-0.5 shrink-0 text-primary"
                aria-hidden="true"
              ></svg>
              <div>
                <h3 class="font-semibold">Importa desde Excel</h3>
                <p class="mt-1 text-sm text-fg-muted">
                  Sube tu hoja de cálculo o CSV con una plantilla y revisa cada renglón antes de
                  guardarlo.
                </p>
              </div>
            </li>
            <li class="flex gap-3">
              <svg lucideChartColumn class="mt-0.5 shrink-0 text-primary" aria-hidden="true"></svg>
              <div>
                <h3 class="font-semibold">Reportes</h3>
                <p class="mt-1 text-sm text-fg-muted">
                  Valor del inventario, movimientos del periodo y artículos sin movimiento,
                  exportables a CSV.
                </p>
              </div>
            </li>
            <li class="flex gap-3">
              <svg lucideUsers class="mt-0.5 shrink-0 text-primary" aria-hidden="true"></svg>
              <div>
                <h3 class="font-semibold">Equipo con roles</h3>
                <p class="mt-1 text-sm text-fg-muted">
                  Invita a tu equipo como administrador, operador o solo consulta. Cada organización
                  ve únicamente sus datos.
                </p>
              </div>
            </li>
          </ul>
        </div>
      </section>

      <section
        id="precios"
        class="mx-auto max-w-6xl scroll-mt-4 px-4 py-12"
        aria-labelledby="t-precios"
      >
        <div class="flex flex-wrap items-end gap-3">
          <div>
            <h2 id="t-precios" class="text-2xl font-semibold tracking-tight">Precios</h2>
            <p class="mt-1 text-sm text-fg-muted">
              En pesos mexicanos, más IVA. Todos empiezan con {{ trialDays }} días gratis con lo del
              plan Profesional.
            </p>
          </div>
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
        <ul class="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
          @for (p of offers; track p.id) {
            <li
              class="flex flex-col gap-3 rounded-lg border bg-surface p-5"
              [class.border-primary]="p.id === 'pro'"
              [class.border-border]="p.id !== 'pro'"
              [attr.aria-label]="'Plan ' + p.name"
            >
              <div>
                <h3 class="font-semibold">
                  {{ p.name }}
                  @if (p.id === 'pro') {
                    <span class="ml-1 text-xs font-medium text-primary">Recomendado</span>
                  }
                </h3>
                @if (p.monthly !== null) {
                  <p class="mt-1">
                    <span class="text-3xl font-semibold tabular-nums">{{
                      money(interval() === 'year' ? p.yearly! / 12 : p.monthly)
                    }}</span>
                    <span class="text-sm text-fg-muted"> / mes + IVA</span>
                  </p>
                  <p class="text-xs text-fg-muted">
                    @if (interval() === 'year') {
                      {{ money(p.yearly) }} al año (2 meses gratis)
                    } @else {
                      Pago mensual, cancela cuando quieras
                    }
                  </p>
                } @else {
                  <p class="mt-1 text-3xl font-semibold">A la medida</p>
                  <p class="text-xs text-fg-muted">Más usuarios, artículos o necesidades propias</p>
                }
              </div>
              <ul class="flex flex-col gap-1 text-sm">
                @for (line of limitLines(p); track line) {
                  <li>{{ line }}</li>
                }
                <li class="text-fg-muted">{{ includes }}</li>
              </ul>
              <div class="mt-auto">
                @if (p.id === 'enterprise') {
                  <a
                    esButton
                    class="w-full"
                    [href]="'mailto:' + contact + '?subject=SiloPro%20Empresa'"
                    >Contactar</a
                  >
                } @else {
                  <a
                    esButton
                    class="w-full"
                    [variant]="p.id === 'pro' ? 'primary' : 'secondary'"
                    routerLink="/registro"
                    >Empezar prueba gratis</a
                  >
                }
              </div>
            </li>
          }
        </ul>
      </section>

      <section class="border-t border-border bg-surface" aria-labelledby="preguntas">
        <div class="mx-auto max-w-3xl px-4 py-12">
          <h2 id="preguntas" class="text-2xl font-semibold tracking-tight">Preguntas frecuentes</h2>
          <dl class="mt-6 flex flex-col gap-5">
            <div>
              <dt class="font-semibold">¿Necesito tarjeta para la prueba?</dt>
              <dd class="mt-1 text-sm text-fg-muted">
                No. Creas tu cuenta con tu correo y tienes {{ trialDays }} días con lo del plan
                Profesional.
              </dd>
            </div>
            <div>
              <dt class="font-semibold">¿Qué pasa cuando termina la prueba?</dt>
              <dd class="mt-1 text-sm text-fg-muted">
                Tu inventario queda en solo lectura: puedes consultarlo y exportarlo, pero no
                modificarlo hasta elegir un plan. No borramos nada.
              </dd>
            </div>
            <div>
              <dt class="font-semibold">¿Cómo se paga y puedo cancelar?</dt>
              <dd class="mt-1 text-sm text-fg-muted">
                Con tarjeta a través de Stripe; SiloPro no ve ni guarda los datos de tu tarjeta. La
                suscripción se renueva sola y la cancelas cuando quieras desde «Plan y facturación».
              </dd>
            </div>
            <div>
              <dt class="font-semibold">¿Puedo cambiar de plan?</dt>
              <dd class="mt-1 text-sm text-fg-muted">
                Sí, subir o bajar de plan se hace desde la misma pantalla. Si bajas, tu uso debe
                caber en los límites del nuevo plan para seguir agregando.
              </dd>
            </div>
            <div>
              <dt class="font-semibold">¿Quién ve mis datos?</dt>
              <dd class="mt-1 text-sm text-fg-muted">
                Solo los miembros de tu organización. Lee el
                <a class="underline" routerLink="/privacidad">aviso de privacidad</a>.
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section class="mx-auto max-w-6xl px-4 py-14 text-center" aria-labelledby="cierre">
        <h2 id="cierre" class="text-2xl font-semibold tracking-tight">
          Ordena tu inventario esta semana
        </h2>
        <p class="mt-2 text-fg-muted">Crea tu cuenta en un minuto e importa tu hoja de cálculo.</p>
        <a esButton variant="primary" size="lg" class="mt-5" routerLink="/registro"
          >Prueba gratis {{ trialDays }} días</a
        >
      </section>
    </sp-public-layout>
  `,
})
export default class Landing {
  protected readonly trialDays = TRIAL_DAYS;
  protected readonly money = fmtMoney;
  protected readonly limitLines = planLimitLines;
  protected readonly includes = PLAN_INCLUDES;
  protected readonly contact = CONTACT_EMAIL;
  protected readonly offers = [PLANS.basic, PLANS.pro, PLANS.enterprise];
  protected readonly intervals: { value: BillingInterval; label: string }[] = [
    { value: 'month', label: 'Mensual' },
    { value: 'year', label: 'Anual' },
  ];
  protected readonly interval = signal<BillingInterval>('month');
}
