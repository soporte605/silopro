import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DialogRef } from '@angular/cdk/dialog';
import { EsButton, EsDialogShell, EsFormField, EsInput, EsToastService } from '@elikarsystems/ui';

@Component({
  selector: 'sp-example-dialog',
  imports: [EsDialogShell, EsButton, EsFormField, EsInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <es-dialog-shell
      title="Transferir existencias"
      description="Mover piezas entre ubicaciones (demostración)."
    >
      <div class="flex flex-col gap-3">
        <es-form-field label="Cantidad" #f="esFormField">
          <input esInput type="number" value="10" [id]="f.controlId" />
        </es-form-field>
        <es-form-field
          label="Destino"
          hint="Escriba o escanee un código de ubicación"
          #g="esFormField"
        >
          <input
            esInput
            mono
            value="GAB-1 / C5"
            [id]="g.controlId"
            [attr.aria-describedby]="g.describedBy()"
          />
        </es-form-field>
      </div>
      <ng-container esDialogFooter>
        <button esButton (click)="ref.close()">Cancelar</button>
        <button esButton variant="primary" (click)="confirm()">Transferir</button>
      </ng-container>
    </es-dialog-shell>
  `,
  host: { class: 'flex h-full w-full' },
})
export class ExampleDialog {
  protected readonly ref = inject(DialogRef);
  private readonly toast = inject(EsToastService);

  protected confirm(): void {
    this.ref.close(true);
    this.toast.show('Transferencia registrada (demo)', { tone: 'success' });
  }
}
