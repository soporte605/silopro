import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  type ElementRef,
  inject,
  resource,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { EsBadge, EsButton, EsEmptyState, EsSkeleton } from '@elikarsystems/ui';
import { LucideBot, LucideSend, LucideSparkles } from '@lucide/angular';
import {
  ASSISTANT_MAX_CHARS,
  ASSISTANT_MAX_TURNS,
  type AssistantQuota,
  type AssistantReply,
  type AssistantStatus,
  type LocateHit,
} from '@silopro/contracts';
import { Api, ApiRequestError } from '../../core/api';
import { fmtQty } from '../../core/format';
import { SessionService } from '../../core/session';
import { PageHeader } from '../page-header';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  /** Artículos que localizó el asistente en esta respuesta. */
  hits?: LocateHit[];
}

const EXAMPLES = [
  '¿Dónde están los ESP32?',
  '¿Qué tengo que comprar?',
  '¿Qué le falta al proyecto más próximo?',
  '¿Quién sacó resistencias esta semana?',
];

/**
 * Asistente con IA: preguntas escritas sobre el inventario. La conversación
 * vive solo en esta pantalla; cada pregunta envía el historial (texto) a la
 * API, que consulta con herramientas de solo lectura y devuelve los cajones
 * para abrirlos en 3D.
 */
