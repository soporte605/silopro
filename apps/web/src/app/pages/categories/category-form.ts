import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
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
import { LucidePlus, LucideTrash2 } from '@lucide/angular';
import { type Category, categoryInputSchema } from '@silopro/contracts';
import {
  ATTRIBUTE_TYPES,
  type AttributeDefinition,
  type AttributeType,
  effectiveAttributes,
  validateAttributeDefinitions,
} from '@silopro/domain';
import { ApiRequestError, Api } from '../../core/api';
import { attributeChain, categoryTree } from '../../core/categories';
import { zodErrors } from '../../core/forms';

export interface CategoryFormData {
  category?: Category;
  all: Category[];
}

const TYPE_LABELS: Record<AttributeType, string> = {
  text: 'Texto',
  number: 'Número',
  boolean: 'Sí / No',
  select: 'Lista de opciones',
};

interface AttrRow {
  uid: number;
  key: string;
  label: string;
  type: AttributeType;
  unit: string;
  required: boolean;
  options: string;
  /** Clave fijada (atributo existente): no se regenera desde la etiqueta. */
  lockedKey: boolean;
}

/** Clave estable a partir de la etiqueta: "Voltaje máx." → "voltaje_max". */
export function slugKey(label: string): string {
  const s = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return /^[a-z]/.test(s) ? s : s ? `a_${s}`.slice(0, 40) : '';
}

let uid = 0;

@Component({
  selector: 'sp-category-form',
  imports: [EsDialogShell, EsButton, EsFormField, EsInput, EsSelect, LucidePlus, LucideTrash2],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full w-full' },
  template: `
    <es-dialog-shell
      [title]="data.category ? 'Editar categoría' : 'Nueva categoría'"
      description="Los atributos se heredan a las subcategorías."
    >
      <form
        id="category-form"
        class="flex flex-col gap-4"
        (submit)="$event.preventDefault(); save()"
        novalidate
      >
        @if (error()) {
          <p class="rounded-md bg-danger-soft px-2.5 py-2 text-sm text-danger" role="alert">
            {{ error() }}
          </p>
        }
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
          <es-form-field label="Categoría padre" [error]="fields()['parentId']" #p="esFormField">
            <select
              esSelect
              [id]="p.controlId"
              [value]="parentId()"
              (change)="parentId.set($any($event.target).value)"
              [attr.aria-describedby]="p.describedBy()"
            >
              <option value="">— Ninguna (raíz) —</option>
              @for (c of parentOptions(); track c.id) {
                <option [value]="c.id">{{ c.label }}</option>
              }
            </select>
          </es-form-field>
          <es-form-field class="sm:col-span-2" label="Descripción" #d="esFormField">
            <input
              esInput
              [id]="d.controlId"
              [value]="description()"
              (input)="description.set($any($event.target).value)"
            />
          </es-form-field>
        </div>

        @if (inherited().length) {
          <p class="text-xs text-fg-muted">Hereda: {{ inheritedLabels() }}</p>
        }

        <fieldset class="flex flex-col gap-2 border-t border-border pt-3">
          <legend class="sr-only">Atributos propios</legend>
          <div class="flex items-center justify-between text-xs font-medium text-fg-muted">
            <span aria-hidden="true">Atributos propios</span>
            <button esButton size="sm" type="button" (click)="addRow()">
              <svg lucidePlus></svg> Añadir atributo
            </button>
          </div>
          @if (!rows().length) {
            <p class="text-sm text-fg-subtle">
              Sin atributos propios. Ejemplo: en «Resistencias» añada «Valor (Ω)», «Tolerancia» y
              «Potencia (W)».
            </p>
          }
          @for (row of rows(); track row.uid; let i = $index) {
            <div
              class="grid grid-cols-2 gap-2 rounded-md border border-border p-2 sm:grid-cols-[1fr_9rem_5rem_auto]"
              role="group"
              [attr.aria-label]="'Atributo ' + (i + 1)"
            >
              <es-form-field label="Etiqueta" [error]="rowError(row)" #rl="esFormField">
                <input
                  esInput
                  size="sm"
                  [id]="rl.controlId"
                  [value]="row.label"
                  (input)="patchRow(row.uid, { label: $any($event.target).value })"
                  [attr.aria-describedby]="rl.describedBy()"
                />
              </es-form-field>
              <es-form-field label="Tipo" #rt="esFormField">
                <select
                  esSelect
                  class="h-6 text-xs"
                  [id]="rt.controlId"
                  [value]="row.type"
                  (change)="patchRow(row.uid, { type: $any($event.target).value })"
                >
                  @for (t of types; track t) {
                    <option [value]="t">{{ typeLabel(t) }}</option>
                  }
                </select>
              </es-form-field>
              <es-form-field label="Unidad" #ru="esFormField">
                <input
                  esInput
                  size="sm"
                  [id]="ru.controlId"
                  [value]="row.unit"
                  [disabled]="row.type !== 'number'"
                  (input)="patchRow(row.uid, { unit: $any($event.target).value })"
                />
              </es-form-field>
              <div class="flex items-end gap-2 pb-0.5">
                <label class="flex h-6 items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    class="accent-primary"
                    [checked]="row.required"
                    (change)="patchRow(row.uid, { required: $any($event.target).checked })"
                  />
                  Obligatorio
                </label>
                <button
                  esButton
                  variant="ghost"
                  size="sm"
                  iconOnly
                  type="button"
                  [attr.aria-label]="'Quitar atributo ' + (row.label || i + 1)"
                  (click)="removeRow(row.uid)"
                >
                  <svg lucideTrash2></svg>
                </button>
              </div>
              @if (row.type === 'select') {
                <es-form-field
                  class="col-span-full"
                  label="Opciones"
                  hint="Separadas por coma."
                  #ro="esFormField"
                >
                  <input
                    esInput
                    size="sm"
                    [id]="ro.controlId"
                    [value]="row.options"
                    (input)="patchRow(row.uid, { options: $any($event.target).value })"
                    [attr.aria-describedby]="ro.describedBy()"
                  />
                </es-form-field>
              }
              <p class="col-span-full font-mono text-2xs text-fg-subtle">
                clave: {{ row.key || '—' }}
              </p>
            </div>
          }
        </fieldset>
      </form>
      <ng-container esDialogFooter>
        <button esButton type="button" (click)="ref.close()">Cancelar</button>
        <button esButton variant="primary" type="submit" form="category-form" [loading]="busy()">
          {{ data.category ? 'Guardar cambios' : 'Crear categoría' }}
        </button>
      </ng-container>
    </es-dialog-shell>
  `,
})
export class CategoryForm {
  protected readonly ref = inject<DialogRef<Category>>(DialogRef);
  protected readonly data = inject<CategoryFormData>(DIALOG_DATA);
  private readonly api = inject(Api);
  private readonly toast = inject(EsToastService);
  protected readonly types = ATTRIBUTE_TYPES;

