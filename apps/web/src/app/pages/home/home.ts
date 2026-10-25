import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EsBadge, EsButton, EsSkeleton, EsTable } from '@elikarsystems/ui';
import { AlertsService } from '../../core/alerts';
import { SessionService } from '../../core/session';

interface Health {
  status: 'ok' | 'degraded';
  version: string;
  checks: Record<string, 'up' | 'down' | 'skipped'>;
}

type ApiState = { kind: 'loading' } | { kind: 'ok'; health: Health } | { kind: 'offline' };

@Component({
  selector: 'sp-home',
  imports: [EsBadge, EsButton, EsSkeleton, EsTable, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-5xl flex-col gap-6 p-4 md:p-6">
      <header class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="text-xl font-semibold tracking-tight">
            {{ session.membership()?.organizationName }}
          </h1>
          <p class="text-sm text-fg-muted">
            Sistema universal de inventario y almacenamiento inteligente
          </p>
        </div>
        <a esButton variant="primary" routerLink="/inventario">Ver artículos</a>
      </header>

      @if (alerts.counts(); as a) {
        @if (a.lowStock || a.toBuy || a.projectsShort) {
          <section aria-labelledby="avisos">
            <h2 id="avisos" class="mb-2 text-xs font-medium text-fg-muted">Avisos</h2>
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
          </section>
        }
      }

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

      <section aria-labelledby="estado" class="rounded-lg border border-border bg-surface">
        <h2 id="estado" class="border-b border-border px-3 py-2 text-xs font-medium text-fg-muted">
          Estado del sistema
        </h2>
        <dl class="grid grid-cols-2 divide-x divide-border text-sm sm:grid-cols-4">
          <div class="px-3 py-2.5">
            <dt class="text-xs text-fg-muted">API</dt>
            <dd class="mt-1">
              @switch (api().kind) {
                @case ('loading') {
                  <es-skeleton class="h-5 w-16" />
                }
                @case ('ok') {
                  <es-badge tone="success" dot>En línea</es-badge>
                }
                @default {
                  <es-badge tone="warning" dot>Sin conexión</es-badge>
                }
              }
            </dd>
          </div>
          <div class="px-3 py-2.5">
            <dt class="text-xs text-fg-muted">Base de datos</dt>
            <dd class="mt-1">
              @if (api(); as s) {
                @if (s.kind === 'ok') {
                  @switch (s.health.checks['database']) {
                    @case ('up') {
                      <es-badge tone="success" dot>Conectada</es-badge>
                    }
                    @case ('down') {
                      <es-badge tone="danger" dot>Caída</es-badge>
                    }
                    @default {
                      <es-badge>No configurada</es-badge>
                    }
                  }
                } @else {
                  <span class="text-fg-subtle">—</span>
                }
              }
            </dd>
          </div>
          <div class="px-3 py-2.5">
            <dt class="text-xs text-fg-muted">Versión API</dt>
            <dd class="mt-1 font-mono text-xs">
              {{ version() }}
            </dd>
          </div>
          <div class="px-3 py-2.5">
            <dt class="text-xs text-fg-muted">Fase actual</dt>
            <dd class="mt-1">{{ currentPhase }} · {{ phases[currentPhase - 1]!.name }}</dd>
          </div>
        </dl>
      </section>

      <section
        aria-labelledby="hoja"
        class="overflow-hidden rounded-lg border border-border bg-surface"
      >
        <h2 id="hoja" class="border-b border-border px-3 py-2 text-xs font-medium text-fg-muted">
          Hoja de ruta
        </h2>
        <table esTable>
          <thead>
            <tr>
              <th scope="col" class="w-12">Fase</th>
              <th scope="col">Alcance</th>
              <th scope="col" class="w-32">Estado</th>
            </tr>
          </thead>
          <tbody>
            @for (p of phases; track p.n) {
              <tr>
                <td class="code">{{ p.n }}</td>
                <td>
                  <span class="font-medium">{{ p.name }}</span>
                  <span class="text-fg-muted"> · {{ p.scope }}</span>
                </td>
                <td>
                  @if (p.done) {
                    <es-badge tone="success">Completada</es-badge>
                  } @else if (p.n === currentPhase) {
                    <es-badge tone="primary">En curso</es-badge>
                  } @else {
                    <es-badge>Pendiente</es-badge>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </section>
    </div>
  `,
})
export default class Home {
  private readonly http = inject(HttpClient);
  protected readonly session = inject(SessionService);
  protected readonly alerts = inject(AlertsService);
  /** La Fase 8 se adelantó a la 7 para lanzar antes (ver ROADMAP). */
  protected readonly currentPhase = 8;
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
  protected readonly api = signal<ApiState>({ kind: 'loading' });
  protected readonly version = computed(() => {
    const s = this.api();
    return s.kind === 'ok' ? s.health.version : '—';
  });

  protected readonly phases = [
    {
      n: 1,
      name: 'Fundamentos',
      scope: 'arquitectura, marca, design system, monorepo, CI',
      done: true,
    },
    {
      n: 2,
      name: 'Inventario',
      scope: 'autenticación, organizaciones, artículos, categorías',
      done: true,
    },
    {
      n: 3,
      name: 'Almacenamiento',
      scope: 'almacenes, ubicaciones, gabinetes, editor 2D',
      done: true,
    },
    {
      n: 4,
      name: 'Visualización 3D',
      scope: 'Three.js, selección, apertura de cajones',
      done: true,
    },
    { n: 5, name: 'Operaciones', scope: 'movimientos, reservas, auditoría, QR', done: true },
    { n: 6, name: 'Productividad', scope: 'proyectos, BOM, alertas, importación', done: true },
    { n: 7, name: 'Fabricación', scope: 'CAD paramétrico, STL/3MF, impresión 3D', done: false },
    {
      n: 8,
      name: 'Comercialización',
      scope: 'planes, cobros, correos, landing, lanzamiento',
      done: false,
    },
  ];

  constructor() {
    this.http.get<Health>('/api/health').subscribe({
      next: (health) => this.api.set({ kind: 'ok', health }),
      error: () => this.api.set({ kind: 'offline' }),
    });
  }
}
