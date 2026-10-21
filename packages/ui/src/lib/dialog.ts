import { Dialog, DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { Overlay } from '@angular/cdk/overlay';
import type { ComponentType } from '@angular/cdk/portal';
import { ChangeDetectionStrategy, Component, inject, Injectable, input } from '@angular/core';
import { LucideX } from '@lucide/angular';
import { EsButton } from './button';

export interface EsDialogOptions<D> {
  data?: D;
  /** `center`: diálogo modal. `right`: panel lateral (drawer). */
  placement?: 'center' | 'right';
  size?: 'sm' | 'md' | 'lg';
  ariaLabel?: string;
}

const WIDTHS = { sm: '380px', md: '520px', lg: '720px' } as const;

/**
 * Apertura de diálogos y paneles laterales sobre Angular CDK Dialog, que
 * aporta captura de foco, restauración del foco, cierre con Escape,
 * `aria-modal` y bloqueo de desplazamiento.
 */
@Injectable({ providedIn: 'root' })
export class EsDialogService {
  private readonly dialog = inject(Dialog);
  private readonly overlay = inject(Overlay);

  open<R = unknown, D = unknown, C = unknown>(
    component: ComponentType<C>,
    options: EsDialogOptions<D> = {},
  ): DialogRef<R, C> {
    const placement = options.placement ?? 'center';
    const size = options.size ?? 'md';
    return this.dialog.open<R, D, C>(component, {
      data: options.data,
      ariaLabel: options.ariaLabel,
      autoFocus: 'first-tabbable',
      restoreFocus: true,
      backdropClass: 'es-backdrop',
      panelClass: ['es-dialog-panel', `es-dialog-${placement}`],
      ...(placement === 'right'
        ? {
            width: WIDTHS[size],
            height: '100%',
            maxWidth: '100vw',
            positionStrategy: this.overlay.position().global().top('0').right('0'),
          }
        : { width: WIDTHS[size], maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 64px)' }),
    });
  }
}

export { DIALOG_DATA, DialogRef };

/**
 * Estructura visual de un diálogo: encabezado con título y cierre, cuerpo
 * desplazable y pie con acciones (`[esDialogFooter]`).
 */
@Component({
  selector: 'es-dialog-shell',
  imports: [EsButton, LucideX],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="flex items-start gap-3 border-b border-border px-4 py-3">
      <div class="min-w-0 flex-1">
        <h2 class="text-base font-semibold text-fg" [id]="titleId">{{ title() }}</h2>
        @if (description()) {
          <p class="mt-0.5 text-xs text-fg-muted">{{ description() }}</p>
        }
      </div>
      <button esButton variant="ghost" size="sm" iconOnly aria-label="Cerrar" (click)="ref.close()">
        <svg lucideX></svg>
      </button>
    </header>
    <div class="min-h-0 flex-1 overflow-auto px-4 py-3"><ng-content /></div>
    <footer class="flex justify-end gap-2 border-t border-border px-4 py-2.5 empty:hidden">
      <ng-content select="[esDialogFooter]" />
    </footer>
  `,
  host: {
    class: 'flex h-full max-h-[inherit] w-full min-w-0 flex-1 flex-col bg-surface-raised text-fg',
    role: 'document',
    '[attr.aria-labelledby]': 'titleId',
  },
})
export class EsDialogShell {
  protected readonly ref = inject(DialogRef);
  readonly title = input.required<string>();
  readonly description = input<string>();
  protected readonly titleId = `es-dialog-title-${Math.random().toString(36).slice(2, 8)}`;
}
