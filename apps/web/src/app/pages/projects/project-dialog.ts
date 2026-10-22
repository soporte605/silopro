import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
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
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_VALUES,
  type ProjectDetail,
  type ProjectInput,
  projectInputSchema,
  type ProjectSummary,
} from '@silopro/contracts';
import { ApiRequestError, Api } from '../../core/api';
import { zodErrors } from '../../core/forms';

/** Crea un proyecto (sin datos) o edita el que recibe. Cierra con el proyecto guardado. */
@Component({
  selector: 'sp-project-dialog',
  imports: [ReactiveFormsModule, EsDialogShell, EsButton, EsFormField, EsInput, EsSelect],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full w-full' },
  template: `
    <es-dialog-shell
      [title]="data ? 'Editar proyecto' : 'Nuevo proyecto'"
      description="Un proyecto, pedido u orden de trabajo con su lista de materiales."
    >
      <form
        id="project-form"
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
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr]">
          <es-form-field label="Código" required [error]="fields()['code']" #c="esFormField">
            <input
              esInput
              formControlName="code"
              placeholder="ROBOT-01"
              autocapitalize="characters"
              [id]="c.controlId"
              [attr.aria-describedby]="c.describedBy()"
            />
          </es-form-field>
          <es-form-field label="Nombre" required [error]="fields()['name']" #n="esFormField">
            <input
              esInput
              formControlName="name"
              placeholder="Robot seguidor de línea"
              [id]="n.controlId"
              [attr.aria-describedby]="n.describedBy()"
            />
          </es-form-field>
        </div>
        <es-form-field label="Descripción" [error]="fields()['description']" #d="esFormField">
          <textarea
            esInput
            rows="2"
            formControlName="description"
            [id]="d.controlId"
            [attr.aria-describedby]="d.describedBy()"
          ></textarea>
        </es-form-field>
        <div class="grid grid-cols-2 gap-3">
          <es-form-field label="Estado" #s="esFormField">
            <select esSelect formControlName="status" [id]="s.controlId">
              @for (v of statuses; track v) {
                <option [value]="v">{{ labels[v] }}</option>
              }
            </select>
          </es-form-field>
          <es-form-field label="Fecha de entrega" [error]="fields()['dueDate']" #f="esFormField">
            <input
              esInput
              type="date"
              formControlName="dueDate"
              [id]="f.controlId"
              [attr.aria-describedby]="f.describedBy()"
            />
          </es-form-field>
        </div>
      </form>
      <ng-container esDialogFooter>
        <button esButton type="button" (click)="ref.close()">Cancelar</button>
        <button esButton variant="primary" type="submit" form="project-form" [loading]="busy()">
          {{ data ? 'Guardar' : 'Crear proyecto' }}
        </button>
      </ng-container>
    </es-dialog-shell>
  `,
})
export class ProjectDialog {
  protected readonly ref = inject<DialogRef<ProjectDetail>>(DialogRef);
  protected readonly data = inject<ProjectSummary | null>(DIALOG_DATA, { optional: true });
  private readonly api = inject(Api);
  private readonly toast = inject(EsToastService);
  protected readonly statuses = PROJECT_STATUS_VALUES;
  protected readonly labels = PROJECT_STATUS_LABELS;

  protected readonly form = inject(NonNullableFormBuilder).group({
    code: this.data?.code ?? '',
    name: this.data?.name ?? '',
    description: this.data?.description ?? '',
    status: this.data?.status ?? 'active',
    dueDate: this.data?.dueDate ?? '',
  });
  protected readonly fields = signal<Record<string, string>>({});
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);

  protected async save(): Promise<void> {
    const parsed = projectInputSchema.safeParse(this.form.getRawValue() satisfies ProjectInput);
    this.fields.set(parsed.success ? {} : zodErrors(parsed.error));
    this.error.set(null);
    if (!parsed.success) return;
    this.busy.set(true);
    try {
      const saved = this.data
        ? await this.api.patch<ProjectDetail>(`/projects/${this.data.id}`, {
            ...parsed.data,
            version: this.data.version,
          })
        : await this.api.post<ProjectDetail>('/projects', parsed.data);
      this.toast.show(this.data ? 'Proyecto guardado' : 'Proyecto creado', { tone: 'success' });
      this.ref.close(saved);
    } catch (e) {
      const err = ApiRequestError.from(e);
      this.fields.set(err.fieldErrors());
      this.error.set(
        err.code === 'DUPLICATE' ? 'Ya existe un proyecto con ese código' : err.message,
      );
    } finally {
      this.busy.set(false);
    }
  }
}
