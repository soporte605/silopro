import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
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
  type StockByLocation,
  type TransferInput,
  transferInputSchema,
} from '@silopro/contracts';
import { ApiRequestError, Api } from '../../core/api';
import { fmtQty } from '../../core/format';
import { zodErrors } from '../../core/forms';

export interface TransferDialogData {
  item: Item;
  stock: StockByLocation[];
  /** Origen o destino ya conocidos (p. ej. desde la ficha de un cajón). */
  fromLocationId?: string;
  toLocationId?: string;
}

/** Mueve existencias de un artículo de una ubicación a otra. */
@Component({
  selector: 'sp-transfer-dialog',
  imports: [ReactiveFormsModule, EsDialogShell, EsButton, EsFormField, EsInput, EsSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full w-full' },
  template: `
    <es-dialog-shell
      title="Mover existencias"
      [description]="data.item.sku + ' · ' + data.item.name"
    >
      @if (!origins().length) {
        <p class="text-sm text-fg-muted">
          Este artículo no tiene existencias disponibles para mover.
        </p>
      } @else {
        <form
          id="transfer-form"
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
            label="Desde"
            required
            [error]="fields()['fromLocationId']"
            #f="esFormField"
          >
            <select
              esSelect
              formControlName="fromLocationId"
              [id]="f.controlId"
              [attr.aria-describedby]="f.describedBy()"
            >
              @for (o of origins(); track o.locationId) {
                <option [value]="o.locationId">
                  {{ o.locationPath }} ({{ qty(o.available) }} {{ data.item.unitSymbol }})
                </option>
              }
            </select>
          </es-form-field>
          <es-form-field label="Hacia" required [error]="fields()['toLocationId']" #t="esFormField">
            <select
              esSelect
              formControlName="toLocationId"
              [id]="t.controlId"
              [attr.aria-describedby]="t.describedBy()"
            >
              <option value="" disabled>Elija el destino…</option>
              @for (l of destinations(); track l.id) {
                <option [value]="l.id">{{ l.path }}</option>
              }
            </select>
          </es-form-field>
          <es-form-field
            label="Cantidad"
            required
            [error]="fields()['quantity']"
            [hint]="
              source()
                ? 'Disponible: ' + qty(source()!.available) + ' ' + data.item.unitSymbol
                : undefined
            "
            #q="esFormField"
          >
            <div class="flex gap-2">
              <input
                class="min-w-0 flex-1"
                esInput
                inputmode="decimal"
                formControlName="quantity"
                [id]="q.controlId"
                [attr.aria-describedby]="q.describedBy()"
              />
              <button esButton type="button" (click)="all()" [disabled]="!source()">Todo</button>
            </div>
          </es-form-field>
          <es-form-field label="Nota" [error]="fields()['reason']" #r="esFormField">
            <input
              esInput
              formControlName="reason"
              placeholder="p. ej. Reordenar el estante"
              [id]="r.controlId"
              [attr.aria-describedby]="r.describedBy()"
            />
          </es-form-field>
        </form>
      }
      <ng-container esDialogFooter>
        <button esButton type="button" (click)="ref.close()">Cancelar</button>
        @if (origins().length) {
          <button esButton variant="primary" type="submit" form="transfer-form" [loading]="busy()">
            Mover
          </button>
        }
      </ng-container>
    </es-dialog-shell>
  `,
})
export class TransferDialog {
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly data = inject<TransferDialogData>(DIALOG_DATA);
  private readonly api = inject(Api);
  private readonly toast = inject(EsToastService);
  protected readonly qty = fmtQty;

  /** Solo se mueve lo disponible (lo reservado se queda donde está). */
  protected readonly origins = computed(() => this.data.stock.filter((s) => s.available > 0));

  protected readonly form = inject(NonNullableFormBuilder).group({
    fromLocationId:
      this.origins().find((s) => s.locationId === this.data.fromLocationId)?.locationId ??
      this.origins().find((s) => s.locationId !== this.data.toLocationId)?.locationId ??
      '',
    toLocationId: this.data.toLocationId ?? '',
    quantity: '',
    reason: '',
  });
  private readonly from = signal(this.form.controls.fromLocationId.value);

  private readonly locations = resource({
    loader: () => this.api.get<Location[]>('/locations'),
  });
  protected readonly destinations = computed(() =>
    (this.locations.value() ?? []).filter((l) => l.id !== this.from()),
  );
  protected readonly source = computed(() =>
    this.origins().find((s) => s.locationId === this.from()),
  );

  protected readonly fields = signal<Record<string, string>>({});
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  constructor() {
    this.form.controls.fromLocationId.valueChanges.subscribe((v) => {
      this.from.set(v);
      if (this.form.controls.toLocationId.value === v) this.form.controls.toLocationId.setValue('');
    });
  }

  protected all(): void {
    const s = this.source();
    if (s) this.form.controls.quantity.setValue(String(s.available));
  }

  protected async save(): Promise<void> {
    const v = this.form.getRawValue();
    const amount = v.quantity.replace(',', '.');
    const input: TransferInput = {
      itemId: this.data.item.id,
      fromLocationId: v.fromLocationId,
      toLocationId: v.toLocationId,
      quantity: amount === '' ? Number.NaN : Number(amount),
      ...(v.reason ? { reason: v.reason } : {}),
    };
    const parsed = transferInputSchema.safeParse(input);
    this.fields.set(parsed.success ? {} : zodErrors(parsed.error));
    this.error.set(null);
    if (!parsed.success) return;
    this.busy.set(true);
    try {
      await this.api.post('/transfers', parsed.data);
      this.toast.show('Existencias movidas', { tone: 'success' });
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
