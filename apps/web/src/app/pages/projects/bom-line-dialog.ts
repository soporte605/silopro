import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import {
  DIALOG_DATA,
  DialogRef,
  EsButton,
  EsDialogShell,
  EsFormField,
  EsInput,
} from '@elikarsystems/ui';
import { bomLineUpdateSchema, type BomLineUpdate, type ProjectDetail } from '@silopro/contracts';
import { ApiRequestError, Api } from '../../core/api';
import { zodErrors } from '../../core/forms';

export interface BomLineDialogData {
  projectId: string;
  /** Artículo nuevo para la lista… */
  item?: { id: string; sku: string; name: string; unitSymbol: string };
  /** …o línea existente a editar. */
  line?: {
    id: string;
    sku: string;
    itemName: string;
    unitSymbol: string;
    required: number;
    notes: string | null;
  };
}

/** Cantidad necesaria (y notas) de un artículo en la lista de materiales. */
@Component({
  selector: 'sp-bom-line-dialog',
  imports: [ReactiveFormsModule, EsDialogShell, EsButton, EsFormField, EsInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full w-full' },
  template: `
    <es-dialog-shell
      [title]="data.line ? 'Editar material' : 'Agregar material'"
      [description]="sku + ' · ' + name"
    >
      <form
        id="bom-form"
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
          [label]="'Cantidad necesaria (' + unit + ')'"
          required
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
        <es-form-field label="Notas" [error]="fields()['notes']" #n="esFormField">
          <input
            esInput
            formControlName="notes"
            placeholder="p. ej. para el chasis"
            [id]="n.controlId"
            [attr.aria-describedby]="n.describedBy()"
          />
        </es-form-field>
        @if (!data.line) {
          <p class="text-xs text-fg-muted">
            Si el artículo ya está en la lista, se suma la cantidad.
          </p>
        }
      </form>
      <ng-container esDialogFooter>
        <button esButton type="button" (click)="ref.close()">Cancelar</button>
        <button esButton variant="primary" type="submit" form="bom-form" [loading]="busy()">
          {{ data.line ? 'Guardar' : 'Agregar' }}
        </button>
      </ng-container>
    </es-dialog-shell>
  `,
})
export class BomLineDialog {
  protected readonly ref = inject<DialogRef<ProjectDetail>>(DialogRef);
  protected readonly data = inject<BomLineDialogData>(DIALOG_DATA);
  private readonly api = inject(Api);

  protected readonly sku = this.data.line?.sku ?? this.data.item?.sku ?? '';
  protected readonly name = this.data.line?.itemName ?? this.data.item?.name ?? '';
  protected readonly unit = this.data.line?.unitSymbol ?? this.data.item?.unitSymbol ?? '';
  protected readonly form = inject(NonNullableFormBuilder).group({
    quantity: this.data.line ? String(this.data.line.required) : '',
    notes: this.data.line?.notes ?? '',
  });
  protected readonly fields = signal<Record<string, string>>({});
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected async save(): Promise<void> {
    const v = this.form.getRawValue();
    const amount = v.quantity.replace(',', '.');
    const input: BomLineUpdate = {
      quantity: amount === '' ? Number.NaN : Number(amount),
      notes: v.notes,
    };
    const parsed = bomLineUpdateSchema.safeParse(input);
    this.fields.set(parsed.success ? {} : zodErrors(parsed.error));
    this.error.set(null);
    if (!parsed.success) return;
    this.busy.set(true);
    const base = `/projects/${this.data.projectId}/lines`;
    try {
      const saved = this.data.line
        ? await this.api.patch<ProjectDetail>(`${base}/${this.data.line.id}`, parsed.data)
        : await this.api.post<ProjectDetail>(base, { ...parsed.data, itemId: this.data.item!.id });
      this.ref.close(saved);
    } catch (e) {
      const err = ApiRequestError.from(e);
      this.fields.set(err.fieldErrors());
      this.error.set(err.message);
    } finally {
      this.busy.set(false);
    }
  }
}
