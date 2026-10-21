import { ChangeDetectionStrategy, Component, inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  DIALOG_DATA,
  DialogRef,
  EsButton,
  EsDialogService,
  EsDialogShell,
} from '@elikarsystems/ui';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

@Component({
  selector: 'sp-confirm-dialog',
  imports: [EsDialogShell, EsButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full w-full' },
  template: `
    <es-dialog-shell [title]="data.title">
      <p class="text-sm text-fg-muted">{{ data.message }}</p>
      <ng-container esDialogFooter>
        <button esButton (click)="ref.close(false)">Cancelar</button>
        <button esButton [variant]="data.danger ? 'danger' : 'primary'" (click)="ref.close(true)">
          {{ data.confirmLabel ?? 'Confirmar' }}
        </button>
      </ng-container>
    </es-dialog-shell>
  `,
})
class ConfirmDialog {
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
  protected readonly data = inject<ConfirmOptions>(DIALOG_DATA);
}

/** Confirmación accesible en lugar de `window.confirm`. */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly dialog = inject(EsDialogService);

  async ask(options: ConfirmOptions): Promise<boolean> {
    const ref = this.dialog.open<boolean, ConfirmOptions>(ConfirmDialog, {
      data: options,
      size: 'sm',
      ariaLabel: options.title,
    });
    return (await firstValueFrom(ref.closed)) === true;
  }
}
