import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EsBadge, EsButton, EsSelect, EsTable, EsToastService } from '@elikarsystems/ui';
import { LucideDownload, LucideFileSpreadsheet, LucideUpload } from '@lucide/angular';
import {
  guessImportField,
  IMPORT_FIELDS,
  type ImportFieldKey,
  type ImportResult,
  type ImportRow,
  MAX_IMPORT_ROWS,
  parseImportNumber,
} from '@silopro/contracts';
import { Api, ApiRequestError } from '../../core/api';
import { parseCsv, toCsv } from '../../core/csv';
import { fmtQty } from '../../core/format';
import { PageHeader } from '../page-header';

const NUMERIC: readonly ImportFieldKey[] = ['cost', 'price', 'minStock', 'quantity'];
const ACTION_LABELS = {
  create: 'Nuevo',
  update: 'Actualiza',
  skip: 'Se omite',
  error: 'Error',
} as const;
const ACTION_TONES = {
  create: 'success',
  update: 'primary',
  skip: 'neutral',
  error: 'danger',
} as const;

/**
 * Importa artículos desde CSV o Excel: se eligen las columnas, se revisa fila
 * por fila qué pasará y solo entonces se importa (todo o nada).
 */
@Component({
  selector: 'sp-import-items',
  imports: [
    RouterLink,
    EsBadge,
    EsButton,
    EsSelect,
    EsTable,
    LucideDownload,
    LucideFileSpreadsheet,
    LucideUpload,
    PageHeader,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:p-6">
      <sp-page-header
        title="Importar artículos"
        description="Desde una hoja de Excel (.xlsx) o un CSV. Primero verá qué se crea, qué se actualiza y qué filas tienen errores; nada se guarda hasta que confirme."
      >
        <button spActions esButton (click)="template()">
          <svg lucideDownload></svg> Descargar plantilla
        </button>
      </sp-page-header>

      <section
        class="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-3"
      >
        <input
          #picker
          type="file"
          class="sr-only"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-label="Elegir archivo"
          (change)="load($any($event.target))"
        />
        <button esButton variant="primary" [loading]="reading()" (click)="picker.click()">
          <svg lucideUpload></svg> Elegir archivo
        </button>
        @if (fileName()) {
          <span class="flex items-center gap-1.5 text-sm">
            <svg lucideFileSpreadsheet [size]="16"></svg> {{ fileName() }} ·
            {{ dataRows().length }} filas
          </span>
        } @else {
          <span class="text-sm text-fg-muted"
            >La primera fila debe tener los encabezados. Hasta {{ maxRows }} artículos.</span
          >
        }
      </section>

      @if (fileError()) {
        <p class="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger" role="alert">
          {{ fileError() }}
        </p>
      }

      @if (headers().length) {
        <section aria-labelledby="cols" class="flex flex-col gap-2">
          <h2 id="cols" class="text-sm font-semibold">Columnas</h2>
          <p class="text-xs text-fg-muted">
            Indique qué es cada columna del archivo. SKU, Nombre y Unidad son obligatorias para
            artículos nuevos; la unidad puede ser su código, símbolo o nombre (pza, Pieza…). La
            cantidad se registra como entrada en la ubicación indicada.
          </p>
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            @for (h of headers(); track $index; let col = $index) {
              <label class="flex items-center gap-2 text-sm">
                <span class="w-32 shrink-0 truncate font-medium" [title]="h">{{
                  h || '(sin nombre)'
                }}</span>
                <select
                  esSelect
                  class="min-w-0 flex-1"
                  [attr.aria-label]="'Columna ' + (h || col + 1)"
                  (change)="setMapping(col, $any($event.target).value)"
                >
                  <option value="" [selected]="!mapping()[col]">No importar</option>
                  @for (f of fields; track f.key) {
                    <option [value]="f.key" [selected]="mapping()[col] === f.key">
                      {{ f.label }}
                    </option>
                  }
                </select>
              </label>
            }
          </div>
          @if (missing().length) {
            <p class="text-sm text-warning" role="status">
              Falta indicar: {{ missing().join(', ') }}.
            </p>
          }
          <label class="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              class="accent-primary"
              [checked]="updateExisting()"
              (change)="updateExisting.set($any($event.target).checked); result.set(null)"
            />
            Actualizar los artículos cuyo SKU ya existe (solo las columnas que trae el archivo)
          </label>
          <div class="flex flex-wrap gap-2">
            <button
              esButton
              variant="primary"
              [disabled]="!!missing().length || !dataRows().length"
              [loading]="busy() === 'check'"
              (click)="send(true)"
            >
              Revisar
            </button>
          </div>
        </section>
      }

      @if (result(); as r) {
        <section aria-labelledby="rev" class="flex flex-col gap-2">
          <h2 id="rev" class="text-sm font-semibold">
            {{ r.dryRun ? 'Revisión' : 'Importación terminada' }}
          </h2>
          <div class="flex flex-wrap items-center gap-2 text-sm" role="status">
            <es-badge tone="success">{{ r.created }} nuevos</es-badge>
            <es-badge tone="primary">{{ r.updated }} se actualizan</es-badge>
            @if (r.skipped) {
              <es-badge>{{ r.skipped }} se omiten</es-badge>
            }
            @if (r.stockEntries) {
              <es-badge>{{ r.stockEntries }} entradas de existencias</es-badge>
            }
            @if (r.errors) {
              <es-badge tone="danger">{{ r.errors }} con errores</es-badge>
            }
          </div>
          @if (r.dryRun) {
            @if (r.errors) {
              <p class="text-sm text-danger">
                Corrija las filas con error en su archivo y vuelva a elegirlo. No se importa nada
                mientras haya errores.
              </p>
            } @else {
              <div>
                <button
                  esButton
                  variant="primary"
                  [loading]="busy() === 'import'"
                  (click)="send(false)"
                >
                  Importar {{ r.created + r.updated }} artículos
                </button>
              </div>
            }
          } @else {
            <div><a esButton routerLink="/inventario">Ver artículos</a></div>
          }
          <div class="overflow-x-auto rounded-lg border border-border">
            <table esTable aria-label="Filas del archivo">
              <thead>
                <tr>
                  <th scope="col" class="num">Fila</th>
                  <th scope="col">SKU</th>
                  <th scope="col">Resultado</th>
                  <th scope="col">Detalle</th>
                </tr>
              </thead>
              <tbody>
                @for (row of shownRows(); track row.row) {
                  <tr [attr.data-row]="row.row">
                    <td class="num">{{ row.row + 1 }}</td>
                    <td class="code">{{ row.sku ?? '—' }}</td>
                    <td>
                      <es-badge [tone]="tones[row.action]">{{ labels[row.action] }}</es-badge>
                    </td>
                    <td class="text-sm">
                      @if (row.errors.length) {
                        <span class="text-danger">{{ row.errors.join(' · ') }}</span>
                      } @else if (row.stock) {
                        Entrada de {{ qty(row.stock.quantity) }} en {{ row.stock.locationPath }}
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (r.rows.length > shownRows().length) {
            <p class="text-xs text-fg-muted">
              Se muestran {{ shownRows().length }} de {{ r.rows.length }} filas (primero las que
              tienen errores).
            </p>
          }
        </section>
      }
    </div>
  `,
})
export default class ImportItems {
  private readonly api = inject(Api);
  private readonly toast = inject(EsToastService);
  protected readonly fields = IMPORT_FIELDS;
  protected readonly maxRows = MAX_IMPORT_ROWS;
  protected readonly labels = ACTION_LABELS;
  protected readonly tones = ACTION_TONES;
  protected readonly qty = fmtQty;

  protected readonly fileName = signal('');
  protected readonly fileError = signal<string | null>(null);
  protected readonly reading = signal(false);
  protected readonly headers = signal<string[]>([]);
  protected readonly dataRows = signal<unknown[][]>([]);
  /** Campo elegido para cada columna del archivo. */
  protected readonly mapping = signal<(ImportFieldKey | null)[]>([]);
  protected readonly updateExisting = signal(true);
  protected readonly result = signal<ImportResult | null>(null);
  protected readonly busy = signal<'check' | 'import' | null>(null);

  protected readonly missing = computed(() => {
    const chosen = new Set(this.mapping());
    return IMPORT_FIELDS.filter((f) => f.required && !chosen.has(f.key)).map((f) => f.label);
  });
  protected readonly shownRows = computed(() => {
    const rows = this.result()?.rows ?? [];
    return [
      ...rows.filter((r) => r.action === 'error'),
      ...rows.filter((r) => r.action !== 'error'),
    ].slice(0, 300);
  });

  protected template(): void {
    const head = IMPORT_FIELDS.map((f) => f.label);
    const example = ['RES-1K', 'Resistencia 1 kΩ', 'pza', '', '', '', '', '', 0.5, 1, 100, '', ''];
    this.download('plantilla-articulos.csv', toCsv([head, example]));
  }

  protected async load(picker: HTMLInputElement): Promise<void> {
    const file = picker.files?.[0];
    picker.value = '';
    if (!file) return;
    this.fileError.set(null);
    this.result.set(null);
    this.reading.set(true);
    try {
      let rows: unknown[][];
      if (/\.xlsx$/i.test(file.name)) {
        const { readSheet } = await import('read-excel-file/browser');
        rows = (await readSheet(file)) as unknown[][];
      } else if (/\.(csv|txt)$/i.test(file.name)) {
        rows = parseCsv(await file.text());
      } else {
        throw new Error('Use un archivo .xlsx o .csv (en Excel: Guardar como → CSV UTF-8).');
      }
      rows = rows.filter((r) => r.some((c) => c !== null && String(c).trim() !== ''));
      if (rows.length < 2)
        throw new Error('El archivo no tiene filas de datos debajo de los encabezados.');
      if (rows.length - 1 > MAX_IMPORT_ROWS) {
        throw new Error(
          `El archivo tiene ${rows.length - 1} filas; el máximo es ${MAX_IMPORT_ROWS}.`,
        );
      }
      const headers = rows[0]!.map((h) => (h === null ? '' : String(h).trim()));
      const used = new Set<ImportFieldKey>();
      this.mapping.set(
        headers.map((h) => {
          const f = guessImportField(h);
          if (!f || used.has(f)) return null;
          used.add(f);
          return f;
        }),
      );
      this.headers.set(headers);
      this.dataRows.set(rows.slice(1));
      this.fileName.set(file.name);
    } catch (e) {
      this.headers.set([]);
      this.dataRows.set([]);
      this.fileName.set('');
      this.fileError.set(
        e instanceof Error && e.name !== 'InvalidInputError'
          ? e.message
          : 'No se pudo leer el archivo. ¿Es un Excel (.xlsx) válido?',
      );
    } finally {
      this.reading.set(false);
    }
  }

  protected setMapping(index: number, value: string): void {
    const field = (value || null) as ImportFieldKey | null;
    // Un campo solo puede venir de una columna.
    this.mapping.update((m) => m.map((f, i) => (i === index ? field : f === field ? null : f)));
    this.result.set(null);
  }

  protected async send(dryRun: boolean): Promise<void> {
    const rows = this.buildRows();
    if (!rows) return;
    this.busy.set(dryRun ? 'check' : 'import');
    try {
      const r = await this.api.post<ImportResult>('/import/items', {
        rows,
        dryRun,
        updateExisting: this.updateExisting(),
      });
      this.result.set(r);
      if (!dryRun) {
        this.toast.show(`Importación lista: ${r.created} nuevos, ${r.updated} actualizados`, {
          tone: 'success',
        });
      }
    } catch (e) {
      const err = ApiRequestError.from(e);
      const details = err.details as { result?: ImportResult } | undefined;
      if (details?.result) this.result.set(details.result);
      this.toast.show(err.message, { tone: 'danger' });
    } finally {
      this.busy.set(null);
    }
  }

  /** Filas del archivo según las columnas elegidas; null si hay números ilegibles. */
  private buildRows(): ImportRow[] | null {
    const map = this.mapping();
    const bad: string[] = [];
    const rows = this.dataRows().map((cells, r) => {
      const row: Record<string, string | number | null> = {};
      map.forEach((field, i) => {
        if (!field) return;
        const raw = cells[i];
        if (NUMERIC.includes(field)) {
          const n = parseImportNumber(raw);
          if (Number.isNaN(n) || (n !== null && n < 0)) {
            bad.push(`fila ${r + 2}, ${IMPORT_FIELDS.find((f) => f.key === field)!.label}`);
            row[field] = null;
          } else row[field] = n;
        } else {
          row[field] = raw === null || raw === undefined ? null : String(raw).trim();
        }
      });
      return row as ImportRow;
    });
    if (bad.length) {
      this.fileError.set(
        `Hay números que no se entienden (${bad.slice(0, 5).join('; ')}${bad.length > 5 ? '…' : ''}). Corríjalos en el archivo.`,
      );
      return null;
    }
    this.fileError.set(null);
    return rows;
  }

  private download(name: string, content: string): void {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
