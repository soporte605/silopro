import { CdkMenuTrigger } from '@angular/cdk/menu';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Logo } from './logo';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {
  EsButton,
  EsCommandPaletteService,
  EsKbd,
  EsMenu,
  EsMenuItem,
  EsMenuSeparator,
  EsNavItem,
  EsThemeService,
  EsTooltip,
} from '@elikarsystems/ui';
import {
  LucideArrowLeftRight,
  LucideBox,
  LucideBuilding2,
  LucideCheck,
  LucideClipboardList,
  LucideComponent,
  LucideFolderTree,
  LucideGrid3x3,
  LucideHouse,
  LucideLogOut,
  LucideMapPin,
  LucideMonitor,
  LucideMoon,
  LucideSearch,
  LucideSun,
  LucideTruck,
} from '@lucide/angular';
import { ROLE_LABELS } from '@silopro/domain';
import { SessionService } from '../core/session';

@Component({
  selector: 'sp-shell',
  imports: [
    RouterOutlet,
    NgTemplateOutlet,
    Logo,
    RouterLink,
    RouterLinkActive,
    EsNavItem,
    EsButton,
    EsKbd,
    EsTooltip,
    LucideHouse,
    LucideGrid3x3,
    LucideComponent,
    LucideSearch,
    LucideSun,
    LucideMoon,
    LucideMonitor,
    LucideMapPin,
    LucideArrowLeftRight,
    LucideClipboardList,
    LucideBox,
    LucideBuilding2,
    LucideCheck,
    LucideFolderTree,
    LucideLogOut,
    LucideTruck,
    CdkMenuTrigger,
    EsMenu,
    EsMenuItem,
    EsMenuSeparator,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'grid h-dvh grid-cols-1 md:grid-cols-[224px_1fr]',
    '(document:keydown)': 'onKeydown($event)',
  },
  template: `
    <a
      href="#contenido"
      class="sr-only z-50 rounded-md bg-surface px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >Saltar al contenido</a
    >
    <aside
      aria-label="Barra lateral"
      class="hidden min-h-0 flex-col border-r border-border bg-surface-sunken md:flex"
    >
      <div class="flex h-12 items-center gap-2 px-3">
        <sp-logo class="h-6" />
        <span class="text-sm font-semibold tracking-tight">SiloPro</span>
        <span class="ml-auto font-mono text-2xs text-fg-subtle">alpha</span>
      </div>
      <div class="px-2 pb-2">
        <button
          type="button"
          class="flex h-7 w-full cursor-pointer items-center gap-2 rounded-md border border-border bg-surface px-2 text-sm text-fg-subtle shadow-sm hover:border-border-strong"
          (click)="palette.toggle()"
        >
          <svg lucideSearch [size]="14"></svg>
          <span class="flex-1 text-left">Buscar…</span>
          <kbd esKbd>Ctrl K</kbd>
        </button>
      </div>
      <nav class="flex flex-col gap-0.5 px-2" aria-label="Principal">
        <ng-container *ngTemplateOutlet="navLinks" />
      </nav>
      <p class="mt-4 px-4 pb-1 text-2xs font-medium text-fg-subtle uppercase">Próximamente</p>
      <ul class="flex flex-col gap-0.5 px-2 text-fg-subtle" aria-label="Módulos en desarrollo">
        @for (m of upcoming; track m.label) {
          <li class="flex h-7 items-center gap-2 px-2 text-sm">
            @switch (m.icon) {
              @case ('moves') {
                <svg lucideArrowLeftRight [size]="16"></svg>
              }
              @case ('bom') {
                <svg lucideClipboardList [size]="16"></svg>
              }
              @default {
                <svg lucideGrid3x3 [size]="16"></svg>
              }
            }
            {{ m.label }}
            <span class="ml-auto font-mono text-2xs">{{ m.phase }}</span>
          </li>
        }
      </ul>
      <div class="mt-auto flex flex-col gap-0.5 border-t border-border p-2">
        <button
          type="button"
          class="mb-1 flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-surface-hover"
          [cdkMenuTriggerFor]="userMenu"
          aria-label="Cuenta y organización"
        >
          <span
            class="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-2xs font-semibold text-primary-fg"
            aria-hidden="true"
            >{{ initials() }}</span
          >
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium">{{ session.me()?.user?.name }}</span>
            <span class="block truncate text-2xs text-fg-muted">
              {{ session.membership()?.organizationName }} · {{ roleLabel() }}
            </span>
          </span>
        </button>
        <a
          esNavItem
          routerLink="/sistema/componentes"
          routerLinkActive="is-active"
          ariaCurrentWhenActive="page"
        >
          <svg lucideComponent></svg> Design system
        </a>
        <button
          esNavItem
          type="button"
          (click)="theme.cycle()"
          [esTooltip]="themeLabel()"
          esTooltipPosition="right"
        >
          @switch (theme.preference()) {
            @case ('light') {
              <svg lucideSun></svg>
            }
            @case ('dark') {
              <svg lucideMoon></svg>
            }
            @default {
              <svg lucideMonitor></svg>
            }
          }
          Tema: {{ themeName() }}
        </button>
      </div>
    </aside>
    <div class="flex min-h-0 min-w-0 flex-col">
      <header class="flex h-12 items-center gap-2 border-b border-border px-3 md:hidden">
        <sp-logo class="h-6" />
        <span class="font-semibold">SiloPro</span>
        <button
          esButton
          variant="ghost"
          iconOnly
          class="ml-auto"
          aria-label="Buscar"
          (click)="palette.toggle()"
        >
          <svg lucideSearch></svg>
        </button>
        <button
          esButton
          variant="ghost"
          iconOnly
          aria-label="Cuenta y organización"
          [cdkMenuTriggerFor]="userMenu"
        >
          <span class="text-2xs font-semibold">{{ initials() }}</span>
        </button>
      </header>
      <nav
        class="flex gap-0.5 overflow-x-auto border-b border-border px-2 py-1 md:hidden [&_a]:shrink-0"
        aria-label="Principal (móvil)"
      >
        <ng-container *ngTemplateOutlet="navLinks" />
      </nav>
      <main id="contenido" class="min-h-0 flex-1 overflow-auto" tabindex="-1">
        <router-outlet />
      </main>
    </div>

    <ng-template #navLinks>
      <a
        esNavItem
        routerLink="/"
        routerLinkActive="is-active"
        [routerLinkActiveOptions]="{ exact: true }"
        ariaCurrentWhenActive="page"
      >
        <svg lucideHouse></svg> Inicio
      </a>
      <a
        esNavItem
        routerLink="/inventario"
        routerLinkActive="is-active"
        ariaCurrentWhenActive="page"
      >
        <svg lucideBox></svg> Artículos
      </a>
      <a
        esNavItem
        routerLink="/categorias"
        routerLinkActive="is-active"
        ariaCurrentWhenActive="page"
      >
        <svg lucideFolderTree></svg> Categorías
      </a>
      <a
        esNavItem
        routerLink="/proveedores"
        routerLinkActive="is-active"
        ariaCurrentWhenActive="page"
      >
        <svg lucideTruck></svg> Proveedores
      </a>
      <a
        esNavItem
        routerLink="/ubicaciones"
        routerLinkActive="is-active"
        ariaCurrentWhenActive="page"
      >
        <svg lucideMapPin></svg> Ubicaciones
      </a>
      <a
        esNavItem
        routerLink="/gabinetes/demo"
        routerLinkActive="is-active"
        ariaCurrentWhenActive="page"
      >
        <svg lucideGrid3x3></svg> Gabinete (demo)
      </a>
    </ng-template>

    <ng-template #userMenu>
      <div esMenu class="min-w-56">
        <p class="px-2 pt-1 pb-0.5 text-2xs font-medium text-fg-subtle uppercase">Organización</p>
        @for (m of session.me()?.memberships ?? []; track m.organizationId) {
          <button esMenuItem (triggered)="switchOrg(m.organizationId)">
            <svg lucideBuilding2></svg>
            <span class="flex-1 truncate">{{ m.organizationName }}</span>
            @if (m.organizationId === session.orgId()) {
              <svg lucideCheck aria-label="Activa"></svg>
            }
          </button>
        }
        <div esMenuSeparator></div>
        <p class="truncate px-2 py-1 text-xs text-fg-muted">{{ session.me()?.user?.email }}</p>
        <button esMenuItem (triggered)="logout()"><svg lucideLogOut></svg> Cerrar sesión</button>
      </div>
    </ng-template>
  `,
})
export class Shell {
  protected readonly palette = inject(EsCommandPaletteService);
  protected readonly theme = inject(EsThemeService);
  private readonly router = inject(Router);

