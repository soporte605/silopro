import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
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
  type Category,
  type Item,
  itemInputSchema,
  type Supplier,
  type Unit,
} from '@silopro/contracts';
import { type AttributeDefinition, effectiveAttributes } from '@silopro/domain';
import { ApiRequestError, Api } from '../../core/api';
import { attributeChain, categoryTree } from '../../core/categories';
import { zodErrors } from '../../core/forms';

export interface ItemFormData {
  item?: Item;
}

type AttrValue = string | boolean;

/** Alta y edición de artículos en panel lateral. */
@Component({
  selector: 'sp-item-form',
  imports: [ReactiveFormsModule, EsDialogShell, EsButton, EsFormField, EsInput, EsSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full w-full' },
  template: `
    <es-dialog-shell
      [title]="editing ? 'Editar artículo' : 'Nuevo artículo'"
      [description]="editing ? data.item?.sku : 'Los campos con * son obligatorios.'"
    >
      <form
        id="item-form"
        class="flex flex-col gap-4"
        [formGroup]="form"
        (ngSubmit)="save()"
        novalidate
      >
        @if (error()) {
          <p class="rounded-md bg-danger-soft px-2.5 py-2 text-sm text-danger" role="alert">
            {{ error() }}
          </p>
        }
        <fieldset class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <legend class="sr-only">Identificación</legend>
          <es-form-field label="SKU" required [error]="fields()['sku']" #f1="esFormField">
            <input
              esInput
              mono
              formControlName="sku"
              [id]="f1.controlId"
              [attr.aria-describedby]="f1.describedBy()"
              [attr.aria-invalid]="!!fields()['sku']"
            />
          </es-form-field>
          <es-form-field
            label="Código interno"
            [error]="fields()['internalCode']"
            #f2="esFormField"
          >
            <input
              esInput
              mono
              formControlName="internalCode"
              [id]="f2.controlId"
              [attr.aria-describedby]="f2.describedBy()"
            />
          </es-form-field>
          <es-form-field
            class="sm:col-span-2"
            label="Nombre"
            required
            [error]="fields()['name']"
            #f3="esFormField"
          >
            <input
              esInput
              formControlName="name"
              [id]="f3.controlId"
              [attr.aria-describedby]="f3.describedBy()"
              [attr.aria-invalid]="!!fields()['name']"
            />
          </es-form-field>
          <es-form-field
            class="sm:col-span-2"
            label="Descripción"
            [error]="fields()['description']"
            #f4="esFormField"
          >
            <textarea
              esInput
              rows="2"
              formControlName="description"
              [id]="f4.controlId"
              [attr.aria-describedby]="f4.describedBy()"
            ></textarea>
          </es-form-field>
          <es-form-field label="Categoría" #f5="esFormField" hint="Define los atributos técnicos.">
            <select
              esSelect
              formControlName="categoryId"
              [id]="f5.controlId"
              [attr.aria-describedby]="f5.describedBy()"
            >
              <option value="">Sin categoría</option>
              @for (c of categoryOptions(); track c.id) {
                <option [value]="c.id">{{ c.label }}</option>
              }
            </select>
          </es-form-field>
          <es-form-field label="Unidad" required [error]="fields()['unitId']" #f6="esFormField">
            <select
              esSelect
              formControlName="unitId"
              [id]="f6.controlId"
              [attr.aria-describedby]="f6.describedBy()"
            >
              @for (u of units.value() ?? []; track u.id) {
                <option [value]="u.id">{{ u.name }} ({{ u.symbol }})</option>
              }
            </select>
          </es-form-field>
          <es-form-field label="Fabricante" #f7="esFormField">
            <input esInput formControlName="manufacturer" [id]="f7.controlId" />
          </es-form-field>
          <es-form-field label="Modelo / número de parte" #f8="esFormField">
            <input esInput formControlName="model" [id]="f8.controlId" />
          </es-form-field>
        </fieldset>

        @if (attributeDefs().length) {
          <fieldset class="border-t border-border pt-3">
            <legend class="sr-only">Atributos de la categoría</legend>
            <p class="mb-2 text-xs font-medium text-fg-muted" aria-hidden="true">
              Atributos de la categoría
            </p>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              @for (def of attributeDefs(); track def.key) {
                <es-form-field
                  [label]="def.unit ? def.label + ' (' + def.unit + ')' : def.label"
                  [required]="!!def.required"
                  [error]="attrErrors()[def.key]"
                  #af="esFormField"
                >
                  @switch (def.type) {
                    @case ('boolean') {
                      <select
                        esSelect
                        [id]="af.controlId"
                        [value]="attrString(def.key)"
                        (change)="setAttr(def.key, $any($event.target).value)"
                        [attr.aria-describedby]="af.describedBy()"
                      >
                        <option value="">—</option>
                        <option value="true">Sí</option>
                        <option value="false">No</option>
                      </select>
                    }
                    @case ('select') {
                      <select
                        esSelect
                        [id]="af.controlId"
                        [value]="attrString(def.key)"
                        (change)="setAttr(def.key, $any($event.target).value)"
                        [attr.aria-describedby]="af.describedBy()"
                      >
                        <option value="">—</option>
                        @for (o of def.options ?? []; track o) {
                          <option [value]="o">{{ o }}</option>
                        }
                      </select>
                    }
                    @default {
                      <input
                        esInput
                        [id]="af.controlId"
                        [attr.inputmode]="def.type === 'number' ? 'decimal' : null"
                        [value]="attrString(def.key)"
                        (input)="setAttr(def.key, $any($event.target).value)"
                        [attr.aria-describedby]="af.describedBy()"
                        [attr.aria-invalid]="!!attrErrors()[def.key]"
                      />
                    }
                  }
                </es-form-field>
              }
            </div>
          </fieldset>
        }

        <fieldset class="border-t border-border pt-3">
          <legend class="sr-only">Costos y control</legend>
          <p class="mb-2 text-xs font-medium text-fg-muted" aria-hidden="true">Costos y control</p>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <es-form-field label="Costo unitario" [error]="fields()['cost']" #c1="esFormField">
              <input
                esInput
                inputmode="decimal"
                formControlName="cost"
                [id]="c1.controlId"
                [attr.aria-describedby]="c1.describedBy()"
              />
            </es-form-field>
            <es-form-field label="Precio de venta" [error]="fields()['price']" #c2="esFormField">
              <input
                esInput
                inputmode="decimal"
                formControlName="price"
                [id]="c2.controlId"
                [attr.aria-describedby]="c2.describedBy()"
              />
            </es-form-field>
            <es-form-field
              label="Existencia mínima"
              [error]="fields()['minStock']"
              hint="Alerta al llegar a este valor."
              #c3="esFormField"
            >
              <input
                esInput
                inputmode="decimal"
                formControlName="minStock"
                [id]="c3.controlId"
                [attr.aria-describedby]="c3.describedBy()"
              />
            </es-form-field>
          </div>
        </fieldset>

        @if ((suppliers.value() ?? []).length) {
          <fieldset class="border-t border-border pt-3">
            <legend class="sr-only">Proveedores</legend>
            <p class="mb-2 text-xs font-medium text-fg-muted" aria-hidden="true">Proveedores</p>
            <div class="flex flex-wrap gap-x-4 gap-y-1.5">
              @for (s of suppliers.value() ?? []; track s.id) {
                <label class="flex cursor-pointer items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    class="accent-primary"
                    [checked]="supplierIds().has(s.id)"
                    (change)="toggleSupplier(s.id, $any($event.target).checked)"
                  />
                  {{ s.name }}
                </label>
              }
            </div>
          </fieldset>
        }
      </form>
      <ng-container esDialogFooter>
        <button esButton type="button" (click)="ref.close()">Cancelar</button>
        <button esButton variant="primary" type="submit" form="item-form" [loading]="busy()">
          {{ editing ? 'Guardar cambios' : 'Crear artículo' }}
        </button>
      </ng-container>
    </es-dialog-shell>
  `,
})
export class ItemForm {
  protected readonly ref = inject<DialogRef<Item>>(DialogRef);
  protected readonly data = inject<ItemFormData>(DIALOG_DATA);
  private readonly api = inject(Api);
  private readonly toast = inject(EsToastService);
  protected readonly editing = !!this.data.item;

  protected readonly form = inject(NonNullableFormBuilder).group({
    sku: this.data.item?.sku ?? '',
    internalCode: this.data.item?.internalCode ?? '',
    name: this.data.item?.name ?? '',
    description: this.data.item?.description ?? '',
    categoryId: this.data.item?.categoryId ?? '',
    unitId: this.data.item?.unitId ?? '',
    manufacturer: this.data.item?.manufacturer ?? '',
    model: this.data.item?.model ?? '',
    cost: this.data.item?.cost?.toString() ?? '',
    price: this.data.item?.price?.toString() ?? '',
    minStock: this.data.item?.minStock?.toString() ?? '',
  });

  protected readonly units = resource({
    loader: async () => {
      const list = await this.api.get<Unit[]>('/units');
      if (!this.form.controls.unitId.value && list[0]) {
        const pieces = list.find((u) => u.code === 'pza') ?? list[0];
        this.form.controls.unitId.setValue(pieces.id);
      }
      return list;
    },
  });
  protected readonly categories = resource({
    loader: () => this.api.get<Category[]>('/categories'),
  });
  protected readonly suppliers = resource({ loader: () => this.api.get<Supplier[]>('/suppliers') });
  protected readonly categoryOptions = computed(() => categoryTree(this.categories.value() ?? []));

  private readonly categoryId = toSignal(this.form.controls.categoryId.valueChanges, {
    initialValue: this.form.controls.categoryId.value,
  });
  protected readonly attributeDefs = computed<AttributeDefinition[]>(() =>
    effectiveAttributes(attributeChain(this.categories.value() ?? [], this.categoryId() || null)),
  );

  private readonly attrs = signal<Record<string, AttrValue>>(
    Object.fromEntries(
      Object.entries(this.data.item?.attributes ?? {}).map(([k, v]) => [
        k,
        typeof v === 'number' ? String(v) : v,
      ]),
    ),
  );
  protected readonly supplierIds = signal(new Set(this.data.item?.supplierIds ?? []));
  protected readonly fields = signal<Record<string, string>>({});
  protected readonly attrErrors = signal<Record<string, string>>({});
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected attrString(key: string): string {
    const v = this.attrs()[key];
    return v === undefined ? '' : String(v);
  }

  protected setAttr(key: string, value: string): void {
    this.attrs.update((a) => ({ ...a, [key]: value }));
  }

  protected toggleSupplier(id: string, on: boolean): void {
    this.supplierIds.update((set) => {
      const next = new Set(set);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  /** Valores de atributos tipados; los vacíos se omiten. */
  private attributePayload(): Record<string, string | number | boolean> {
    const out: Record<string, string | number | boolean> = {};
    for (const def of this.attributeDefs()) {
      const raw = this.attrs()[def.key];
      if (raw === undefined || raw === '') continue;
      if (def.type === 'boolean') out[def.key] = raw === true || raw === 'true';
      else if (def.type === 'number') out[def.key] = Number(String(raw).replace(',', '.'));
      else out[def.key] = String(raw);
    }
    return out;
  }

  protected async save(): Promise<void> {
    const v = this.form.getRawValue();
    const num = (s: string) => (s.trim() === '' ? null : s.replace(',', '.'));
    const input = {
      ...v,
      internalCode: v.internalCode || null,
      description: v.description || null,
      categoryId: v.categoryId || null,
      manufacturer: v.manufacturer || null,
      model: v.model || null,
      cost: num(v.cost),
      price: num(v.price),
      minStock: num(v.minStock),
      attributes: this.attributePayload(),
      supplierIds: [...this.supplierIds()],
    };
    const parsed = itemInputSchema.safeParse(input);
    this.fields.set(parsed.success ? {} : zodErrors(parsed.error));
    this.attrErrors.set({});
    this.error.set(null);
    if (!parsed.success) return;

    this.busy.set(true);
    try {
      const item = this.data.item
        ? await this.api.patch<Item>(`/items/${this.data.item.id}`, {
            ...input,
            version: this.data.item.version,
          })
        : await this.api.post<Item>('/items', input);
      this.toast.show(this.editing ? 'Artículo actualizado' : 'Artículo creado', {
        tone: 'success',
        description: item.sku,
      });
      this.ref.close(item);
    } catch (e) {
      const err = ApiRequestError.from(e);
      if (err.code === 'UNPROCESSABLE') this.attrErrors.set(err.fieldErrors());
      else this.fields.set(err.fieldErrors());
      this.error.set(err.code === 'DUPLICATE' ? 'Ya existe un artículo con ese SKU.' : err.message);
    } finally {
      this.busy.set(false);
    }
  }
}
