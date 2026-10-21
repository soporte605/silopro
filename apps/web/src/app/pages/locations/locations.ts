import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
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
import { LucideMapPin, LucidePlus } from '@lucide/angular';
import { type Location, locationInputSchema } from '@silopro/contracts';
import { ALLOWED_CHILDREN, LOCATION_KIND_LABELS, type LocationKind } from '@silopro/domain';
import { ApiRequestError, Api } from '../../core/api';
import { zodErrors } from '../../core/forms';
import { SessionService } from '../../core/session';
import { PageHeader } from '../page-header';

interface LocationFormData {
  all: Location[];
  parentId: string | null;
}

@Component({
  selector: 'sp-location-form',
  imports: [EsDialogShell, EsButton, EsFormField, EsInput, EsSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full w-full' },
  template: `
    <es-dialog-shell
      title="Nueva ubicación"
      [description]="parent()?.path ?? 'Ubicación raíz (almacén)'"
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
        <es-form-field label="Dentro de" #p="esFormField">
          <select
            esSelect
            [id]="p.controlId"
            [value]="parentId()"
            (change)="setParent($any($event.target).value)"
          >
            <option value="">— Raíz (almacén) —</option>
            @for (l of parents(); track l.id) {
              <option [value]="l.id">{{ l.path }}</option>
            }
          </select>
        </es-form-field>
        <es-form-field label="Tipo" required [error]="fields()['kind']" #k="esFormField">
          <select
            esSelect
            [id]="k.controlId"
            [value]="kind()"
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
          Crear
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

  protected readonly parentId = signal(this.data.parentId ?? '');
  protected readonly parent = computed(() => this.data.all.find((l) => l.id === this.parentId()));
  /** Solo ubicaciones que admiten hijos. */
  protected readonly parents = computed(() =>
    this.data.all.filter((l) => ALLOWED_CHILDREN[l.kind].length > 0),
  );
  protected readonly kindOptions = computed<readonly LocationKind[]>(() => {
    const p = this.parent();
    return p ? ALLOWED_CHILDREN[p.kind] : ['warehouse'];
  });
  protected readonly kind = signal<LocationKind>(this.kindOptions()[0] ?? 'warehouse');
  protected readonly code = signal('');
  protected readonly name = signal('');
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
    const parsed = locationInputSchema.safeParse({
      kind: this.kind(),
      code: this.code(),
      name: this.name(),
      parentId: this.parentId() || null,
    });
    this.fields.set(parsed.success ? {} : zodErrors(parsed.error));
    if (!parsed.success) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const loc = await this.api.post<Location>('/locations', parsed.data);
      this.toast.show('Ubicación creada', { tone: 'success', description: loc.path });
      this.ref.close(loc);
    } catch (e) {
      const err = ApiRequestError.from(e);
      this.fields.set(err.fieldErrors());
      this.error.set(
        err.code === 'DUPLICATE'
          ? 'Ya existe una ubicación con ese código en ese nivel.'
          : err.message,
      );
    } finally {
      this.busy.set(false);
    }
  }
}

@Component({
  selector: 'sp-locations',
  imports: [
    PageHeader,
    EsBadge,
    EsButton,
    EsEmptyState,
    EsSkeleton,
    EsTable,
    LucidePlus,
    LucideMapPin,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <sp-page-header
        title="Ubicaciones"
        description="Almacenes, estanterías, gabinetes y cajones. El editor visual de gabinetes llega en la fase 3."
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
                  <th scope="col" class="w-12"><span class="sr-only">Acciones</span></th>
                }
              </tr>
            </thead>
            <tbody>
              @for (r of rows(); track r.l.id) {
                <tr>
                  <td>
                    <span [style.padding-left.rem]="r.depth * 1.25">
                      <span class="font-mono text-xs text-fg-muted">{{ r.l.code }}</span>
                      <span class="ml-2 font-medium">{{ r.l.name }}</span>
                    </span>
                  </td>
                  <td>
                    <es-badge>{{ kindLabel(r.l.kind) }}</es-badge>
                  </td>
                  <td class="code text-fg-muted">{{ r.l.qrCode }}</td>
                  @if (session.canWrite()) {
                    <td>
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
  protected readonly session = inject(SessionService);

  protected readonly list = resource({
    params: () => this.session.orgId(),
    loader: () => this.api.get<Location[]>('/locations'),
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
        walk(l.id, depth + 1);
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
}
