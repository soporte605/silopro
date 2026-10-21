import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  model,
  output,
} from '@angular/core';
import type { CabinetLayout } from '@silopro/cabinet-engine';
import type { CompartmentState } from '@silopro/contracts';
import { EsKbd } from '@elikarsystems/ui';

const CELL_W = 44;
const CELL_H = 28;
const GAP = 3;

export interface GridRect {
  row: number;
  column: number;
  rowSpan: number;
  columnSpan: number;
}

/** Rectángulo entre el ancla y la selección actual (selección con Mayús). */
export function selectionRect(
  layout: CabinetLayout,
  anchorId: string | null,
  selectedId: string | null,
): GridRect | null {
  const a = layout.compartments.find((c) => c.id === anchorId);
  const b = layout.compartments.find((c) => c.id === selectedId);
  if (!a || !b || a.id === b.id) return null;
  const row = Math.min(a.row, b.row);
  const column = Math.min(a.column, b.column);
  return {
    row,
    column,
    rowSpan: Math.max(a.row + a.rowSpan, b.row + b.rowSpan) - row,
    columnSpan: Math.max(a.column + a.columnSpan, b.column + b.columnSpan) - column,
  };
}

const cx = (column: number) => 4 + GAP + column * (CELL_W + GAP);
const cy = (row: number) => 4 + GAP + row * (CELL_H + GAP);
const cw = (c: GridRect) => c.columnSpan * CELL_W + (c.columnSpan - 1) * GAP;
const ch = (c: GridRect) => c.rowSpan * CELL_H + (c.rowSpan - 1) * GAP;

/**
 * Celdas del gabinete. Es un componente aparte para que cambiar la selección
 * no vuelva a evaluar miles de celdas: solo cambia la capa de selección del
 * padre (objetivo: < 16 ms por interacción en 60×40).
 */
@Component({
  selector: 'g[spCabinetCells]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (c of layout().compartments; track c.id) {
      <svg:g
        class="cursor-pointer"
        [attr.data-address]="c.address"
        (click)="pick.emit({ id: c.id, extend: $event.shiftKey })"
      >
        <svg:rect
          [attr.x]="x(c.column)"
          [attr.y]="y(c.row)"
          [attr.width]="w(c)"
          [attr.height]="h(c)"
          rx="2.5"
          [attr.class]="
            matches().has(c.id)
              ? 'fill-surface stroke-info stroke-2'
              : 'fill-surface-raised hover:fill-surface-hover'
          "
        />
        <svg:text
          [attr.x]="x(c.column) + 4"
          [attr.y]="y(c.row) + 11"
          class="pointer-events-none fill-fg-muted font-mono text-[8px]"
        >
          {{ c.address }}
        </svg:text>
        @if (states().get(c.id); as s) {
          @if (s !== 'empty') {
            <svg:rect
              [attr.x]="x(c.column) + 4"
              [attr.y]="y(c.row) + 16"
              [attr.width]="w(c) - 8"
              height="4"
              rx="2"
              [attr.class]="s === 'low' ? 'fill-warning' : 'fill-accent'"
            />
          }
        }
      </svg:g>
    }
  `,
})
export class CabinetCells {
  readonly layout = input.required<CabinetLayout>();
  readonly states = input.required<ReadonlyMap<string, CompartmentState>>();
  readonly matches = input.required<ReadonlySet<string>>();
  readonly pick = output<{ id: string; extend: boolean }>();
  protected readonly x = cx;
  protected readonly y = cy;
  protected readonly w = cw;
  protected readonly h = ch;
}

/**
 * Vista frontal 2D de un gabinete (SVG). Selección con clic o flechas;
 * Mayús extiende la selección a un rectángulo. No conoce de dónde vienen los
 * datos: el padre le pasa el diseño, los estados de ocupación y las
 * coincidencias de búsqueda.
 */
@Component({
  selector: 'sp-cabinet-grid',
  imports: [EsKbd, CabinetCells],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      role="application"
      aria-roledescription="gabinete"
      [attr.aria-label]="
        label() +
        ': ' +
        layout().rows +
        ' por ' +
        layout().columns +
        '. Use las flechas para moverse y Mayús para seleccionar un rango.'
      "
      tabindex="0"
      class="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      [attr.width]="width()"
      [attr.height]="height()"
      [attr.viewBox]="'0 0 ' + width() + ' ' + height()"
      (keydown)="onKeydown($event)"
    >
      <rect
        [attr.width]="width()"
        [attr.height]="height()"
        rx="6"
        class="fill-(--es-primary-700) dark:fill-border-strong"
      />
      <g
        spCabinetCells
        [layout]="layout()"
        [states]="states()"
        [matches]="matches()"
        (pick)="pick($event.id, $event.extend)"
      />
      @if (rect(); as r) {
        <rect
          [attr.x]="x(r.column)"
          [attr.y]="y(r.row)"
          [attr.width]="w(r)"
          [attr.height]="h(r)"
          rx="2.5"
          class="pointer-events-none fill-accent/15 stroke-accent stroke-1"
        />
      }
      @if (selected(); as c) {
        <rect
          [attr.x]="x(c.column)"
          [attr.y]="y(c.row)"
          [attr.width]="w(c)"
          [attr.height]="h(c)"
          rx="2.5"
          class="pointer-events-none fill-none stroke-accent stroke-[2.5]"
        />
      }
    </svg>
    <div class="mt-3 flex flex-wrap items-center gap-3 text-xs text-fg-muted">
      <span class="flex items-center gap-1.5"
        ><span class="h-1 w-4 rounded-full bg-accent"></span> Con existencias</span
      >
      <span class="flex items-center gap-1.5"
        ><span class="h-1 w-4 rounded-full bg-warning"></span> Stock bajo</span
      >
      <span class="flex items-center gap-1.5"
        ><span class="size-3 rounded-sm ring-2 ring-info"></span> Coincidencia</span
      >
      <span class="ml-auto flex items-center gap-1"
        ><kbd esKbd>←↑→↓</kbd> mover <kbd esKbd>Mayús</kbd> rango</span
      >
    </div>
  `,
  host: { class: 'block' },
})
export class CabinetGrid {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly layout = input.required<CabinetLayout>();
  readonly states = input<ReadonlyMap<string, CompartmentState>>(new Map());
  readonly matches = input<ReadonlySet<string>>(new Set());
  readonly label = input('Gabinete');
  readonly selectedId = model<string | null>(null);
  readonly anchorId = model<string | null>(null);

