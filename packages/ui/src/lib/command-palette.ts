import { Dialog, DialogRef } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injectable,
  signal,
} from '@angular/core';
import { LucideSearch } from '@lucide/angular';
import { EsKbd } from './kbd';

export interface EsCommand {
  id: string;
  label: string;
  group?: string;
  /** Palabras adicionales para la búsqueda (sinónimos). */
  keywords?: string[];
  shortcut?: string;
  run: () => void;
}

/** Normaliza para buscar sin distinguir mayúsculas ni acentos ("ubicación" = "ubicacion"). */
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

export function filterCommands(commands: readonly EsCommand[], query: string): EsCommand[] {
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (!terms.length) return [...commands];
  return commands.filter((c) => {
    const hay = normalizeSearch([c.label, c.group ?? '', ...(c.keywords ?? [])].join(' '));
    return terms.every((t) => hay.includes(t));
  });
}

/** Registro de comandos y apertura de la paleta (Ctrl/⌘ + K). */
@Injectable({ providedIn: 'root' })
export class EsCommandPaletteService {
  private readonly dialog = inject(Dialog);
  readonly commands = signal<EsCommand[]>([]);
  private ref: DialogRef<unknown, EsCommandPalette> | null = null;

  register(commands: EsCommand[]): () => void {
    this.commands.update((list) => [
      ...list.filter((c) => !commands.some((n) => n.id === c.id)),
      ...commands,
    ]);
    return () => this.commands.update((list) => list.filter((c) => !commands.includes(c)));
  }

  toggle(): void {
    if (this.ref) {
      this.ref.close();
      return;
    }
    const ref = this.dialog.open(EsCommandPalette, {
      width: '560px',
      maxWidth: 'calc(100vw - 32px)',
      backdropClass: 'es-backdrop',
      panelClass: ['es-dialog-panel', 'es-dialog-top'],
      ariaLabel: 'Paleta de comandos',
    });
    this.ref = ref;
    ref.closed.subscribe(() => (this.ref = null));
  }
}

@Component({
  selector: 'es-command-palette',
  imports: [LucideSearch, EsKbd],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-center gap-2 border-b border-border px-3">
      <svg lucideSearch [size]="16" class="text-fg-subtle"></svg>
      <input
        class="h-11 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
        placeholder="Buscar comandos, artículos, ubicaciones…"
        role="combobox"
        aria-expanded="true"
        aria-controls="es-cmd-list"
        aria-autocomplete="list"
        [attr.aria-activedescendant]="results().length ? 'es-cmd-' + active() : null"
        [value]="query()"
        (input)="onInput($event)"
        (keydown)="onKeydown($event)"
        cdkFocusInitial
      />
      <kbd esKbd>Esc</kbd>
    </div>
    <ul id="es-cmd-list" role="listbox" aria-label="Resultados" class="max-h-80 overflow-auto p-1">
      @for (cmd of results(); track cmd.id; let i = $index) {
        @if (cmd.group && cmd.group !== results()[i - 1]?.group) {
          <li
            role="presentation"
            class="px-2 pt-2 pb-1 text-2xs font-medium text-fg-subtle uppercase"
          >
            {{ cmd.group }}
          </li>
        }
        <!-- Patrón combobox + aria-activedescendant: el foco permanece en el campo
             de búsqueda y el teclado se gestiona allí; las opciones no reciben foco. -->
        <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
        <li
          role="option"
          [id]="'es-cmd-' + i"
          [attr.aria-selected]="i === active()"
          class="flex h-8 cursor-pointer items-center gap-2 rounded-sm px-2 text-sm text-fg aria-selected:bg-surface-active"
          (mousemove)="active.set(i)"
          (click)="run(cmd)"
        >
          <span class="flex-1 truncate">{{ cmd.label }}</span>
          @if (cmd.shortcut) {
            <kbd esKbd>{{ cmd.shortcut }}</kbd>
          }
        </li>
      } @empty {
        <li class="px-2 py-6 text-center text-xs text-fg-muted">
          Sin resultados para «{{ query() }}»
        </li>
      }
    </ul>
  `,
  host: { class: 'block overflow-hidden bg-surface-raised' },
})
export class EsCommandPalette {
  private readonly svc = inject(EsCommandPaletteService);
  private readonly ref = inject(DialogRef);
  protected readonly query = signal('');
  protected readonly active = signal(0);
  protected readonly results = computed(() => filterCommands(this.svc.commands(), this.query()));

  protected onInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
    this.active.set(0);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const n = this.results().length;
    if (!n) return;
    if (event.key === 'ArrowDown') this.active.update((i) => (i + 1) % n);
    else if (event.key === 'ArrowUp') this.active.update((i) => (i - 1 + n) % n);
    else if (event.key === 'Enter') {
      const cmd = this.results()[this.active()];
      if (cmd) this.run(cmd);
    } else return;
    event.preventDefault();
    document.getElementById(`es-cmd-${this.active()}`)?.scrollIntoView({ block: 'nearest' });
  }

  protected run(cmd: EsCommand): void {
    this.ref.close();
    cmd.run();
  }
}