  protected readonly session = inject(SessionService);

  protected readonly upcoming = [
    { label: 'Gabinetes', icon: 'grid', phase: 'F3' },
    { label: 'Transferencias', icon: 'moves', phase: 'F5' },
    { label: 'Proyectos y BOM', icon: 'bom', phase: 'F6' },
  ];

  constructor() {
    this.palette.register([
      { id: 'nav.home', label: 'Ir a Inicio', group: 'Navegación', run: () => this.go('/') },
      {
        id: 'nav.items',
        label: 'Ir a Artículos',
        group: 'Navegación',
        keywords: ['inventario', 'existencias', 'sku'],
        run: () => this.go('/inventario'),
      },
      {
        id: 'nav.categories',
        label: 'Ir a Categorías',
        group: 'Navegación',
        keywords: ['atributos'],
        run: () => this.go('/categorias'),
      },
      {
        id: 'nav.suppliers',
        label: 'Ir a Proveedores',
        group: 'Navegación',
        run: () => this.go('/proveedores'),
      },
      {
        id: 'nav.locations',
        label: 'Ir a Ubicaciones',
        group: 'Navegación',
        keywords: ['almacen', 'estante'],
        run: () => this.go('/ubicaciones'),
      },
      {
        id: 'nav.cabinet',
        label: 'Abrir gabinete de demostración',
        group: 'Navegación',
        keywords: ['cajones', 'ubicacion', '2d'],
        run: () => this.go('/gabinetes/demo'),
      },
      {
        id: 'nav.catalog',
        label: 'Ver catálogo de componentes',
        group: 'Navegación',
        keywords: ['design system', 'ui'],
        run: () => this.go('/sistema/componentes'),
      },
      {
        id: 'theme.cycle',
        label: 'Cambiar tema (sistema / claro / oscuro)',
        group: 'Preferencias',
        keywords: ['oscuro', 'claro', 'dark'],
        run: () => this.theme.cycle(),
      },
    ]);
  }

  protected initials(): string {
    const name = this.session.me()?.user.name ?? '';
    return (
      name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]!.toUpperCase())
        .join('') || '?'
    );
  }

  protected roleLabel(): string {
    const role = this.session.role();
    return role ? ROLE_LABELS[role] : '';
  }

  protected switchOrg(id: string): void {
    this.session.selectOrg(id);
    // Recarga la vista actual con los datos de la nueva organización.
    void this.router.navigateByUrl('/');
  }

  protected async logout(): Promise<void> {
    await this.session.logout();
    await this.router.navigateByUrl('/acceso');
  }

  protected themeName(): string {
    return { system: 'sistema', light: 'claro', dark: 'oscuro' }[this.theme.preference()];
  }

  protected themeLabel(): string {
    return 'Alterna entre sistema, claro y oscuro';
  }

  protected onKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.palette.toggle();
    }
  }

  private go(url: string): void {
    void this.router.navigateByUrl(url);
  }
}
