import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import {
  DIALOG_DATA,
  DialogRef,
  EsButton,
  EsDialogShell,
  EsFormField,
  EsInput,
  EsToastService,
} from '@elikarsystems/ui';
import { type Reservation, reservationConsumeSchema } from '@silopro/contracts';
import { ApiRequestError, Api } from '../../core/api';
import { fmtQty } from '../../core/format';
import { zodErrors } from '../../core/forms';

/** Saca del inventario lo apartado en una reserva (todo o una parte). */
@Component({
  selector: 'sp-consume-dialog',
  imports: [ReactiveFormsModule, EsDialogShell, EsButton, EsFormField, EsInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full w-full' },
  template: `
    <es-dialog-shell
      title="Consumir reserva"
      [description]="data.purpose + ' · ' + data.sku + ' · ' + data.locationPath"
    >
      <form
        id="consume-form"
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
          label="Cantidad usada"
          required
          [error]="fields()['quantity']"
          [hint]="
            'Apartado: ' +
            qty(data.remaining) +
            ' ' +
            data.unitSymbol +
            '. Lo que no use sigue reservado.'
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
        <es-form-field label="Nota" [error]="fields()['reason']" #r="esFormField">
          <input esInput formControlName="reason" [id]="r.controlId" />
        </es-form-field>
      </form>
      <ng-container esDialogFooter>
        <button esButton type="button" (click)="ref.close()">Cancelar</button>
        <button esButton variant="primary" type="submit" form="consume-form" [loading]="busy()">
          Consumir
        </button>
      </ng-container>
    </es-dialog-shell>
  `,
})
export class ConsumeDialog {
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly data = inject<Reservation>(DIALOG_DATA);
  private readonly api = inject(Api);
  private readonly toast = inject(EsToastService);
  protected readonly qty = fmtQty;
  protected readonly form = inject(NonNullableFormBuilder).group({
    quantity: String(this.data.remaining),
    reason: '',
  });
  protected readonly fields = signal<Record<string, string>>({});
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected async save(): Promise<void> {
    const v = this.form.getRawValue();
    const amount = v.quantity.replace(',', '.');
    const parsed = reservationConsumeSchema.safeParse({
      quantity: amount === '' ? Number.NaN : Number(amount),
      ...(v.reason ? { reason: v.reason } : {}),
    });
    this.fields.set(parsed.success ? {} : zodErrors(parsed.error));
    this.error.set(null);
    if (!parsed.success) return;
    this.busy.set(true);
    try {
      await this.api.post(`/reservations/${this.data.id}/consume`, parsed.data);
      this.toast.show('Consumo registrado', { tone: 'success' });
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