@Component({
  selector: 'sp-assistant',
  imports: [
    PageHeader,
    RouterLink,
    EsBadge,
    EsButton,
    EsEmptyState,
    EsSkeleton,
    LucideBot,
    LucideSend,
    LucideSparkles,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="mx-auto flex max-w-3xl flex-col gap-4 p-4 md:p-6">
      <sp-page-header
        title="Asistente"
        description="Pregunte por su inventario en sus propias palabras."
      >
        @if (turns().length) {
          <button esButton spActions variant="ghost" size="sm" (click)="reset()">
            Nueva conversación
          </button>
        }
      </sp-page-header>

      @if (status.isLoading() && !status.hasValue()) {
        <es-skeleton class="h-32 w-full" />
      } @else if (status.value()?.enabled === false) {
        <es-empty-state
          title="El asistente no está activado"
          description="El administrador del servidor debe configurar la clave de la IA. Mientras tanto, use «¿Dónde está?» para buscar en qué cajón está cada artículo."
        >
          <svg esEmptyIcon lucideBot></svg>
          <a esButton esEmptyActions routerLink="/donde">Ir a ¿Dónde está?</a>
        </es-empty-state>
      } @else {
        @if (!turns().length) {
          <div class="rounded-lg border border-border bg-surface p-4">
            <p class="flex items-center gap-2 font-medium">
              <svg lucideSparkles [size]="16" class="text-accent"></svg> ¿En qué le ayudo?
            </p>
            <p class="mt-1 text-sm text-fg-muted">
              Consulta existencias, ubicaciones, compras, proyectos y movimientos. Solo lee: no
              registra cambios.
            </p>
            <div class="mt-3 flex flex-wrap gap-2">
              @for (e of examples; track e) {
                <button esButton size="sm" variant="secondary" (click)="send(e)">{{ e }}</button>
              }
            </div>
          </div>
        }

        <ol class="flex flex-col gap-3" aria-label="Conversación" aria-live="polite">
          @for (t of turns(); track $index) {
            @if (t.role === 'user') {
              <li
                class="ml-auto max-w-[85%] rounded-lg bg-accent px-3 py-2 whitespace-pre-line text-accent-fg"
              >
                {{ t.content }}
              </li>
            } @else {
              <li class="max-w-[95%] rounded-lg border border-border bg-surface">
                <p class="px-3 py-2 whitespace-pre-line">{{ t.content }}</p>
                @if (t.hits?.length) {
                  <ul class="divide-y divide-border border-t border-border" aria-label="Lugares">
                    @for (h of t.hits; track h.itemId) {
                      @for (p of h.places.slice(0, 3); track p.locationId) {
                        <li class="flex items-center gap-3 px-3 py-2">
                          <div class="min-w-0 flex-1">
                            <p class="truncate text-sm font-medium">{{ h.name }}</p>
                            <p class="truncate text-xs text-fg-muted">
                              <span class="font-mono">{{ p.path }}</span> · {{ qty(p.onHand) }}
                              {{ h.unitSymbol }}
                            </p>
                          </div>
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
                    }
                  </ul>
                }
              </li>
            }
          }
          @if (busy()) {
            <li class="flex items-center gap-2 text-sm text-fg-muted" role="status">
              <svg lucideBot [size]="16" class="animate-pulse"></svg> Consultando el almacén…
            </li>
          }
        </ol>

        @if (error(); as e) {
          <p class="rounded-md bg-danger-soft px-3 py-2 text-sm" role="alert">{{ e }}</p>
        }

        <form class="flex flex-col gap-2" (submit)="$event.preventDefault(); send(draft())">
          <label for="asistente-q" class="sr-only">Pregunta</label>
          <div
            class="flex items-end gap-2 rounded-lg border border-border-strong bg-surface p-2 shadow-sm focus-within:ring-2 focus-within:ring-accent"
          >
            <textarea
              #box
              id="asistente-q"
              rows="2"
              class="max-h-40 min-h-10 min-w-0 flex-1 resize-y bg-transparent px-1 outline-none placeholder:text-fg-subtle"
              placeholder="Escriba su pregunta…"
              [attr.maxlength]="maxChars"
              [value]="draft()"
              [disabled]="full()"
              (input)="draft.set($any($event.target).value)"
              (keydown.enter)="onEnter($any($event))"
            ></textarea>
            <button
              esButton
              type="submit"
              variant="primary"
              iconOnly
              aria-label="Enviar"
              [disabled]="busy() || !draft().trim() || full()"
            >
              <svg lucideSend></svg>
            </button>
          </div>
          <p class="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-muted">
            <span>Enter envía · Shift+Enter nueva línea. Revise los datos importantes.</span>
            @if (quota(); as q) {
              @if (q.limit === null) {
                <span>{{ q.used }} preguntas este mes</span>
              } @else {
                <es-badge [tone]="q.used >= q.limit ? 'danger' : 'neutral'"
                  >{{ q.used }} de {{ q.limit }} preguntas este mes</es-badge
                >
              }
            }
          </p>
          @if (full()) {
            <p class="text-sm text-fg-muted">
              La conversación llegó a su límite. Pulse «Nueva conversación» para seguir.
            </p>
          }
        </form>
      }
    </div>
  `,
})
export default class Assistant {
  private readonly api = inject(Api);
  private readonly session = inject(SessionService);
  protected readonly qty = fmtQty;
  protected readonly examples = EXAMPLES;
  protected readonly maxChars = ASSISTANT_MAX_CHARS;

  private readonly box = viewChild<ElementRef<HTMLTextAreaElement>>('box');
  protected readonly turns = signal<Turn[]>([]);
  protected readonly draft = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly latestQuota = signal<AssistantQuota | null>(null);

  protected readonly status = resource({
    params: () => ({ org: this.session.orgId() }),
    loader: () => this.api.get<AssistantStatus>('/assistant'),
  });
  protected readonly quota = computed(
    () => this.latestQuota() ?? this.status.value()?.quota ?? null,
  );
  /** Cabe otra pregunta con su respuesta en el historial que acepta la API. */
  protected readonly full = computed(() => this.turns().length + 1 > ASSISTANT_MAX_TURNS);

  constructor() {
    effect(() => this.box()?.nativeElement.focus());
    // Otra organización: otra conversación.
    effect(() => {
      this.session.orgId();
      this.reset();
    });
  }

  protected onEnter(e: KeyboardEvent): void {
    if (e.shiftKey || e.isComposing) return;
    e.preventDefault();
    void this.send(this.draft());
  }

  protected reset(): void {
    this.turns.set([]);
    this.draft.set('');
    this.error.set(null);
  }

  protected async send(text: string): Promise<void> {
    const content = text.trim().slice(0, ASSISTANT_MAX_CHARS);
    if (!content || this.busy() || this.full()) return;
    const history = [...this.turns(), { role: 'user' as const, content }];
    this.turns.set(history);
    this.draft.set('');
    this.error.set(null);
    this.busy.set(true);
    try {
      const reply = await this.api.post<AssistantReply>('/assistant/chat', {
        messages: history.map(({ role, content }) => ({ role, content })),
      });
      this.turns.update((t) => [
        ...t,
        { role: 'assistant', content: reply.answer, hits: reply.hits },
      ]);
      this.latestQuota.set(reply.quota);
    } catch (e) {
      // La pregunta vuelve al campo para reintentar sin reescribirla.
      this.turns.set(history.slice(0, -1));
      this.draft.set(content);
      this.error.set(ApiRequestError.from(e).message);
    } finally {
      this.busy.set(false);
      this.box()?.nativeElement.focus();
    }
  }
}