  protected readonly name = signal(this.data.category?.name ?? '');
  protected readonly parentId = signal(this.data.category?.parentId ?? '');
  protected readonly description = signal(this.data.category?.description ?? '');
  protected readonly rows = signal<AttrRow[]>(
    (this.data.category?.attributes ?? []).map((a) => ({
      uid: ++uid,
      key: a.key,
      label: a.label,
      type: a.type,
      unit: a.unit ?? '',
      required: !!a.required,
      options: (a.options ?? []).join(', '),
      lockedKey: true,
    })),
  );
  protected readonly fields = signal<Record<string, string>>({});
  protected readonly rowIssues = signal<Record<string, string>>({});
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  /** Excluye la propia categoría y sus descendientes (evita ciclos). */
  protected readonly parentOptions = computed(() => {
    const self = this.data.category?.id;
    if (!self) return categoryTree(this.data.all);
    const blocked = new Set([self]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const c of this.data.all) {
        if (c.parentId && blocked.has(c.parentId) && !blocked.has(c.id)) {
          blocked.add(c.id);
          grew = true;
        }
      }
    }
    return categoryTree(this.data.all).filter((o) => !blocked.has(o.id));
  });

  protected readonly inherited = computed(() =>
    effectiveAttributes(attributeChain(this.data.all, this.parentId() || null)),
  );
  protected readonly inheritedLabels = computed(() =>
    this.inherited()
      .map((a) => a.label)
      .join(', '),
  );

  protected typeLabel(t: AttributeType): string {
    return TYPE_LABELS[t];
  }

  protected addRow(): void {
    this.rows.update((r) => [
      ...r,
      {
        uid: ++uid,
        key: '',
        label: '',
        type: 'text',
        unit: '',
        required: false,
        options: '',
        lockedKey: false,
      },
    ]);
  }

  protected removeRow(id: number): void {
    this.rows.update((r) => r.filter((x) => x.uid !== id));
  }

  protected patchRow(id: number, patch: Partial<AttrRow>): void {
    this.rows.update((list) =>
      list.map((r) => {
        if (r.uid !== id) return r;
        const next = { ...r, ...patch };
        if (patch.label !== undefined && !r.lockedKey) next.key = slugKey(patch.label);
        return next;
      }),
    );
  }

  protected rowError(row: AttrRow): string | null {
    return this.rowIssues()[row.key] ?? null;
  }

  private definitions(): AttributeDefinition[] {
    return this.rows().map((r) => ({
      key: r.key,
      label: r.label.trim(),
      type: r.type,
      ...(r.type === 'number' && r.unit.trim() ? { unit: r.unit.trim() } : {}),
      ...(r.required ? { required: true } : {}),
      ...(r.type === 'select'
        ? {
            options: r.options
              .split(',')
              .map((o) => o.trim())
              .filter(Boolean),
          }
        : {}),
    }));
  }

  protected async save(): Promise<void> {
    const attributes = this.definitions();
    const input = {
      name: this.name(),
      parentId: this.parentId() || null,
      description: this.description() || null,
      attributes,
    };
    const parsed = categoryInputSchema.safeParse(input);
    const issues = [
      ...attributes
        .filter((d) => !d.label)
        .map((d) => ({ key: d.key, message: 'Escriba una etiqueta' })),
      ...validateAttributeDefinitions(attributes),
    ];
    this.fields.set(parsed.success ? {} : zodErrors(parsed.error));
    this.rowIssues.set(Object.fromEntries(issues.reverse().map((i) => [i.key, i.message])));
    this.error.set(issues.length ? 'Revise los atributos marcados.' : null);
    if (!parsed.success || issues.length) return;

    this.busy.set(true);
    try {
      const cat = this.data.category
        ? await this.api.patch<Category>(`/categories/${this.data.category.id}`, {
            ...input,
            version: this.data.category.version,
          })
        : await this.api.post<Category>('/categories', input);
      this.toast.show(this.data.category ? 'Categoría actualizada' : 'Categoría creada', {
        tone: 'success',
      });
      this.ref.close(cat);
    } catch (e) {
      const err = ApiRequestError.from(e);
      this.fields.set(err.fieldErrors());
      this.error.set(
        err.code === 'DUPLICATE'
          ? 'Ya existe una categoría con ese nombre en ese nivel.'
          : err.message,
      );
    } finally {
      this.busy.set(false);
    }
  }
}
