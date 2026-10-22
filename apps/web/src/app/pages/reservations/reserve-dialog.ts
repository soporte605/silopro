import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
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
  type ReservationInput,
  reservationInputSchema,
  type StockByLocation,
} from '@silopro/contracts';
import { ApiRequestError, Api } from '../../core/api';
import { fmtQty } from '../../core/format';
import { zodErrors } from '../../core/forms';

export interface ReserveDialogData {
  item: Item;
  stock: StockByLocation[];
  locationId?: string;
}

/** Aparta existencias de un artículo para un uso (proyecto, pedido…). */
@Component({
  selector: 'sp-reserve-dialog',
  imports: [ReactiveFormsModule, EsDialogShell, EsButton, EsFormField, EsInput, EsSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full w-full' },
  template: `
    <es-dialog-shell title="Reservar" [description]="data.item.sku + ' · ' + data.item.name">
      @if (!options().length) {
        <p class="text-sm text-fg-muted">No hay existencias disponibles para reservar.</p>
      } @else {
        <form
          id="reserve-form"
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
          <es-form-field label="Para qué" required [error]="fields()['purpose']" #p="esFormField">
            <input
              esInput
              formControlName="purpose"
              placeholder="p. ej. Proyecto robot, pedido 42"
              [id]="p.controlId"
              [attr.aria-describedby]="p.describedBy()"
            />
          </es-form-field>
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
              @for (o of options(); track o.locationId) {
                <option [value]="o.locationId">
                  {{ o.locationPath }} ({{ qty(o.available) }}
                  {{ data.item.unitSymbol }} disponibles)
                </option>
              }
            </select>
          </es-form-field>
          <div class="flex items-end gap-2">
            <es-form-field
              label="Cantidad"
              required
              class="flex-1"
              [error]="fields()['quantity']"
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
            <button esButton type="button" class="mb-0.5" (click)="all()">Todo</button>
          </div>
        </form>
      }
      <ng-container esDialogFooter>
        <button esButton type="button" (click)="ref.close()">Cancelar</button>
        @if (options().length) {
          <button esButton variant="primary" type="submit" form="reserve-form" [loading]="busy()">
            Reservar
          </button>
        }
      </ng-container>
    </es-dialog-shell>
  `,
})
export class ReserveDialog {
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly data = inject<ReserveDialogData>(DIALOG_DATA);
  private readonly api = inject(Api);
  private readonly toast = inject(EsToastService);
  protected readonly qty = fmtQty;

  protected readonly options = computed(() => this.data.stock.filter((s) => s.available > 0));
  protected readonly form = inject(NonNullableFormBuilder).group({
    purpose: '',
    locationId:
      this.options().find((s) => s.locationId === this.data.locationId)?.locationId ??
      this.options()[0]?.locationId ??
      '',
    quantity: '',
  });
  protected readonly fields = signal<Record<string, string>>({});
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected all(): void {
    const s = this.options().find((o) => o.locationId === this.form.controls.locationId.value);
    if (s) this.form.controls.quantity.setValue(String(s.available));
  }

  protected async save(): Promise<void> {
    const v = this.form.getRawValue();
    const amount = v.quantity.replace(',', '.');
    const input: ReservationInput = {
      itemId: this.data.item.id,
      locationId: v.locationId,
      quantity: amount === '' ? Number.NaN : Number(amount),
      purpose: v.purpose,
    };
    const parsed = reservationInputSchema.safeParse(input);
    this.fields.set(parsed.success ? {} : zodErrors(parsed.error));
    this.error.set(null);
    if (!parsed.success) return;
    this.busy.set(true);
    try {
      await this.api.post('/reservations', parsed.data);
      this.toast.show('Reserva creada', { tone: 'success' });
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
