import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChildren,
  type ElementRef,
  inject,
  input,
  model,
  viewChildren,
} from '@angular/core';
import { cn, focusRing } from './cn';

let nextId = 0;

/** Panel de una pestaña. Su contenido solo se renderiza cuando está activo. */
@Component({
  selector: 'es-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (active()) {
    <ng-content />
  }`,
  host: {
    role: 'tabpanel',
    tabindex: '0',
    '[id]': 'panelId',
    '[attr.aria-labelledby]': 'tabId',
    '[hidden]': '!active()',
    class: 'block outline-none',
  },
})
export class EsTab {
  private readonly tabs = inject(EsTabs);
  readonly label = input.required<string>();
  readonly value = input.required<string>();
  readonly active = computed(() => this.tabs.selected() === this.value());
  readonly panelId = `es-tabpanel-${++nextId}`;
  readonly tabId = `${this.panelId}-tab`;
}

/**
 * Pestañas según el patrón WAI-ARIA (activación automática, navegación con
 * flechas, Inicio y Fin).
 */
@Component({
  selector: 'es-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- El foco lo reciben las pestañas (tabindex itinerante), no el contenedor. -->
    <!-- eslint-disable-next-line @angular-eslint/template/interactive-supports-focus -->
    <div
      role="tablist"
      [attr.aria-label]="label()"
      class="flex gap-0.5 border-b border-border"
      (keydown)="onKeydown($event)"
    >
      @for (tab of tabs(); track tab.value()) {
        <button
          #tabButton
          type="button"
          role="tab"
          [id]="tab.tabId"
          [attr.aria-selected]="tab.active()"
          [attr.aria-controls]="tab.panelId"
          [tabindex]="tab.active() ? 0 : -1"
          [class]="tabClass(tab.active())"
          (click)="value.set(tab.value())"
        >
          {{ tab.label() }}
        </button>
      }
    </div>
    <div class="pt-3"><ng-content /></div>
  `,
  host: { class: 'block' },
})
export class EsTabs {
  readonly value = model<string>();
  readonly label = input<string>();
  protected readonly tabs = contentChildren(EsTab);
  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>('tabButton');

  /** Pestaña activa: la indicada o, en su defecto, la primera. */
  readonly selected = computed(() => this.value() ?? this.tabs()[0]?.value());

  protected tabClass(active: boolean): string {
    return cn(
      '-mb-px h-8 cursor-pointer border-b-2 px-2.5 text-sm font-medium transition-colors',
      focusRing,
      active ? 'border-primary text-fg' : 'border-transparent text-fg-muted hover:text-fg',
    );
  }

  protected onKeydown(event: KeyboardEvent): void {
    const tabs = this.tabs();
    const current = tabs.findIndex((t) => t.active());
    let next: number;
    if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;
    event.preventDefault();
    const tab = tabs[next];
    if (!tab) return;
    this.value.set(tab.value());
    this.buttons()[next]?.nativeElement.focus();
  }
}
