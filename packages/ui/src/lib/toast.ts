import { ChangeDetectionStrategy, Component, inject, Injectable, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { LucideX } from '@lucide/angular';

export type ToastTone = 'neutral' | 'success' | 'warning' | 'danger';

export interface Toast {
  id: number;
  message: string;
  description?: string;
  tone: ToastTone;
}

/**
 * Notificaciones discretas. Se anuncian a lectores de pantalla mediante una
 * región `aria-live` (polite; assertive solo para errores).
 */
@Injectable({ providedIn: 'root' })
export class EsToastService {
  private seq = 0;
  readonly toasts = signal<Toast[]>([]);

  show(message: string, opts: { description?: string; tone?: ToastTone; duration?: number } = {}) {
    const toast: Toast = {
      id: ++this.seq,
      message,
      tone: opts.tone ?? 'neutral',
      ...(opts.description ? { description: opts.description } : {}),
    };
    this.toasts.update((list) => [...list.slice(-4), toast]);
    const duration = opts.duration ?? (toast.tone === 'danger' ? 8000 : 4000);
    if (duration > 0) setTimeout(() => this.dismiss(toast.id), duration);
    return toast.id;
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}

const TONE_BAR: Record<ToastTone, string> = {
  neutral: 'bg-fg-subtle',
  success: 'bg-accent',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

/** Contenedor de notificaciones; colóquelo una vez en el componente raíz. */
@Component({
  selector: 'es-toaster',
  imports: [LucideX, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div aria-live="polite" class="contents">
      @for (t of polite(); track t.id) {
        <ng-container *ngTemplateOutlet="tpl; context: { $implicit: t }" />
      }
    </div>
    <div aria-live="assertive" class="contents">
      @for (t of assertive(); track t.id) {
        <ng-container *ngTemplateOutlet="tpl; context: { $implicit: t }" />
      }
    </div>
    <ng-template #tpl let-t>
      <div
        class="pointer-events-auto flex w-80 items-start gap-2.5 overflow-hidden rounded-md border border-border bg-surface-raised py-2.5 pr-2 pl-3 shadow-md"
        role="status"
      >
        <span class="mt-1 h-3 w-0.5 shrink-0 rounded-full" [class]="bar(t.tone)"></span>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium text-fg">{{ t.message }}</p>
          @if (t.description) {
            <p class="text-xs text-fg-muted">{{ t.description }}</p>
          }
        </div>
        <button
          type="button"
          class="rounded-sm p-0.5 text-fg-subtle hover:text-fg"
          aria-label="Descartar notificación"
          (click)="svc.dismiss(t.id)"
        >
          <svg lucideX [size]="14"></svg>
        </button>
      </div>
    </ng-template>
  `,
  host: { class: 'pointer-events-none fixed right-4 bottom-4 z-50 flex flex-col gap-2' },
})
export class EsToaster {
  protected readonly svc = inject(EsToastService);
  protected polite = () => this.svc.toasts().filter((t) => t.tone !== 'danger');
  protected assertive = () => this.svc.toasts().filter((t) => t.tone === 'danger');
  protected bar(tone: ToastTone): string {
    return TONE_BAR[tone];
  }
}
