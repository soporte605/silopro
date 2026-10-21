import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  DIALOG_DATA,
  DialogRef,
  EsButton,
  EsDialogShell,
  EsFormField,
  EsInput,
  EsSelect,
  EsToastService,
} from '@elikarsystems/ui';
import {
  type Item,
  type Location,
  type MovementInput,
  movementInputSchema,
  type StockByLocation,
} from '@silopro/contracts';
import { ApiRequestError, Api } from '../../core/api';
import { fmtQty } from '../../core/format';
import { zodErrors } from '../../core/forms';

export type MovementKindInput = MovementInput['kind'];

export interface MovementDialogData {
  item: Item;
  kind: MovementKindInput;
  stock: StockByLocation[];
  locationId?: string;
}

const TITLES: Record<MovementKindInput, string> = {
  receipt: 'Registrar entrada',
  issue: 'Registrar salida',
  adjustment: 'Ajustar por conteo',
};

@Component({
  selector: 'sp-movement-dialog',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    EsDialogShell,
    EsButton,
    EsFormField,
    EsInput,
    EsSelect,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full w-full' },
  template: `
    <es-dialog-shell [title]="title" [description]="data.item.sku + ' · ' + data.item.name">
      @if (locations.hasValue() && !locationOptions().length) {
        <p class="text-sm text-fg-muted">
          @if (data.kind === 'receipt') {
            Primero cree una ubicación (por ejemplo, un almacén) para recibir existencias.
            <a routerLink="/ubicaciones" class="text-primary hover:underline" (click)="ref.close()"
              >Ir a Ubicaciones</a
            >
          } @else {
            Este artículo no tiene existencias en ninguna ubicación.
          }
        </p>
      } @else {
        <form
          id="movement-form"
          class="flex flex-col gap-3"
          [formGroup]="form"
          (ngSubmit)="save()"
          novalidate
        >
          @if (error()) {
            <p class="rounded-md bg-danger-soft px-2.5 py-2 text-sm text-danger" role="alert">
              {{ error() }}
            </p>
          }
          <es-form-field
            label="Ubicación"
            required
            [error]="fields()['locationId']"
            #l="esFormField"
          >
            <select
              esSelect
              formControlName="locationId"
              [id]="l.controlId"
              [attr.aria-describedby]="l.describedBy()"
            >
              @for (o of locationOptions(); track o.id) {
                <option [value]="o.id">{{ o.label }}</option>
              }
            </select>
          </es-form-field>
          @if (current(); as c) {
            <p class="-mt-1 text-xs text-fg-muted">
              Actual: {{ qty(c.onHand) }} {{ data.item.unitSymbol }} · disponible
              {{ qty(c.available) }}
            </p>
          }
          <es-form-field
            [label]="data.kind === 'adjustment' ? 'Cantidad contada' : 'Cantidad'"
            required
            [error]="fields()['quantity'] || fields()['countedQuantity']"
            [hint]="
              data.kind === 'adjustment'
                ? 'La existencia quedará exactamente en este valor.'
                : undefined
            "
            #q="esFormField"
          >
            <input
              esInput
              inputmode="decimal"
              formControlName="quantity"
              [id]="q.controlId"
              [attr.aria-describedby]="q.describedBy()"
            />
          </es-form-field>
          <es-form-field
            [label]="data.kind === 'adjustment' ? 'Motivo' : 'Nota'"
            [required]="data.kind === 'adjustment'"
            [error]="fields()['reason']"
            #r="esFormField"
          >
            <input
              esInput
              formControlName="reason"
              [id]="r.controlId"
              [attr.aria-describedby]="r.describedBy()"
            />
          </es-form-field>
        </form>
      }
      <ng-container esDialogFooter>
        <button esButton type="button" (click)="ref.close()">Cancelar</button>
        @if (locationOptions().length) {
          <button esButton variant="primary" type="submit" form="movement-form" [loading]="busy()">
            Registrar
          </button>
        }
      </ng-container>
    </es-dialog-shell>
  `,
})
export class MovementDialog {
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly data = inject<MovementDialogData>(DIALOG_DATA);
  private readonly api = inject(Api);
  private readonly toast = inject(EsToastService);
  protected readonly title = TITLES[this.data.kind];
  protected readonly qty = fmtQty;

  protected readonly form = inject(NonNullableFormBuilder).group({
    locationId: this.data.locationId ?? '',
    quantity: '',
    reason: '',
  });

  protected readonly locations = resource({
    loader: async () => {
      const list = await this.api.get<Location[]>('/locations');
      const first = this.data.kind === 'receipt' ? list[0]?.id : this.data.stock[0]?.locationId;
      if (!this.form.controls.locationId.value && first) {
        this.form.controls.locationId.setValue(first);
      }
      return list;
    },
  });

  /** Entradas: cualquier ubicación. Salidas: solo donde hay existencias. */
  protected readonly locationOptions = computed(() => {
    const list = this.locations.value() ?? [];
    if (this.data.kind === 'issue') {
      return this.data.stock
        .filter((s) => s.onHand > 0)
        .map((s) => ({ id: s.locationId, label: s.locationPath }));
    }
    return list.map((l) => ({ id: l.id, label: l.path }));
  });

  private readonly locationId = signal(this.form.controls.locationId.value);
  protected readonly current = computed(() =>
    this.data.stock.find((s) => s.locationId === this.locationId()),
  );

  protected readonly fields = signal<Record<string, string>>({});
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  constructor() {
    this.form.controls.locationId.valueChanges.subscribe((v) => this.locationId.set(v));
  }

  protected async save(): Promise<void> {
    const v = this.form.getRawValue();
    const amount = v.quantity.replace(',', '.');
    const input: MovementInput =
      this.data.kind === 'adjustment'
        ? {
            kind: 'adjustment',
            itemId: this.data.item.id,
            locationId: v.locationId,
            countedQuantity: amount === '' ? Number.NaN : Number(amount),
            reason: v.reason,
          }
        : {
            kind: this.data.kind,
            itemId: this.data.item.id,
            locationId: v.locationId,
            quantity: amount === '' ? Number.NaN : Number(amount),
            ...(v.reason ? { reason: v.reason } : {}),
          };
    const parsed = movementInputSchema.safeParse(input);
    this.fields.set(parsed.success ? {} : zodErrors(parsed.error));
    this.error.set(null);
    if (!parsed.success) return;

    this.busy.set(true);
    try {
      await this.api.post('/movements', parsed.data);
      this.toast.show(`${this.title}: listo`, { tone: 'success' });
      this.ref.close(true);
    } catch (e) {
      const err = ApiRequestError.from(e);
      this.fields.set(err.fieldErrors());
      this.error.set(err.message);
    } finally {
      this.busy.set(false);
    }
  }
}
