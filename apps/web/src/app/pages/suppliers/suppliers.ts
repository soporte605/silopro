import { ChangeDetectionStrategy, Component, inject, resource, signal } from '@angular/core';
import {
  DIALOG_DATA,
  DialogRef,
  EsButton,
  EsDialogService,
  EsDialogShell,
  EsEmptyState,
  EsFormField,
  EsInput,
  EsSkeleton,
  EsTable,
  EsToastService,
} from '@elikarsystems/ui';
import { LucidePencil, LucidePlus, LucideTruck } from '@lucide/angular';
import { type Supplier, supplierInputSchema } from '@silopro/contracts';
import { ApiRequestError, Api } from '../../core/api';
import { zodErrors } from '../../core/forms';
import { SessionService } from '../../core/session';
import { PageHeader } from '../page-header';

type SupplierFields = 'name' | 'contactName' | 'email' | 'phone' | 'website' | 'notes';

const FIELDS: {
  key: SupplierFields;
  label: string;
  type?: string;
  required?: boolean;
  wide?: boolean;
}[] = [
  { key: 'name', label: 'Nombre', required: true, wide: true },
  { key: 'contactName', label: 'Contacto' },
  { key: 'email', label: 'Correo', type: 'email' },
  { key: 'phone', label: 'Teléfono', type: 'tel' },
  { key: 'website', label: 'Sitio web', type: 'url' },
  { key: 'notes', label: 'Notas', wide: true },
];

@Component({
  selector: 'sp-supplier-form',
  imports: [EsDialogShell, EsButton, EsFormField, EsInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full w-full' },
  template: `
    <es-dialog-shell [title]="data ? 'Editar proveedor' : 'Nuevo proveedor'">
      <form
        id="supplier-form"
        class="grid grid-cols-1 gap-3 sm:grid-cols-2"
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
        @for (f of fieldDefs; track f.key) {
          <div [class]="f.wide ? 'sm:col-span-2' : ''">
            <es-form-field
              [label]="f.label"
              [required]="!!f.required"
              [error]="errors()[f.key]"
              #ff="esFormField"
            >
              <input
                esInput
                [id]="ff.controlId"
                [type]="f.type ?? 'text'"
                [value]="values()[f.key]"
                (input)="set(f.key, $any($event.target).value)"
                [attr.aria-describedby]="ff.describedBy()"
                [attr.aria-invalid]="!!errors()[f.key]"
              />
            </es-form-field>
          </div>
        }
      </form>
      <ng-container esDialogFooter>
        <button esButton type="button" (click)="ref.close()">Cancelar</button>
        <button esButton variant="primary" type="submit" form="supplier-form" [loading]="busy()">
          Guardar
        </button>
      </ng-container>
    </es-dialog-shell>
  `,
})
export class SupplierForm {
  protected readonly ref = inject<DialogRef<Supplier>>(DialogRef);
  protected readonly data = inject<Supplier | null>(DIALOG_DATA);
  private readonly api = inject(Api);
  private readonly toast = inject(EsToastService);
  protected readonly fieldDefs = FIELDS;
  protected readonly values = signal<Record<SupplierFields, string>>({
    name: this.data?.name ?? '',
    contactName: this.data?.contactName ?? '',
    email: this.data?.email ?? '',
    phone: this.data?.phone ?? '',
    website: this.data?.website ?? '',
    notes: this.data?.notes ?? '',
  });
  protected readonly errors = signal<Record<string, string>>({});
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected set(key: SupplierFields, value: string): void {
    this.values.update((v) => ({ ...v, [key]: value }));
  }

  protected async save(): Promise<void> {
    const parsed = supplierInputSchema.safeParse(this.values());
    this.errors.set(parsed.success ? {} : zodErrors(parsed.error));
    if (!parsed.success) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const saved = this.data
        ? await this.api.patch<Supplier>(`/suppliers/${this.data.id}`, {
            ...parsed.data,
            version: this.data.version,
          })
        : await this.api.post<Supplier>('/suppliers', parsed.data);
      this.toast.show('Proveedor guardado', { tone: 'success' });
      this.ref.close(saved);
    } catch (e) {
      const err = ApiRequestError.from(e);
      this.errors.set(err.fieldErrors());
      this.error.set(
        err.code === 'DUPLICATE' ? 'Ya existe un proveedor con ese nombre.' : err.message,
      );
    } finally {
      this.busy.set(false);
    }
  }
}

@Component({
  selector: 'sp-suppliers',
  imports: [
    PageHeader,
    EsButton,
    EsEmptyState,
    EsSkeleton,
    EsTable,
    LucidePlus,
    LucidePencil,
    LucideTruck,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-5xl flex-col gap-4 p-4 md:p-6">
      <sp-page-header title="Proveedores" description="A quién se compra cada artículo.">
        @if (session.canWrite()) {
          <button spActions esButton variant="primary" (click)="open()">
            <svg lucidePlus></svg> Nuevo proveedor
          </button>
        }
      </sp-page-header>
      <div class="overflow-x-auto rounded-lg border border-border bg-surface">
        @if (list.isLoading() && !list.hasValue()) {
          <div class="p-3"><es-skeleton class="h-16 w-full" /></div>
        } @else if (!(list.value() ?? []).length) {
          <es-empty-state
            class="m-3"
            title="Sin proveedores"
            description="Registre a sus distribuidores para asociarlos a los artículos."
          >
            <svg esEmptyIcon lucideTruck></svg>
          </es-empty-state>
        } @else {
          <table esTable>
            <caption class="sr-only">
              Proveedores
            </caption>
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Contacto</th>
                <th scope="col">Correo</th>
                <th scope="col">Teléfono</th>
                @if (session.canWrite()) {
                  <th scope="col" class="w-12"><span class="sr-only">Acciones</span></th>
                }
              </tr>
            </thead>
            <tbody>
              @for (s of list.value(); track s.id) {
                <tr>
                  <td class="font-medium">{{ s.name }}</td>
                  <td class="text-fg-muted">{{ s.contactName ?? '—' }}</td>
                  <td class="text-fg-muted">{{ s.email ?? '—' }}</td>
                  <td class="text-fg-muted">{{ s.phone ?? '—' }}</td>
                  @if (session.canWrite()) {
                    <td>
                      <button
                        esButton
                        variant="ghost"
                        size="sm"
                        iconOnly
                        [attr.aria-label]="'Editar ' + s.name"
                        (click)="open(s)"
                      >
                        <svg lucidePencil></svg>
                      </button>
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
export default class Suppliers {
  private readonly api = inject(Api);
  private readonly dialog = inject(EsDialogService);
  protected readonly session = inject(SessionService);

  protected readonly list = resource({
    params: () => this.session.orgId(),
    loader: () => this.api.get<Supplier[]>('/suppliers'),
  });

  protected open(supplier?: Supplier): void {
    this.dialog
      .open<Supplier, Supplier | null>(SupplierForm, {
        data: supplier ?? null,
        ariaLabel: 'Proveedor',
      })
      .closed.subscribe((saved) => saved && this.list.reload());
  }
}
