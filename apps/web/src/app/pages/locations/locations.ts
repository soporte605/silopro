import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import {
  DIALOG_DATA,
  DialogRef,
  EsBadge,
  EsButton,
  EsDialogService,
  EsDialogShell,
  EsEmptyState,
  EsFormField,
  EsInput,
  EsSelect,
  EsSkeleton,
  EsTable,
  EsToastService,
} from '@elikarsystems/ui';
import { RouterLink } from '@angular/router';
import { LucideArchive, LucideMapPin, LucidePencil, LucidePlus } from '@lucide/angular';
import { ConfirmService } from '../../core/confirm';
import { type Location, locationInputSchema, locationUpdateSchema } from '@silopro/contracts';
import { ALLOWED_CHILDREN, LOCATION_KIND_LABELS, type LocationKind } from '@silopro/domain';
import { ApiRequestError, Api } from '../../core/api';
import { zodErrors } from '../../core/forms';
import { SessionService } from '../../core/session';
import { PageHeader } from '../page-header';

interface LocationFormData {
  all: Location[];
  parentId: string | null;
  /** Ubicación a editar; sin ella el diálogo crea una nueva. */
  location?: Location;
}

@Component({
  selector: 'sp-location-form',
  imports: [EsDialogShell, EsButton, EsFormField, EsInput, EsSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full w-full' },
  template: `
    <es-dialog-shell
      [title]="editing ? 'Editar ubicación' : 'Nueva ubicación'"
      [description]="editing?.path ?? parent()?.path ?? 'Ubicación raíz (almacén)'"
    >
      <form
        id="location-form"
        class="flex flex-col gap-3"
        (submit)="$event.preventDefault(); save()"
        novalidate
      >
        @if (error()) {
          <p class="rounded-md bg-danger-soft px-2.5 py-2 text-sm text-danger" role="alert">
            {{ error() }}
          </p>
        }
        <es-form-field label="Dentro de" [error]="fields()['parentId']" #p="esFormField">
          <select
            esSelect
            [id]="p.controlId"
            [value]="parentId()"
            (change)="setParent($any($event.target).value)"
          >
            @if (!editing || editing.kind === 'warehouse') {
              <option value="">— Raíz (almacén) —</option>
            }
            @for (l of parents(); track l.id) {
              <option [value]="l.id">{{ l.path }}</option>
            }
          </select>
        </es-form-field>
        <es-form-field
          label="Tipo"
          required
          [hint]="editing ? 'El tipo no se cambia al editar.' : ''"
          [error]="fields()['kind']"
          #k="esFormField"
        >
          <select
            esSelect
            [id]="k.controlId"
            [value]="kind()"
            [disabled]="!!editing"
            (change)="kind.set($any($event.target).value)"
          >
            @for (opt of kindOptions(); track opt) {
              <option [value]="opt">{{ kindLabel(opt) }}</option>
            }
          </select>
        </es-form-field>
        <div class="grid grid-cols-[8rem_1fr] gap-3">
          <es-form-field
            label="Código"
            required
            hint="Ej. A1, EST-03"
            [error]="fields()['code']"
            #c="esFormField"
          >
            <input
              esInput
              mono
              [id]="c.controlId"
              [value]="code()"
              (input)="code.set($any($event.target).value)"
              [attr.aria-describedby]="c.describedBy()"
              [attr.aria-invalid]="!!fields()['code']"
            />
          </es-form-field>
          <es-form-field label="Nombre" required [error]="fields()['name']" #n="esFormField">
            <input
              esInput
              [id]="n.controlId"
              [value]="name()"
              (input)="name.set($any($event.target).value)"
              [attr.aria-describedby]="n.describedBy()"
              [attr.aria-invalid]="!!fields()['name']"
            />
          </es-form-field>
        </div>
        @if (editing) {
          <es-form-field
            label="Capacidad"
            hint="Máximo de artículos distintos que caben aquí. Vacío: sin límite."
            [error]="fields()['maxItems']"
            #m="esFormField"
          >
            <input
              esInput
              type="number"
              min="1"
              max="999"
              class="w-32"
              [id]="m.controlId"
              [value]="maxItems()"
              (input)="maxItems.set($any($event.target).value)"
              [attr.aria-describedby]="m.describedBy()"
              [attr.aria-invalid]="!!fields()['maxItems']"
            />
          </es-form-field>
        }
      </form>
      <ng-container esDialogFooter>
        <button esButton type="button" (click)="ref.close()">Cancelar</button>
        <button
          esButton
          variant="primary"
          type="submit"
          form="location-form"
          [loading]="busy()"
          [disabled]="!kindOptions().length"
        >
          {{ editing ? 'Guardar' : 'Crear' }}
        </button>
      </ng-container>
    </es-dialog-shell>
  `,
})
export class LocationForm {
  protected readonly ref = inject<DialogRef<Location>>(DialogRef);
  protected readonly data = inject<LocationFormData>(DIALOG_DATA);
  private readonly api = inject(Api);
  private readonly toast = inject(EsToastService);
  protected readonly editing = this.data.location;

  protected readonly parentId = signal(this.editing?.parentId ?? this.data.parentId ?? '');
  protected readonly parent = computed(() => this.data.all.find((l) => l.id === this.parentId()));
  /**
   * Lugares válidos: que admitan hijos y, al editar, que acepten este tipo y
   * no estén dentro de la propia ubicación.
   */
  protected readonly parents = computed(() => {
    const e = this.editing;
    return this.data.all.filter((l) =>
      e
        ? ALLOWED_CHILDREN[l.kind].includes(e.kind) &&
          l.id !== e.id &&
          !l.path.startsWith(e.path + ' / ')
        : ALLOWED_CHILDREN[l.kind].length > 0,
    );
  });
  protected readonly kindOptions = computed<readonly LocationKind[]>(() => {
    if (this.editing) return [this.editing.kind];
    const p = this.parent();
    return p ? ALLOWED_CHILDREN[p.kind] : ['warehouse'];
  });
  protected readonly kind = signal<LocationKind>(this.kindOptions()[0] ?? 'warehouse');
  protected readonly code = signal(this.editing?.code ?? '');
  protected readonly name = signal(this.editing?.name ?? '');
  protected readonly maxItems = signal(String(this.editing?.maxItems ?? ''));
  protected readonly fields = signal<Record<string, string>>({});
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected kindLabel(k: LocationKind): string {
    return LOCATION_KIND_LABELS[k];
  }

  protected setParent(id: string): void {
    this.parentId.set(id);
    const opts = this.kindOptions();
    if (!opts.includes(this.kind())) this.kind.set(opts[0] ?? 'other');
  }

  protected async save(): Promise<void> {
    const e = this.editing;
    const common = {
      code: this.code(),
      name: this.name(),
      parentId: this.parentId() || null,
    };
    const parsed = e
      ? locationUpdateSchema.safeParse({
          ...common,
          version: e.version,
          maxItems: this.maxItems().trim() === '' ? null : this.maxItems(),
        })
      : locationInputSchema.safeParse({ ...common, kind: this.kind() });
    this.fields.set(parsed.success ? {} : zodErrors(parsed.error));
    if (!parsed.success) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const loc = e
        ? await this.api.patch<Location>(`/locations/${e.id}`, parsed.data)
        : await this.api.post<Location>('/locations', parsed.data);
      this.toast.show(e ? 'Ubicación guardada' : 'Ubicación creada', {
        tone: 'success',
        description: loc.path,
      });
      this.ref.close(loc);
    } catch (err) {
      const apiErr = ApiRequestError.from(err);
      this.fields.set(apiErr.fieldErrors());
      this.error.set(
        apiErr.code === 'DUPLICATE'
          ? 'Ya existe una ubicación con ese código en ese nivel.'
          : apiErr.code === 'STALE_VERSION'
            ? 'Alguien más cambió esta ubicación. Cierre y vuelva a abrirla.'
            : apiErr.message,
      );
    } finally {
      this.busy.set(false);
    }
  }
}

