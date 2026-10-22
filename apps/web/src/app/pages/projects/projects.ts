import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  EsBadge,
  EsButton,
  EsDialogService,
  EsEmptyState,
  EsSkeleton,
  EsTable,
} from '@elikarsystems/ui';
import { LucideClipboardList, LucidePlus } from '@lucide/angular';
import {
  PROJECT_STATUS_LABELS,
  type ProjectDetail,
  type ProjectStatus,
  type ProjectSummary,
} from '@silopro/contracts';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { SessionService } from '../../core/session';
import { PageHeader } from '../page-header';
import { ProjectDialog } from './project-dialog';
import { statusTone } from './project-status';

type Filter = 'open' | ProjectStatus | 'all';

/** Proyectos con su lista de materiales y cuánto les falta. */
@Component({
  selector: 'sp-projects',
  imports: [
    RouterLink,
    EsBadge,
    EsButton,
    EsEmptyState,
    EsSkeleton,
    EsTable,
    LucideClipboardList,
    LucidePlus,
    PageHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:p-6">
      <sp-page-header
        title="Proyectos"
        description="Lo que va a construir o entregar, con su lista de materiales: cuánto necesita, cuánto tiene apartado y qué le falta."
      >
        @if (session.canMove()) {
          <button spActions esButton variant="primary" (click)="create()">
            <svg lucidePlus></svg> Nuevo proyecto
          </button>
        }
      </sp-page-header>

      <div class="flex flex-wrap items-center gap-2" role="group" aria-label="Mostrar">
        @for (f of filters; track f.value) {
          <button
            esButton
            size="sm"
            [variant]="filter() === f.value ? 'secondary' : 'ghost'"
            [attr.aria-pressed]="filter() === f.value"
            (click)="filter.set(f.value)"
          >
            {{ f.label }}
          </button>
        }
      </div>

      @if (list.isLoading() && !list.hasValue()) {
        <es-skeleton class="h-40 w-full" />
      } @else if (!shown().length) {
        <es-empty-state
          title="Sin proyectos"
          description="Cree un proyecto, agregue los materiales que necesita y aparte lo que haya en el almacén con un clic."
        >
          <svg esEmptyIcon lucideClipboardList></svg>
        </es-empty-state>
      } @else {
        <div class="overflow-x-auto rounded-lg border border-border">
          <table esTable>
            <caption class="sr-only">
              Proyectos
            </caption>
            <thead>
              <tr>
                <th scope="col">Proyecto</th>
                <th scope="col">Estado</th>
                <th scope="col">Entrega</th>
                <th scope="col">Materiales</th>
              </tr>
            </thead>
            <tbody>
              @for (p of shown(); track p.id) {
                <tr>
                  <td>
                    <a class="hover:underline" [routerLink]="['/proyectos', p.id]">
                      <span class="block font-medium">{{ p.name }}</span>
                      <span class="code text-fg-muted">{{ p.code }}</span>
                    </a>
                  </td>
                  <td>
                    <es-badge [tone]="tone(p.status)">{{ labels[p.status] }}</es-badge>
                  </td>
                  <td class="whitespace-nowrap">{{ p.dueDate ? due(p.dueDate) : '—' }}</td>
                  <td>
                    @if (!p.lineCount) {
                      <span class="text-fg-muted">Sin materiales</span>
                    } @else {
                      <span class="mr-2">{{ p.coveredCount }} de {{ p.lineCount }} cubiertos</span>
                      @if (p.shortageCount) {
                        <es-badge tone="warning">{{
                          p.shortageCount === 1 ? 'Falta 1' : 'Faltan ' + p.shortageCount
                        }}</es-badge>
                      }
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export default class Projects {
  private readonly api = inject(Api);
  private readonly dialog = inject(EsDialogService);
  private readonly router = inject(Router);
  protected readonly session = inject(SessionService);
  protected readonly labels = PROJECT_STATUS_LABELS;
  protected readonly tone = statusTone;

  protected readonly filters: { value: Filter; label: string }[] = [
    { value: 'open', label: 'Abiertos' },
    { value: 'done', label: 'Terminados' },
    { value: 'cancelled', label: 'Cancelados' },
    { value: 'all', label: 'Todos' },
  ];
  protected readonly filter = signal<Filter>('open');

  protected readonly list = resource({
    params: () => ({ org: this.session.orgId() }),
    loader: () => this.api.get<ProjectSummary[]>('/projects'),
  });
  protected readonly shown = computed(() => {
    const f = this.filter();
    const all = this.list.value() ?? [];
    if (f === 'all') return all;
    if (f === 'open') return all.filter((p) => p.status === 'draft' || p.status === 'active');
    return all.filter((p) => p.status === f);
  });

  protected due(d: string): string {
    return new Date(`${d}T12:00:00`).toLocaleDateString('es', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  protected async create(): Promise<void> {
    const saved = await firstValueFrom(
      this.dialog.open<ProjectDetail, null>(ProjectDialog, {
        data: null,
        ariaLabel: 'Nuevo proyecto',
      }).closed,
    );
    if (saved) void this.router.navigate(['/proyectos', saved.id]);
  }
}
