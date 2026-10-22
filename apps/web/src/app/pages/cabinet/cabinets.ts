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
  DIALOG_DATA,
  DialogRef,
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
import { LucideGrid3x3, LucidePlus } from '@lucide/angular';
import {
  type Cabinet,
  CABINET_MAX_COLUMNS,
  CABINET_STYLE_INFO,
  type CabinetStyleValue,
  CABINET_MAX_ROWS,
  type CabinetSummary,
  cabinetInputSchema,
  type Location,
} from '@silopro/contracts';
import { ALLOWED_CHILDREN } from '@silopro/domain';
import { ApiRequestError, Api } from '../../core/api';
import { zodErrors } from '../../core/forms';
import { SessionService } from '../../core/session';
import { PageHeader } from '../page-header';

/** Ubicaciones que pueden contener un gabinete o un anaquel. */
const canHold = (style: CabinetStyleValue) => (l: Location) =>
  ALLOWED_CHILDREN[l.kind].includes(CABINET_STYLE_INFO[style].containerKind);

/** Tamaño inicial sugerido para cada tipo de mueble. */
const STYLE_DEFAULTS: Record<CabinetStyleValue, { rows: string; columns: string }> = {
  drawers: { rows: '6', columns: '8' },
  shelves: { rows: '4', columns: '3' },
};