@Component({
  selector: 'sp-locations',
  imports: [
    RouterLink,
    PageHeader,
    EsBadge,
    EsButton,
    EsEmptyState,
    EsSkeleton,
    EsTable,
    LucidePlus,
    LucidePencil,
    LucideArchive,
    LucideMapPin,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <sp-page-header
        title="Ubicaciones"
        description="Almacenes, estanterías, gabinetes y cajones. Los gabinetes en cuadrícula se diseñan en Gabinetes."
      >
        <a
          spActions
          esButton
          variant="ghost"
          routerLink="/etiquetas"
          [queryParams]="{ origen: 'ubicaciones' }"
          >Imprimir etiquetas</a
        >
        @if (session.canWrite()) {
          <button spActions esButton variant="primary" (click)="open(null)">
            <svg lucidePlus></svg> Nueva ubicación
          </button>
        }
      </sp-page-header>
      <div class="overflow-x-auto rounded-lg border border-border bg-surface">
        @if (list.isLoading() && !list.hasValue()) {
          <div class="p-3"><es-skeleton class="h-16 w-full" /></div>
        } @else if (!rows().length) {
          <es-empty-state
            class="m-3"
            title="Sin ubicaciones"
            description="Empiece por un almacén (su taller, bodega o laboratorio) y agregue lo que contiene."
          >
            <svg esEmptyIcon lucideMapPin></svg>
          </es-empty-state>
        } @else {
          <table esTable>
            <caption class="sr-only">
              Ubicaciones
            </caption>
            <thead>
              <tr>
                <th scope="col">Ubicación</th>
                <th scope="col" class="w-32">Tipo</th>
                <th scope="col" class="w-44">QR</th>
                @if (session.canWrite()) {
                  <th scope="col" class="w-28"><span class="sr-only">Acciones</span></th>
                }
              </tr>
            </thead>
            <tbody>
              @for (r of rows(); track r.l.id) {
                <tr
                  [class.bg-accent-soft]="r.l.id === resaltar()"
                  [attr.aria-current]="r.l.id === resaltar() ? 'location' : null"
                >
                  <td>
                    <span [style.padding-left.rem]="r.depth * 1.25">
                      <span class="font-mono text-xs text-fg-muted">{{ r.l.code }}</span>
                      <a
                        class="ml-2 font-medium hover:underline"
                        [routerLink]="['/ubicaciones', r.l.id]"
                        >{{ r.l.name }}</a
                      >
                    </span>
                    @if (r.l.cabinetId) {
                      <a
                        class="ml-2 text-xs text-accent hover:underline"
                        [routerLink]="['/gabinetes', r.l.cabinetId]"
                        >Abrir gabinete · {{ drawerCount().get(r.l.id) ?? 0 }} cajones</a
                      >
                    }
                  </td>
                  <td>
                    <es-badge>{{ kindLabel(r.l.kind) }}</es-badge>
                  </td>
                  <td class="code text-fg-muted">{{ r.l.qrCode }}</td>
                  @if (session.canWrite()) {
                    <td>
                      <div class="flex justify-end gap-0.5">
                        @if (canHaveChildren(r.l)) {
                          <button
                            esButton
                            variant="ghost"
                            size="sm"
                            iconOnly
                            [attr.aria-label]="'Agregar dentro de ' + r.l.name"
                            (click)="open(r.l.id)"
                          >
                            <svg lucidePlus></svg>
                          </button>
                        }
                        <button
                          esButton
                          variant="ghost"
                          size="sm"
                          iconOnly
                          [attr.aria-label]="'Editar ' + r.l.name"
                          (click)="edit(r.l)"
                        >
                          <svg lucidePencil></svg>
                        </button>
                        <button
                          esButton
                          variant="ghost"
                          size="sm"
                          iconOnly
                          [attr.aria-label]="'Archivar ' + r.l.name"
                          (click)="archive(r.l)"
                        >
                          <svg lucideArchive></svg>
                        </button>
                      </div>
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    </div>
  `,
})
export default class Locations {
  private readonly api = inject(Api);
  private readonly dialog = inject(EsDialogService);
  private readonly toast = inject(EsToastService);
  private readonly confirm = inject(ConfirmService);
  protected readonly session = inject(SessionService);
  /** Ubicación a resaltar (p. ej. al abrir una etiqueta escaneada). */
  readonly resaltar = input<string>();

  protected readonly list = resource({
    params: () => this.session.orgId(),
    loader: () => this.api.get<Location[]>('/locations'),
  });

  protected readonly drawerCount = computed(() => {
    const out = new Map<string, number>();
    for (const l of this.list.value() ?? []) {
      if (l.kind === 'drawer' && l.parentId) out.set(l.parentId, (out.get(l.parentId) ?? 0) + 1);
    }
    return out;
  });

  /** Orden de árbol con profundidad, a partir de parentId. */
  protected readonly rows = computed(() => {
    const all = this.list.value() ?? [];
    const kids = new Map<string | null, Location[]>();
    for (const l of all) kids.set(l.parentId, [...(kids.get(l.parentId) ?? []), l]);
    const out: { l: Location; depth: number }[] = [];
    const walk = (parent: string | null, depth: number) => {
      for (const l of (kids.get(parent) ?? []).sort((a, b) =>
        a.code.localeCompare(b.code, 'es', { numeric: true }),
      )) {
        out.push({ l, depth });
        // Los cajones de un gabinete con diseño se gestionan en su editor.
        if (!l.cabinetId) walk(l.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  });

  protected kindLabel(k: LocationKind): string {
    return LOCATION_KIND_LABELS[k];
  }

  protected canHaveChildren(l: Location): boolean {
    return ALLOWED_CHILDREN[l.kind].length > 0;
  }

  protected open(parentId: string | null): void {
    this.dialog
      .open<Location, LocationFormData>(LocationForm, {
        data: { all: this.list.value() ?? [], parentId },
        ariaLabel: 'Nueva ubicación',
      })
      .closed.subscribe((saved) => saved && this.list.reload());
  }

  protected edit(location: Location): void {
    this.dialog
      .open<Location, LocationFormData>(LocationForm, {
        data: { all: this.list.value() ?? [], parentId: location.parentId, location },
        ariaLabel: 'Editar ubicación',
      })
      .closed.subscribe((saved) => saved && this.list.reload());
  }

  protected async archive(l: Location): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Archivar ubicación',
      message: `«${l.path}» y todo lo que contiene dejarán de aparecer. Solo se puede si no hay existencias dentro; el historial se conserva.`,
      confirmLabel: 'Archivar',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.api.delete(`/locations/${l.id}`);
      this.toast.show('Ubicación archivada', { description: l.path });
      this.list.reload();
    } catch (e) {
      this.toast.show(ApiRequestError.from(e).message, { tone: 'danger' });
    }
  }
}
