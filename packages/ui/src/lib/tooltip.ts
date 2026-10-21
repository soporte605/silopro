import { Overlay, type OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Directive,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';

let nextId = 0;

@Component({
  selector: 'es-tooltip-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '{{ text() }}',
  host: {
    role: 'tooltip',
    '[id]': 'id()',
    class:
      'pointer-events-none block max-w-64 rounded-sm bg-fg px-2 py-1 text-2xs font-medium text-bg shadow-md',
  },
})
export class EsTooltipPanel {
  readonly text = signal('');
  readonly id = signal('');
}

/**
 * Tooltip accesible: aparece con hover y con foco de teclado, se oculta con
 * Escape y se asocia al disparador mediante `aria-describedby`.
 * No use tooltips para información imprescindible.
 */
@Directive({
  selector: '[esTooltip]',
  host: {
    '(mouseenter)': 'show(400)',
    '(mouseleave)': 'hide()',
    '(focusin)': 'show(0)',
    '(focusout)': 'hide()',
    '(keydown.escape)': 'hide()',
    '[attr.aria-describedby]': 'visible() ? id : null',
  },
})
export class EsTooltip {
  readonly esTooltip = input.required<string>();
  readonly esTooltipPosition = input<'top' | 'bottom' | 'left' | 'right'>('top');

  private readonly overlay = inject(Overlay);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private ref: OverlayRef | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  protected readonly id = `es-tooltip-${++nextId}`;
  protected readonly visible = signal(false);

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.timer);
      this.ref?.dispose();
    });
  }

  protected show(delay: number): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.attach(), delay);
  }

  protected hide(): void {
    clearTimeout(this.timer);
    this.ref?.detach();
    this.visible.set(false);
  }

  private attach(): void {
    if (!this.esTooltip()) return;
    const pos = this.esTooltipPosition();
    const map = {
      top: {
        originX: 'center',
        originY: 'top',
        overlayX: 'center',
        overlayY: 'bottom',
        offsetY: -6,
      },
      bottom: {
        originX: 'center',
        originY: 'bottom',
        overlayX: 'center',
        overlayY: 'top',
        offsetY: 6,
      },
      left: {
        originX: 'start',
        originY: 'center',
        overlayX: 'end',
        overlayY: 'center',
        offsetX: -6,
      },
      right: {
        originX: 'end',
        originY: 'center',
        overlayX: 'start',
        overlayY: 'center',
        offsetX: 6,
      },
    } as const;
    this.ref ??= this.overlay.create({
      positionStrategy: this.overlay
        .position()
        .flexibleConnectedTo(this.host)
        .withPositions([map[pos], map[pos === 'top' ? 'bottom' : 'top']]),
      scrollStrategy: this.overlay.scrollStrategies.close(),
    });
    if (this.ref.hasAttached()) return;
    const panel = this.ref.attach(new ComponentPortal(EsTooltipPanel)).instance;
    panel.text.set(this.esTooltip());
    panel.id.set(this.id);
    this.visible.set(true);
  }
}