@Component({
  selector: 'sp-cabinet-form',
  imports: [EsDialogShell, EsButton, EsFormField, EsInput, EsSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full w-full' },
  template: `
    <es-dialog-shell
      [title]="'Nuevo ' + info().label.toLowerCase()"
      [description]="
        style() === 'shelves'
          ? 'Cada fila es una repisa y se crea una charola por celda. Después puede fusionarlas o dividirlas en el editor.'
          : 'Se crea un cajón por celda. Después puede fusionarlos o dividirlos en el editor.'
      "
    >
      <form
        id="cabinet-form"
        class="grid grid-cols-2 gap-3"
        (submit)="$event.preventDefault(); save()"
        novalidate
      >
        @if (error()) {
          <p
            class="col-span-full rounded-md bg-danger-soft px-2.5 py-2 text-sm text-danger"
            role="alert"
          >
            {{ error() }}
          </p>
        }
        <fieldset class="col-span-full">
          <legend class="mb-1 text-sm font-medium">Tipo</legend>
          <div class="grid grid-cols-2 gap-2">
            @for (o of styleOptions; track o.value) {
              <label
                class="flex cursor-pointer flex-col rounded-md border border-border p-2.5 has-checked:border-accent has-checked:bg-accent-soft"
              >
                <span class="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="radio"
                    name="style"
                    [value]="o.value"
                    [checked]="style() === o.value"
                    (change)="setStyle(o.value)"
                  />
                  {{ o.label }}
                </span>
                <span class="mt-0.5 text-xs text-fg-muted">{{ o.hint }}</span>
              </label>
            }
          </div>
        </fieldset>
        <es-form-field
          class="col-span-full"
          label="Dentro de"
          required
          [error]="fields()['parentId']"
          #p="esFormField"
        >
          <select
            esSelect
            [id]="p.controlId"
            [value]="parentId()"
            (change)="parentId.set($any($event.target).value)"
          >
            @for (l of parents(); track l.id) {
              <option [value]="l.id">{{ l.path }}</option>
            }
          </select>
        </es-form-field>
        <es-form-field label="Código" required [error]="fields()['code']" #c="esFormField">
          <input
            esInput
            mono
            [id]="c.controlId"
            [placeholder]="style() === 'shelves' ? 'ANQ-1' : 'GAB-1'"
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
            [placeholder]="
              style() === 'shelves' ? 'Anaquel de charolas' : 'Gabinete de electrónica'
            "
            [value]="name()"
            (input)="name.set($any($event.target).value)"
            [attr.aria-describedby]="n.describedBy()"
            [attr.aria-invalid]="!!fields()['name']"
          />
        </es-form-field>
        <es-form-field
          [label]="style() === 'shelves' ? 'Repisas' : 'Filas'"
          required
          [hint]="'Hasta ' + maxRows"
          [error]="fields()['rows']"
          #r="esFormField"
        >
          <input
            esInput
            type="number"
            min="1"
            [max]="maxRows"
            [id]="r.controlId"
            [value]="rows()"
            (input)="rows.set($any($event.target).value)"
            [attr.aria-describedby]="r.describedBy()"
            [attr.aria-invalid]="!!fields()['rows']"
          />
        </es-form-field>
        <es-form-field
          [label]="style() === 'shelves' ? 'Charolas por repisa' : 'Columnas'"
          required
          [hint]="'Hasta ' + maxColumns"
          [error]="fields()['columns']"
          #k="esFormField"
        >
          <input
            esInput
            type="number"
            min="1"
            [max]="maxColumns"
            [id]="k.controlId"
            [value]="columns()"
            (input)="columns.set($any($event.target).value)"
            [attr.aria-describedby]="k.describedBy()"
            [attr.aria-invalid]="!!fields()['columns']"
          />
        </es-form-field>
        <es-form-field label="Direccionamiento" #a="esFormField">
          <select
            esSelect
            [id]="a.controlId"
            [value]="addressing()"
            (change)="addressing.set($any($event.target).value)"
          >
            <option value="row-letter">Fila letra · A1</option>
            <option value="column-letter">Columna letra · A1</option>
            <option value="numeric">Numérico · 1-1</option>
          </select>
        </es-form-field>
        <es-form-field
          [label]="style() === 'shelves' ? 'Primera repisa' : 'Primera fila'"
          #o="esFormField"
        >
          <select
            esSelect
            [id]="o.controlId"
            [value]="rowOrigin()"
            (change)="rowOrigin.set($any($event.target).value)"
          >
            <option value="top">Arriba</option>
            <option value="bottom">Abajo</option>
          </select>
        </es-form-field>
      </form>
      <ng-container esDialogFooter>
        <button esButton type="button" (click)="ref.close()">Cancelar</button>
        <button esButton variant="primary" type="submit" form="cabinet-form" [loading]="busy()">
          Crear {{ info().label.toLowerCase() }}
        </button>
      </ng-container>
    </es-dialog-shell>
  `,
})
export class CabinetForm {
  protected readonly ref = inject<DialogRef<Cabinet>>(DialogRef);
  protected readonly data = inject<Location[]>(DIALOG_DATA);
  private readonly api = inject(Api);
  private readonly toast = inject(EsToastService);
  protected readonly maxRows = CABINET_MAX_ROWS;
  protected readonly maxColumns = CABINET_MAX_COLUMNS;

  protected readonly styleOptions = [
    { value: 'drawers', label: 'Gabinete', hint: 'Cajones en cuadrícula' },
    { value: 'shelves', label: 'Anaquel', hint: 'Repisas con charolas' },
  ] as const;
  protected readonly style = signal<CabinetStyleValue>('drawers');
  protected readonly info = computed(() => CABINET_STYLE_INFO[this.style()]);
  protected readonly parents = computed(() => this.data.filter(canHold(this.style())));
  protected readonly parentId = signal(this.parents()[0]?.id ?? '');
  protected readonly code = signal('');
  protected readonly name = signal('');
  protected readonly rows = signal(STYLE_DEFAULTS.drawers.rows);
  protected readonly columns = signal(STYLE_DEFAULTS.drawers.columns);
  protected readonly addressing = signal('row-letter');
  protected readonly rowOrigin = signal('top');
  protected readonly fields = signal<Record<string, string>>({});
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected setStyle(style: CabinetStyleValue): void {
    this.style.set(style);
    this.rows.set(STYLE_DEFAULTS[style].rows);
    this.columns.set(STYLE_DEFAULTS[style].columns);
    const parents = this.parents();
    if (!parents.some((l) => l.id === this.parentId())) this.parentId.set(parents[0]?.id ?? '');
  }

  protected async save(): Promise<void> {
    const parsed = cabinetInputSchema.safeParse({
      style: this.style(),
      parentId: this.parentId(),
      code: this.code(),
      name: this.name(),
      rows: this.rows(),
      columns: this.columns(),
      addressing: this.addressing(),
      rowOrigin: this.rowOrigin(),
    });
    this.fields.set(parsed.success ? {} : zodErrors(parsed.error));
    if (!parsed.success) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const cab = await this.api.post<Cabinet>('/cabinets', parsed.data);
      const info = this.info();
      this.toast.show(`${info.label} creado`, {
        tone: 'success',
        description: `${cab.compartments.length} ${info.cells} en ${cab.path}`,
      });
      this.ref.close(cab);
    } catch (e) {
      const err = ApiRequestError.from(e);
      this.fields.set(err.fieldErrors());
      this.error.set(
        err.code === 'DUPLICATE'
          ? 'Ya existe una ubicación con ese código en ese lugar.'
          : err.message,
      );
    } finally {
      this.busy.set(false);
    }
  }
}

