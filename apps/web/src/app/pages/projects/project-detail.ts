import { ChangeDetectionStrategy, Component, inject, input, resource, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  EsBadge,
  EsBreadcrumb,
  EsButton,
  EsDialogService,
  EsEmptyState,
  EsSkeleton,
  EsTable,
  EsToastService,
} from '@elikarsystems/ui';
import { LucideClipboardList, LucidePencil, LucidePlus, LucideTrash2 } from '@lucide/angular';
import {
  type BomLineStatus,
  type Item,
  PROJECT_STATUS_LABELS,
  type ProjectDetail as Detail,
  type Reservation,
  type ReserveAllResult,
} from '@silopro/contracts';
import { firstValueFrom } from 'rxjs';
import { ApiRequestError, Api } from '../../core/api';
import { ConfirmService } from '../../core/confirm';
import { fmtDate, fmtQty } from '../../core/format';
import { SessionService } from '../../core/session';
import { ItemPicker } from '../locations/item-picker';
import { PageHeader } from '../page-header';
import { ConsumeDialog } from '../reservations/consume-dialog';
import { BomLineDialog, type BomLineDialogData } from './bom-line-dialog';
import { ProjectDialog } from './project-dialog';
import { statusTone } from './project-status';

/** Un proyecto: lista de materiales con lo que falta y dónde está, y sus reservas. */
@Component({
  selector: 'sp-project-detail',
  imports: [
    RouterLink,
    EsBadge,
    EsBreadcrumb,
    EsButton,
    EsEmptyState,
    EsSkeleton,
    EsTable,
    LucideClipboardList,
    LucidePencil,
    LucidePlus,
    LucideTrash2,
    PageHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-7xl flex-col gap-4 p-4 md:p-6">
      @if (project.isLoading() && !project.hasValue()) {
        <es-skeleton class="h-10 w-72" />
        <es-skeleton class="h-48 w-full" />
      } @else if (project.error()) {
        <es-empty-state
          title="Proyecto no encontrado"
          description="Puede que no exista o sea de otra organización."
        >
          <a esButton routerLink="/proyectos">Volver a Proyectos</a>
        </es-empty-state>
      } @else if (project.value(); as p) {
        <sp-page-header [title]="p.name" [description]="subtitle(p)">
          <es-breadcrumb
            spBefore
            class="mb-1"
            [items]="[{ label: 'Proyectos', link: '/proyectos' }, { label: p.code }]"
          />
          <ng-container spActions>
            @if (session.canMove()) {
              <button esButton (click)="edit(p)"><svg lucidePencil></svg> Editar</button>
              @if (open(p)) {
                <button esButton (click)="addLine(p)">
                  <svg lucidePlus></svg> Agregar material
                </button>
                <button
                  esButton
                  variant="primary"
                  [disabled]="!canReserve(p)"
                  [loading]="busy()"
                  (click)="reserveAll(p)"
                >
                  Reservar lo disponible
                </button>
              }
            }
          </ng-container>
        </sp-page-header>

        <dl
          class="grid grid-cols-3 divide-x divide-border rounded-lg border border-border bg-surface text-sm"
        >
          <div class="px-3 py-2.5">
            <dt class="text-xs text-fg-muted">Estado</dt>
            <dd class="mt-1">
              <es-badge [tone]="tone(p.status)">{{ labels[p.status] }}</es-badge>
            </dd>
          </div>
          <div class="px-3 py-2.5">
            <dt class="text-xs text-fg-muted">Materiales cubiertos</dt>
            <dd class="mt-1 tabular-nums">{{ p.coveredCount }} de {{ p.lineCount }}</dd>
          </div>
          <div class="px-3 py-2.5">
            <dt class="text-xs text-fg-muted">Con faltante</dt>
            <dd class="mt-1 tabular-nums" [class.text-warning]="p.shortageCount > 0">
              {{ p.shortageCount }}
            </dd>
          </div>
        </dl>

        <section aria-labelledby="bom" class="flex flex-col gap-2">
          <h2 id="bom" class="text-sm font-semibold">Lista de materiales</h2>
          @if (!p.lines.length) {
            <es-empty-state
              title="Sin materiales"
              description="Agregue los artículos que necesita el proyecto y la cantidad de cada uno."
            >
              <svg esEmptyIcon lucideClipboardList></svg>
            </es-empty-state>
          } @else {
            <div class="overflow-x-auto rounded-lg border border-border">
              <table esTable>
                <caption class="sr-only">
                  Lista de materiales
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Artículo</th>
                    <th scope="col" class="num">Necesario</th>
                    <th scope="col" class="num">Consumido</th>
                    <th scope="col" class="num">Reservado</th>
                    <th scope="col" class="num">Disponible</th>
                    <th scope="col" class="num">Faltante</th>
                    <th scope="col">Dónde está</th>
                    <th scope="col"><span class="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (l of p.lines; track l.id) {
                    <tr [attr.data-sku]="l.sku">
                      <td>
                        <a class="hover:underline" [routerLink]="['/inventario', l.itemId]">
                          <span class="block font-medium">{{ l.itemName }}</span>
                          <span class="code text-fg-muted">{{ l.sku }}</span>
                        </a>
                        @if (l.notes) {
                          <span class="block text-xs text-fg-muted">{{ l.notes }}</span>
                        }
                      </td>
                      <td class="num whitespace-nowrap">
                        {{ qty(l.required) }} {{ l.unitSymbol }}
                      </td>
                      <td class="num">{{ qty(l.consumed) }}</td>
                      <td class="num">{{ qty(l.reserved) }}</td>
                      <td class="num">{{ qty(l.available) }}</td>
                      <td class="num">
                        @if (l.shortage > 0) {
                          <es-badge tone="warning">{{ qty(l.shortage) }}</es-badge>
                        } @else if (l.pending === 0) {
                          <es-badge tone="success">Cubierto</es-badge>
                        } @else {
                          <span class="text-fg-muted" title="Hay en almacén; falta apartarlo"
                            >0</span
                          >
                        }
                      </td>
                      <td>
                        @for (s of l.sources.slice(0, 3); track s.locationId) {
                          <span class="block whitespace-nowrap text-xs">
                            @if (s.cabinetId) {
                              <a
                                class="hover:underline"
                                [routerLink]="['/gabinetes', s.cabinetId]"
                                [queryParams]="{ resaltar: s.locationId }"
                                >{{ s.locationPath }}</a
                              >
                            } @else {
                              <a
                                class="hover:underline"
                                [routerLink]="['/ubicaciones', s.locationId]"
                                >{{ s.locationPath }}</a
                              >
                            }
                            <span class="text-fg-muted"> · {{ qty(s.available) }}</span>
                          </span>
                        } @empty {
                          <span class="text-xs text-fg-muted">Sin existencias libres</span>
                        }
                        @if (l.sources.length > 3) {
                          <span class="text-xs text-fg-muted"
                            >y {{ l.sources.length - 3 }} más</span
                          >
                        }
                      </td>
                      <td class="text-right whitespace-nowrap">
                        @if (session.canMove() && open(p)) {
                          <button
                            esButton
                            size="sm"
                            variant="ghost"
                            iconOnly
                            [attr.aria-label]="'Editar ' + l.sku"
                            (click)="editLine(p, l)"
                          >
                            <svg lucidePencil></svg>
                          </button>
                          <button
                            esButton
                            size="sm"
                            variant="ghost"
                            iconOnly
                            [attr.aria-label]="'Quitar ' + l.sku"
                            (click)="removeLine(p, l)"
                          >
                            <svg lucideTrash2></svg>
                          </button>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>

        @if (p.reservations.length) {
          <section aria-labelledby="res" class="flex flex-col gap-2">
            <div class="flex items-center justify-between gap-2">
              <h2 id="res" class="text-sm font-semibold">Reservas del proyecto</h2>
              @if (session.canMove() && activeCount(p)) {
                <button esButton size="sm" variant="ghost" (click)="releaseAll(p)">
                  Liberar todo lo apartado
                </button>
              }
            </div>
            <div class="overflow-x-auto rounded-lg border border-border">
              <table esTable>
                <caption class="sr-only">
                  Reservas del proyecto
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Artículo</th>
                    <th scope="col">Ubicación</th>
                    <th scope="col" class="num">Apartado</th>
                    <th scope="col">Fecha</th>
                    <th scope="col"><span class="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody>
                  @for (r of p.reservations; track r.id) {
                    <tr>
                      <td>
                        <span class="block">{{ r.itemName }}</span>
                        <span class="code text-fg-muted">{{ r.sku }}</span>
                      </td>
                      <td>{{ r.locationPath }}</td>
                      <td class="num whitespace-nowrap">
                        @if (r.status === 'active') {
                          {{ qty(r.remaining) }} de {{ qty(r.quantity) }} {{ r.unitSymbol }}
                        } @else {
                          {{ qty(r.consumed) }} de {{ qty(r.quantity) }} usados
                        }
                      </td>
                      <td class="text-xs whitespace-nowrap text-fg-muted">
                        {{ date(r.createdAt) }}
                      </td>
                      <td class="text-right whitespace-nowrap">
                        @if (r.status === 'active' && session.canMove()) {
                          <button esButton size="sm" (click)="consume(r)">Consumir</button>
                        } @else {
                          <es-badge>{{
                            r.status === 'consumed' ? 'Consumida' : 'Liberada'
                          }}</es-badge>
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        }
      }
    </div>
  `,
})
export default class ProjectDetail {
  private readonly api = inject(Api);
  private readonly dialog = inject(EsDialogService);
  private readonly toast = inject(EsToastService);
  private readonly confirm = inject(ConfirmService);
  protected readonly session = inject(SessionService);
  protected readonly qty = fmtQty;
  protected readonly date = fmtDate;
  protected readonly labels = PROJECT_STATUS_LABELS;
  protected readonly tone = statusTone;

  readonly id = input.required<string>();
  protected readonly busy = signal(false);

  protected readonly project = resource({
    params: () => ({ id: this.id(), org: this.session.orgId() }),
    loader: ({ params }) => this.api.get<Detail>(`/projects/${params.id}`),
  });

  protected open(p: Detail): boolean {
    return p.status === 'draft' || p.status === 'active';
  }

  /** Hay algo pendiente que se puede apartar ahora mismo. */
  protected canReserve(p: Detail): boolean {
    return p.lines.some((l) => l.pending > 0 && l.available > 0);
  }

  protected activeCount(p: Detail): number {
    return p.reservations.filter((r) => r.status === 'active').length;
  }

  protected subtitle(p: Detail): string {
    const parts = [p.code];
    if (p.dueDate) {
      parts.push(
        `Entrega ${new Date(`${p.dueDate}T12:00:00`).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' })}`,
      );
    }
    if (p.description) parts.push(p.description);
    return parts.join(' · ');
  }

  private set(p: Detail | undefined): void {
    if (p) this.project.set(p);
  }

  protected async edit(p: Detail): Promise<void> {
    this.set(
      await firstValueFrom(
        this.dialog.open<Detail, Detail>(ProjectDialog, { data: p, ariaLabel: 'Editar proyecto' })
          .closed,
      ),
    );
  }

  protected async addLine(p: Detail): Promise<void> {
    const item = await firstValueFrom(
      this.dialog.open<Item, string>(ItemPicker, {
        data: `Material para ${p.code}`,
        ariaLabel: 'Elegir artículo',
      }).closed,
    );
    if (!item) return;
    this.set(
      await firstValueFrom(
        this.dialog.open<Detail, BomLineDialogData>(BomLineDialog, {
          data: { projectId: p.id, item },
          ariaLabel: 'Agregar material',
        }).closed,
      ),
    );
  }

  protected async editLine(p: Detail, line: BomLineStatus): Promise<void> {
    this.set(
      await firstValueFrom(
        this.dialog.open<Detail, BomLineDialogData>(BomLineDialog, {
          data: { projectId: p.id, line },
          ariaLabel: 'Editar material',
        }).closed,
      ),
    );
  }

  protected async removeLine(p: Detail, line: BomLineStatus): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Quitar material',
      message: `${line.itemName} sale de la lista de materiales. Lo que ya esté apartado sigue reservado hasta que lo libere.`,
      confirmLabel: 'Quitar',
    });
    if (!ok) return;
    try {
      await this.api.delete(`/projects/${p.id}/lines/${line.id}`);
      this.project.reload();
    } catch (e) {
      this.toast.show(ApiRequestError.from(e).message, { tone: 'danger' });
    }
  }

  protected async reserveAll(p: Detail): Promise<void> {
    this.busy.set(true);
    try {
      const r = await this.api.post<ReserveAllResult>(`/projects/${p.id}/reserve-all`, {});
      this.project.set(r.project);
      const missing = r.project.shortageCount;
      this.toast.show(
        r.created
          ? `${r.created === 1 ? '1 reserva creada' : `${r.created} reservas creadas`}${missing ? `; ${missing === 1 ? 'falta 1 material' : `faltan ${missing} materiales`}` : ''}`
          : 'No había nada libre para apartar',
        { tone: r.created ? 'success' : 'warning' },
      );
    } catch (e) {
      this.toast.show(ApiRequestError.from(e).message, { tone: 'danger' });
    } finally {
      this.busy.set(false);
    }
  }

  protected async releaseAll(p: Detail): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Liberar lo apartado',
      message: `Las ${this.activeCount(p)} reservas activas de ${p.code} vuelven a estar disponibles para todos.`,
      confirmLabel: 'Liberar',
    });
    if (!ok) return;
    try {
      this.project.set(await this.api.post<Detail>(`/projects/${p.id}/release-all`, {}));
      this.toast.show('Reservas liberadas', { tone: 'success' });
    } catch (e) {
      this.toast.show(ApiRequestError.from(e).message, { tone: 'danger' });
    }
  }

  protected async consume(r: Reservation): Promise<void> {
    const done = await firstValueFrom(
      this.dialog.open<boolean, Reservation>(ConsumeDialog, {
        data: r,
        ariaLabel: 'Consumir reserva',
      }).closed,
    );
    if (done) this.project.reload();
  }
}