  protected readonly selected = computed(
    () => this.layout().compartments.find((c) => c.id === this.selectedId()) ?? null,
  );
  protected readonly rect = computed(() =>
    selectionRect(this.layout(), this.anchorId(), this.selectedId()),
  );
  protected readonly width = computed(() => this.layout().columns * (CELL_W + GAP) + GAP + 8);
  protected readonly height = computed(() => this.layout().rows * (CELL_H + GAP) + GAP + 8);

  protected readonly x = cx;
  protected readonly y = cy;
  protected readonly w = cw;
  protected readonly h = ch;

  protected pick(id: string, extend: boolean): void {
    this.selectedId.set(id);
    if (!extend) this.anchorId.set(id);
  }

  /** Lleva el compartimento indicado a la vista (p. ej. al abrir resaltado). */
  scrollTo(id: string): void {
    const el = this.host.nativeElement.querySelector(`[data-address="${CSS.escape(id)}"]`);
    el?.scrollIntoView?.({ block: 'center', inline: 'center' });
  }

  /** Navegación con flechas por celdas; Mayús extiende la selección. */
  protected onKeydown(event: KeyboardEvent): void {
    const deltas: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const d = deltas[event.key];
    const current = this.layout().compartments.find((c) => c.id === this.selectedId());
    if (!d || !current) return;
    event.preventDefault();
    const row = d[0] < 0 ? current.row - 1 : d[0] > 0 ? current.row + current.rowSpan : current.row;
    const col =
      d[1] < 0
        ? current.column - 1
        : d[1] > 0
          ? current.column + current.columnSpan
          : current.column;
    const target = this.layout().compartments.find(
      (c) =>
        row >= c.row && row < c.row + c.rowSpan && col >= c.column && col < c.column + c.columnSpan,
    );
    if (target) this.pick(target.id, event.shiftKey);
  }
}