@Component({
  selector: 'sp-cabinets',
  imports: [
    RouterLink,
    PageHeader,
    EsButton,
    EsEmptyState,
    EsSkeleton,
    EsTable,
    LucideGrid3x3,
    LucidePlus,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <sp-page-header
        title="Gabinetes y anaqueles"
        description="Gabinetes de cajones y anaqueles de charolas, en cuadrícula. Cada cajón o charola es una ubicación con su QR."
      >
        <a spActions esButton variant="ghost" routerLink="/gabinetes/demo">Ver demostración</a>
        @if (session.canWrite()) {
          <button
            spActions
            esButton
            variant="primary"
            [disabled]="!parents().length"
            (click)="open()"
          >
            <svg lucidePlus></svg> Nuevo gabinete o anaquel
          </button>
        }
      </sp-page-header>
      <div class="overflow-x-auto rounded-lg border border-border bg-surface">
        @if (list.isLoading() && !list.hasValue()) {
          <div class="p-3"><es-skeleton class="h-16 w-full" /></div>
        } @else if (!list.value()?.length) {
          <es-empty-state
            class="m-3"
            title="Sin gabinetes ni anaqueles"
            [description]="
              parents().length
                ? 'Cree su primer gabinete o anaquel: elija dónde está, cuántas filas y columnas tiene.'
                : 'Primero cree un almacén en Ubicaciones; luego podrá poner gabinetes y anaqueles dentro.'
            "
          >
            <svg esEmptyIcon lucideGrid3x3></svg>
            @if (!parents().length) {
              <a esEmptyActions esButton routerLink="/ubicaciones">Ir a Ubicaciones</a>
            }
          </es-empty-state>
        } @else {
          <table esTable>
            <caption class="sr-only">
              Gabinetes y anaqueles
            </caption>
            <thead>
              <tr>
                <th scope="col">Mueble</th>
                <th scope="col">Tipo</th>
                <th scope="col">Ubicación</th>
                <th scope="col" class="num w-24">Tamaño</th>
                <th scope="col" class="num w-24">Celdas</th>
                <th scope="col" class="num w-24">Ocupados</th>
              </tr>
            </thead>
            <tbody>
              @for (c of list.value(); track c.id) {
                <tr>
                  <td>
                    <a class="font-medium hover:underline" [routerLink]="['/gabinetes', c.id]">
                      <span class="font-mono text-xs text-fg-muted">{{ c.code }}</span>
                      <span class="ml-2">{{ c.name }}</span>
                    </a>
                  </td>
                  <td>{{ styleLabel(c) }}</td>
                  <td class="text-fg-muted">{{ c.path }}</td>
                  <td class="num">{{ c.rows }}×{{ c.columns }}</td>
                  <td class="num">{{ c.compartmentCount }}</td>
                  <td class="num">{{ c.occupiedCount }}</td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    </div>
  `,
})
export default class Cabinets {
  private readonly api = inject(Api);
  private readonly dialog = inject(EsDialogService);
  private readonly router = inject(Router);
  protected readonly session = inject(SessionService);

  protected readonly list = resource({
    params: () => this.session.orgId(),
    loader: () => this.api.get<CabinetSummary[]>('/cabinets'),
  });
  private readonly locations = resource({
    params: () => this.session.orgId(),
    loader: () => this.api.get<Location[]>('/locations'),
  });
  protected readonly parents = computed(() =>
    (this.locations.value() ?? []).filter((l) => canHold('drawers')(l) || canHold('shelves')(l)),
  );
  protected readonly styleLabel = (c: CabinetSummary) => CABINET_STYLE_INFO[c.style].label;

  protected open(): void {
    this.dialog
      .open<Cabinet, Location[]>(CabinetForm, {
        data: this.parents(),
        ariaLabel: 'Nuevo gabinete o anaquel',
      })
      .closed.subscribe((cab) => cab && void this.router.navigate(['/gabinetes', cab.id]));
  }
}
