import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Logo } from './logo';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {
  EsButton,
  EsCommandPaletteService,
  EsKbd,
  EsNavItem,
  EsThemeService,
  EsTooltip,
} from '@elikarsystems/ui';
import {
  LucideArrowLeftRight,
  LucideClipboardList,
  LucideComponent,
  LucideGrid3x3,
  LucideHouse,
  LucideMapPin,
  LucideMonitor,
  LucideMoon,
  LucidePackage,
  LucideSearch,
  LucideSun,
} from '@lucide/angular';

@Component({
  selector: 'sp-shell',
  imports: [
    RouterOutlet,
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
    LucidePackage,
    LucideMapPin,
    LucideArrowLeftRight,
    LucideClipboardList,
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
          routerLink="/gabinetes/demo"
          routerLinkActive="is-active"
          ariaCurrentWhenActive="page"
        >
          <svg lucideGrid3x3></svg> Gabinete (demo)
        </a>
      </nav>
      <p class="mt-4 px-4 pb-1 text-2xs font-medium text-fg-subtle uppercase">Próximamente</p>
      <ul class="flex flex-col gap-0.5 px-2 text-fg-subtle" aria-label="Módulos en desarrollo">
        @for (m of upcoming; track m.label) {
          <li class="flex h-7 items-center gap-2 px-2 text-sm">
            @switch (m.icon) {
              @case ('package') {
                <svg lucidePackage [size]="16"></svg>
              }
              @case ('map') {
                <svg lucideMapPin [size]="16"></svg>
              }
              @case ('moves') {
                <svg lucideArrowLeftRight [size]="16"></svg>
              }
              @case ('bom') {
                <svg lucideClipboardList [size]="16"></svg>
              }
            }
            {{ m.label }}
            <span class="ml-auto font-mono text-2xs">{{ m.phase }}</span>
          </li>
        }
      </ul>
      <div class="mt-auto flex flex-col gap-0.5 border-t border-border p-2">
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
      </header>
      <main id="contenido" class="min-h-0 flex-1 overflow-auto" tabindex="-1">
        <router-outlet />
      </main>
    </div>
  `,
})
export class Shell {
  protected readonly palette = inject(EsCommandPaletteService);
  protected readonly theme = inject(EsThemeService);
  private readonly router = inject(Router);

  protected readonly upcoming = [
    { label: 'Inventario', icon: 'package', phase: 'F2' },
    { label: 'Ubicaciones', icon: 'map', phase: 'F3' },
    { label: 'Movimientos', icon: 'moves', phase: 'F5' },
    { label: 'Proyectos y BOM', icon: 'bom', phase: 'F6' },
  ];

  constructor() {
    this.palette.register([
      { id: 'nav.home', label: 'Ir a Inicio', group: 'Navegación', run: () => this.go('/') },
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
