import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  type ElementRef,
  inject,
  input,
  resource,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { EsBadge, EsButton, EsEmptyState, EsSkeleton } from '@elikarsystems/ui';
import {
  LucideBox,
  LucideMaximize,
  LucideMinimize,
  LucidePackageSearch,
  LucideSearch,
} from '@lucide/angular';
import type { LocateHit, LocatePlace, LocateResult } from '@silopro/contracts';
import { Api } from '../../core/api';
import { fmtQty } from '../../core/format';
import { SessionService } from '../../core/session';
import { PageHeader } from '../page-header';

/** Espera tras la última tecla antes de buscar. */
const DEBOUNCE_MS = 250;

/**
 * «¿Dónde está?»: se escribe un artículo, SKU o alias y responde en qué
 * cajones hay existencias, con un botón que lleva a la vista 3D del anaquel
 * con la caja resaltada. Con pantalla completa sirve de kiosco en el almacén.
 */
@Component({
  selector: 'sp-locate',
  imports: [
    PageHeader,
    RouterLink,
    EsBadge,
    EsButton,
    EsEmptyState,
    EsSkeleton,
    LucideBox,
    LucideMaximize,
    LucideMinimize,
    LucidePackageSearch,
    LucideSearch,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="mx-auto flex max-w-3xl flex-col gap-4 p-4 md:p-6">
      <sp-page-header
        title="¿Dónde está?"
        description="Escriba un artículo, SKU o como le dicen; le mostramos el cajón."
      >
        @if (canFullscreen) {
          <button esButton spActions variant="ghost" size="sm" (click)="toggleFullscreen()">
            @if (fullscreen()) {
              <svg lucideMinimize></svg> Salir de pantalla completa
            } @else {
              <svg lucideMaximize></svg> Pantalla completa
            }
          </button>
        }
      </sp-page-header>

      <form role="search" (submit)="$event.preventDefault(); goFirst()">
        <label for="donde-q" class="sr-only">Artículo, SKU o alias</label>
        <div
          class="flex h-14 items-center gap-3 rounded-lg border border-border-strong bg-surface px-4 shadow-sm focus-within:ring-2 focus-within:ring-accent"
        >
          <svg lucideSearch [size]="22" class="shrink-0 text-fg-subtle"></svg>
          <input
            #box
            id="donde-q"
            type="search"
            autocomplete="off"
            enterkeyhint="search"
            class="h-full min-w-0 flex-1 bg-transparent text-lg outline-none placeholder:text-fg-subtle"
            placeholder="p. ej. ESP32, tornillo M3, placa wifi"
            [value]="text()"
            (input)="type($any($event.target).value)"
          />
        </div>
      </form>

      @if (!term()) {
        <es-empty-state
          title="Busque cualquier artículo"
          description="Tolera acentos, guiones y espacios: «esp 32» encuentra «ESP32-WROOM». Pulse / desde cualquier pantalla para volver aquí."
        >
          <svg esEmptyIcon lucidePackageSearch></svg>
        </es-empty-state>
      } @else if (result.isLoading() && !result.hasValue()) {
        <es-skeleton class="h-32 w-full" />
      } @else if (result.error()) {
        <p class="rounded-md bg-danger-soft px-3 py-2 text-sm" role="alert">
          No se pudo buscar. Revise la conexión e intente de nuevo.
        </p>
      } @else if (result.value(); as r) {
        <p class="text-sm text-fg-muted" role="status" aria-live="polite">
          {{ summary(r) }}
        </p>
        @if (!r.hits.length) {
          <es-empty-state
            title="No encontramos «{{ r.query }}»"
            description="Pruebe con el SKU, el fabricante o agregue un alias en la ficha del artículo."
          >
            <svg esEmptyIcon lucideBox></svg>
          </es-empty-state>
        }
        <ul class="flex flex-col gap-3" aria-label="Resultados">
          @for (h of r.hits; track h.itemId) {
            <li class="overflow-hidden rounded-lg border border-border bg-surface">
              <div class="flex items-start justify-between gap-3 px-4 py-3">
                <div class="min-w-0">
                  <a
                    class="block truncate font-semibold hover:underline"
                    [routerLink]="['/inventario', h.itemId]"
                    >{{ h.name }}</a
                  >
                  <p class="truncate text-xs text-fg-muted">
                    <span class="code">{{ h.sku }}</span>
                    @if (h.manufacturer || h.model) {
                      · {{ h.manufacturer }} {{ h.model }}
                    }
                    @if (h.matchedAlias) {
                      · le dicen «{{ h.matchedAlias }}»
                    }
                  </p>
                </div>
                <span class="shrink-0 text-right text-sm tabular-nums">
                  {{ qty(h.onHand) }} {{ h.unitSymbol }}
                </span>
              </div>
              @if (h.places.length) {
                <ul class="divide-y divide-border border-t border-border" aria-label="Dónde hay">
                  @for (p of h.places; track p.locationId) {
                    <li class="flex items-center gap-3 px-4 py-2.5">
                      <div class="min-w-0 flex-1">
                        <p class="font-mono text-lg leading-tight font-semibold">
                          @if (p.cabinetCode) {
                            {{ p.cabinetCode }} · {{ p.code }}
                          } @else {
                            {{ p.code }}
                          }
                        </p>
                        <p class="truncate text-xs text-fg-muted">{{ p.path }}</p>
                      </div>
                      <span class="shrink-0 text-sm tabular-nums">
                        {{ qty(p.onHand) }} {{ h.unitSymbol }}
                      </span>
                      @if (p.shelfId) {
                        <a
                          esButton
                          size="sm"
                          variant="primary"
                          [routerLink]="['/gabinetes/estante', p.shelfId]"
                          [queryParams]="{ resaltar: p.locationId, buscar: h.sku }"
                          >Ver en 3D</a
                        >
                      } @else {
                        <a esButton size="sm" [routerLink]="['/ubicaciones', p.locationId]"
                          >Ver ubicación</a
                        >
                      }
                    </li>
                  }
                </ul>
              } @else {
                <p class="border-t border-border px-4 py-2.5 text-sm text-fg-muted">
                  <es-badge tone="warning">Sin existencias</es-badge>
                  No hay piezas registradas en ningún lugar.
                </p>
              }
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export default class Locate {
  private readonly api = inject(Api);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  protected readonly qty = fmtQty;

  /** Búsqueda inicial desde el enlace: `/donde?q=esp32`. */
  readonly q = input<string>();

  private readonly box = viewChild<ElementRef<HTMLInputElement>>('box');
  /** Lo que hay escrito en el campo. */
  protected readonly text = signal('');
  /** Lo que se busca (el texto, tras una pausa al escribir). */
  protected readonly term = signal('');
  protected readonly fullscreen = signal(false);
  protected readonly canFullscreen = typeof document !== 'undefined' && document.fullscreenEnabled;
  private timer: ReturnType<typeof setTimeout> | undefined;

  protected readonly result = resource({
    params: () => ({ q: this.term(), org: this.session.orgId() }),
    loader: ({ params }) =>
      params.q ? this.api.get<LocateResult>('/locate', { q: params.q }) : Promise.resolve(null),
  });

  constructor() {
    effect(() => {
      const q = (this.q() ?? '').trim().slice(0, 100);
      untracked(() => {
        if (q === this.term()) return;
        this.text.set(q);
        this.term.set(q);
      });
    });
    // El cursor queda en el campo: se puede escribir en cuanto se abre.
    effect(() => this.box()?.nativeElement.focus());
    const onFullscreen = () => this.fullscreen.set(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFullscreen);
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.timer);
      document.removeEventListener('fullscreenchange', onFullscreen);
    });
  }

  protected type(value: string): void {
    this.text.set(value);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      const q = value.trim().slice(0, 100);
      this.term.set(q);
      // La búsqueda queda en el enlace (atrás/adelante y compartir).
      void this.router.navigate([], {
        queryParams: { q: q || null },
        replaceUrl: true,
      });
    }, DEBOUNCE_MS);
  }

  protected summary(r: LocateResult): string {
    const n = r.hits.length;
    if (!n) return 'Sin coincidencias.';
    const places = r.hits.reduce((sum, h) => sum + h.places.length, 0);
    return `${n} ${n === 1 ? 'artículo' : 'artículos'} en ${places} ${places === 1 ? 'lugar' : 'lugares'}.`;
  }

  /** Enter: lleva directo al primer lugar del primer resultado. */
  protected goFirst(): void {
    clearTimeout(this.timer);
    const q = this.text().trim();
    const hits = this.result.value()?.hits;
    if (q !== this.term() || !hits) {
      this.term.set(q);
      return;
    }
    const hit = hits.find((h) => h.places.length);
    const place = hit?.places[0];
    if (hit && place) void this.router.navigateByUrl(this.placeUrl(hit, place));
  }

  private placeUrl(hit: LocateHit, p: LocatePlace): string {
    if (!p.shelfId) return `/ubicaciones/${p.locationId}`;
    const qs = new URLSearchParams({ resaltar: p.locationId, buscar: hit.sku });
    return `/gabinetes/estante/${p.shelfId}?${qs}`;
  }

  protected async toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      /* El navegador lo rechazó (p. ej. sin gesto del usuario): no pasa nada. */
    }
  }
}
