import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { EsButton, EsEmptyState, EsSkeleton, EsTable, EsToastService } from '@elikarsystems/ui';
import { LucideShieldCheck } from '@lucide/angular';
import { type AuditEntry, type AuditPage, auditActionLabel } from '@silopro/contracts';
import { ApiRequestError, Api } from '../../core/api';
import { fmtDate } from '../../core/format';
import { SessionService } from '../../core/session';
import { PageHeader } from '../page-header';

/** Bitácora de auditoría (solo administración): quién cambió qué y cuándo. */
@Component({
  selector: 'sp-audit-log',
  imports: [PageHeader, EsButton, EsEmptyState, EsSkeleton, EsTable, LucideShieldCheck],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:p-6">
      <sp-page-header
        title="Auditoría"
        description="Cada cambio hecho en la organización, con quién lo hizo y cuándo. No se puede editar ni borrar."
      />
      @if (loading() && !rows().length) {
        <es-skeleton class="h-40 w-full" />
      } @else if (!rows().length) {
        <es-empty-state title="Sin registros" description="Aquí aparecerá cada cambio que se haga.">
          <svg esEmptyIcon lucideShieldCheck></svg>
        </es-empty-state>
      } @else {
        <div class="overflow-x-auto rounded-lg border border-border">
          <table esTable>
            <caption class="sr-only">
              Auditoría
            </caption>
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Quién</th>
                <th scope="col">Qué hizo</th>
                <th scope="col">Sobre</th>
                <th scope="col">Datos</th>
              </tr>
            </thead>
            <tbody>
              @for (e of rows(); track e.id) {
                <tr>
                  <td class="whitespace-nowrap text-fg-muted">{{ date(e.occurredAt) }}</td>
                  <td>{{ e.actorName }}</td>
                  <td>{{ label(e.action) }}</td>
                  <td>{{ e.label ?? '—' }}</td>
                  <td
                    class="max-w-80 truncate font-mono text-xs text-fg-muted"
                    [title]="details(e)"
                  >
                    {{ details(e) }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (cursor()) {
          <button esButton class="self-center" [loading]="loading()" (click)="load(false)">
            Cargar más
          </button>
        }
      }
    </div>
  `,
})
export default class AuditLog {
  private readonly api = inject(Api);
  private readonly toast = inject(EsToastService);
  private readonly session = inject(SessionService);
  protected readonly date = fmtDate;
  protected readonly label = auditActionLabel;
  protected readonly rows = signal<AuditEntry[]>([]);
  protected readonly cursor = signal<string | null>(null);
  protected readonly loading = signal(false);

  constructor() {
    effect(() => {
      this.session.orgId();
      untracked(() => void this.load(true));
    });
  }

  protected details(e: AuditEntry): string {
    return e.details ? JSON.stringify(e.details) : '';
  }

  protected async load(reset: boolean): Promise<void> {
    this.loading.set(true);
    try {
      const page = await this.api.get<AuditPage>('/audit', {
        before: reset ? undefined : (this.cursor() ?? undefined),
      });
      this.rows.update((r) => (reset ? page.entries : [...r, ...page.entries]));
      this.cursor.set(page.nextCursor);
    } catch (e) {
      this.toast.show(ApiRequestError.from(e).message, { tone: 'danger' });
    } finally {
      this.loading.set(false);
    }
  }
}
