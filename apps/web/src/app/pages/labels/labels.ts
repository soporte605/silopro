import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  type ElementRef,
  inject,
  input,
  linkedSignal,
  resource,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  EsButton,
  EsCheckbox,
  EsEmptyState,
  EsFormField,
  EsInput,
  EsSelect,
  EsSkeleton,
} from '@elikarsystems/ui';
import { LucidePrinter, LucideQrCode } from '@lucide/angular';
import {
  type Cabinet,
  type CabinetSummary,
  type Item,
  type Location,
  type Page,
  qrUrl,
} from '@silopro/contracts';
import { Api } from '../../core/api';
import { SessionService } from '../../core/session';
import { PageHeader } from '../page-header';
import { LABEL_FORMATS, type LabelData, type LabelDesign, LabelSheet } from './label-sheet';

type Source = 'gabinete' | 'ubicaciones' | 'articulos';

const BASE_KEY = 'sp.etiquetas.direccion';
const FORMAT_KEY = 'sp.etiquetas.formato';
const DESIGN_KEY = 'sp.etiquetas.diseno';

function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writePref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Sin almacenamiento: solo no se recuerda la preferencia. */
  }
}

/** Todas las páginas de artículos (la API entrega como máximo 200 por petición). */
async function allItems(api: Api): Promise<Item[]> {
  const out: Item[] = [];
  for (let offset = 0; ; offset += 200) {
    const page = await api.get<Page<Item>>('/items', { limit: 200, offset });
    out.push(...page.items);
    if (out.length >= page.total || !page.items.length) return out;
  }
}

/**
 * Hojas de etiquetas QR para imprimir o guardar como PDF: cajones de un
 * gabinete, ubicaciones o artículos. El QR lleva un enlace corto que, al
 * escanearlo con el celular, abre el cajón o el artículo en SiloPro.
 */
@Component({
  selector: 'sp-labels',
  imports: [
    RouterLink,
    PageHeader,
    LabelSheet,
    EsButton,
    EsCheckbox,
    EsEmptyState,
    EsFormField,
    EsInput,
    EsSelect,
    EsSkeleton,
    LucidePrinter,
    LucideQrCode,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:p-6">
      <sp-page-header
        title="Etiquetas"
        description="Imprima etiquetas con QR o guárdelas como PDF. Al escanearlas con el celular se abre el cajón o el artículo."
      >
        <button
          spActions
          esButton
          variant="primary"
          [disabled]="!selected().length"
          (click)="print()"
        >
          <svg lucidePrinter></svg> Imprimir {{ selected().length }}
        </button>
      </sp-page-header>

      <div class="flex flex-col gap-4 lg:flex-row lg:items-start">
        <form
          class="flex w-full shrink-0 flex-col gap-3 rounded-lg border border-border bg-surface p-4 lg:w-80"
          aria-label="Opciones de etiquetas"
          (submit)="$event.preventDefault()"
        >
          <es-form-field label="Qué imprimir" #s="esFormField">
            <select
              esSelect
              [id]="s.controlId"
              [value]="source()"
              (change)="setSource($any($event.target).value)"
            >
              <option value="gabinete">Cajones de un gabinete</option>
              <option value="ubicaciones">Ubicaciones</option>
              <option value="articulos">Artículos</option>
            </select>
          </es-form-field>
          @if (source() === 'gabinete') {
            <es-form-field label="Gabinete" #g="esFormField">
              <select
                esSelect
                [id]="g.controlId"
                [value]="cabinetId()"
                (change)="cabinetId.set($any($event.target).value)"
              >
                @for (c of cabinets.value() ?? []; track c.id) {
                  <option [value]="c.id">{{ c.path }} · {{ c.name }}</option>
                }
              </select>
            </es-form-field>
          }
          <es-form-field label="Diseño" #d="esFormField">
            <select
              esSelect
              [id]="d.controlId"
              [value]="design()"
              (change)="setDesign($any($event.target).value)"
            >
              <option value="cajon">Cajón · encabezado y dirección grande</option>
              <option value="detalle">Detalle · QR con nombre y ruta</option>
            </select>
          </es-form-field>
          <es-form-field label="Formato" #f="esFormField">
            <select
              esSelect
              [id]="f.controlId"
              [value]="formatId()"
              (change)="setFormat($any($event.target).value)"
            >
              @for (opt of formats; track opt.id) {
                <option [value]="opt.id">{{ opt.name }}</option>
              }
            </select>
          </es-form-field>
          @if (isSheet()) {
            <es-form-field
              label="Empezar en la etiqueta"
              hint="Para aprovechar una hoja ya usada: 1 es la primera de arriba a la izquierda."
              #k="esFormField"
            >
              <input
                esInput
                type="number"
                min="1"
                [max]="perPage()"
                class="w-24"
                [id]="k.controlId"
                [value]="startAt()"
                (input)="startAt.set(+$any($event.target).value || 1)"
                [attr.aria-describedby]="k.describedBy()"
              />
            </es-form-field>
          }
          <es-form-field
            label="Dirección en el QR"
            hint="Para escanear con el celular use la dirección de esta PC en su red, p. ej. http://192.168.1.50:8080."
            [error]="baseError()"
            #b="esFormField"
          >
            <input
              esInput
              mono
              [id]="b.controlId"
              [value]="base()"
              (change)="setBase($any($event.target).value)"
              [attr.aria-describedby]="b.describedBy()"
              [attr.aria-invalid]="!!baseError()"
            />
          </es-form-field>

          @if (all().length) {
            <fieldset class="flex min-h-0 flex-col gap-1">
              <legend class="mb-1 flex w-full items-center justify-between text-sm font-medium">
                <span>Incluir ({{ selected().length }} de {{ all().length }})</span>
              </legend>
              <div class="mb-1 flex gap-2 text-xs">
                <button
                  type="button"
                  class="text-accent hover:underline"
                  (click)="excluded.set([])"
                >
                  Todas
                </button>
                <button
                  type="button"
                  class="text-accent hover:underline"
                  (click)="excluded.set(keys())"
                >
                  Ninguna
                </button>
              </div>
              <div class="max-h-72 overflow-y-auto rounded-md border border-border">
                @for (l of all(); track l.key) {
                  <label
                    class="flex cursor-pointer items-center gap-2 border-b border-border px-2 py-1.5 text-sm last:border-b-0 hover:bg-surface-hover"
                  >
                    <input
                      type="checkbox"
                      esCheckbox
                      [checked]="!excludedSet().has(l.key)"
                      (change)="toggle(l.key)"
                    />
                    <span class="font-mono text-xs">{{ l.title }}</span>
                    <span class="truncate text-fg-muted">{{ l.name }}</span>
                  </label>
                }
              </div>
            </fieldset>
          }
        </form>

        <section
          class="min-w-0 flex-1 overflow-x-auto rounded-lg border border-border bg-surface-sunken p-4"
          aria-label="Vista previa"
        >
          @if (data.isLoading() && !data.hasValue()) {
            <es-skeleton class="h-64 w-full" />
          } @else if (!all().length) {
            <es-empty-state title="Nada que imprimir" [description]="emptyText()">
              <svg esEmptyIcon lucideQrCode></svg>
              @if (source() === 'gabinete') {
                <a esEmptyActions esButton routerLink="/gabinetes">Ir a Gabinetes</a>
              }
            </es-empty-state>
          } @else {
            <p class="mb-3 text-xs text-fg-muted">
              Tamaño real. Al imprimir elija escala 100 % («Tamaño real») y sin márgenes
              adicionales; también puede elegir «Guardar como PDF».
            </p>
            <sp-label-sheet
              [labels]="sheet()"
              [format]="format()"
              [design]="design()"
              [outline]="true"
            />
          }
        </section>
      </div>
    </div>

    <div #printRoot class="sp-print-root">
      <sp-label-sheet [labels]="sheet()" [format]="format()" [design]="design()" />
    </div>
  `,
})
export default class Labels {
  private readonly api = inject(Api);
  private readonly document = inject(DOCUMENT);
  protected readonly session = inject(SessionService);
  protected readonly formats = LABEL_FORMATS;

  /** `?origen=ubicaciones|articulos`, `?gabinete=<id>` o `?articulo=<id>`. */
  readonly origen = input<string>();
  readonly gabinete = input<string>();
  readonly articulo = input<string>();

  protected readonly source = linkedSignal<Source>(() =>
    this.gabinete()
      ? 'gabinete'
      : this.articulo()
        ? 'articulos'
        : this.origen() === 'ubicaciones' || this.origen() === 'articulos'
          ? (this.origen() as Source)
          : 'gabinete',
  );
  protected readonly cabinetId = linkedSignal(
    () => this.gabinete() ?? this.cabinets.value()?.[0]?.id ?? '',
  );
  protected readonly formatId = signal(
    LABEL_FORMATS.some((f) => f.id === readPref(FORMAT_KEY))
      ? readPref(FORMAT_KEY)!
      : LABEL_FORMATS[0]!.id,
  );
  protected readonly format = computed(
    () => LABEL_FORMATS.find((f) => f.id === this.formatId()) ?? LABEL_FORMATS[0]!,
  );
  protected readonly design = signal<LabelDesign>(
    readPref(DESIGN_KEY) === 'detalle' ? 'detalle' : 'cajon',
  );
  protected readonly perPage = computed(() => this.format().columns * this.format().rows);
  protected readonly isSheet = computed(() => this.perPage() > 1);
  protected readonly startAt = signal(1);
  protected readonly base = signal(readPref(BASE_KEY) ?? this.document.location.origin);
  protected readonly baseError = computed(() =>
    /^https?:\/\/[^\s/]+$/.test(this.base().replace(/\/+$/, ''))
      ? ''
      : 'Escriba una dirección como http://192.168.1.50:8080',
  );

  protected readonly cabinets = resource({
    params: () => this.session.orgId(),
    loader: () => this.api.get<CabinetSummary[]>('/cabinets'),
  });

  protected readonly data = resource({
    params: () => ({
      org: this.session.orgId(),
      source: this.source(),
      cabinetId: this.cabinetId(),
      itemId: this.articulo(),
    }),
    loader: async ({ params }): Promise<Omit<LabelData, 'qr'>[]> => {
      if (params.source === 'gabinete') {
        if (!params.cabinetId) return [];
        const cab = await this.api.get<Cabinet>(`/cabinets/${params.cabinetId}`);
        const drawers = [...cab.compartments]
          .filter((c) => c.qrCode)
          .sort((a, b) => a.row - b.row || a.column - b.column)
          .map((c) => ({
            key: `location/${c.qrCode}`,
            title: c.address,
            name: c.name,
            sub: cab.path,
            group: `${cab.code} · ${cab.name}`,
          }));
        return [
          {
            key: `location/${cab.qrCode}`,
            title: cab.code,
            name: cab.name,
            sub: cab.path,
            group: cab.name,
          },
          ...drawers,
        ];
      }
      if (params.source === 'ubicaciones') {
        const list = await this.api.get<Location[]>('/locations');
        const cabinetLocations = new Set(list.filter((l) => l.cabinetId).map((l) => l.id));
        return list
          .filter((l) => !(l.kind === 'drawer' && l.parentId && cabinetLocations.has(l.parentId)))
          .map((l) => ({
            key: `location/${l.qrCode}`,
            title: l.code,
            name: l.name,
            sub: l.path,
            group: l.path.includes(' / ') ? l.path.slice(0, l.path.lastIndexOf(' / ')) : l.name,
          }));
      }
      const items = params.itemId
        ? [await this.api.get<Item>(`/items/${params.itemId}`)]
        : await allItems(this.api);
      return items.map((i) => ({
        key: `item/${i.qrCode}`,
        title: i.sku,
        name: i.name,
        sub: [i.manufacturer, i.model].filter(Boolean).join(' · '),
        group: i.name,
      }));
    },
  });

  /** Etiquetas disponibles con su enlace QR ya formado. */
  protected readonly all = computed<LabelData[]>(() => {
    const base = this.baseError() ? this.document.location.origin : this.base();
    return (this.data.value() ?? []).map((l) => {
      const [type, code] = l.key.split('/') as ['item' | 'location', string];
      return { ...l, qr: qrUrl(base, { type, code }) };
    });
  });
  protected readonly keys = computed(() => this.all().map((l) => l.key));
  protected readonly excluded = signal<string[]>([]);
  protected readonly excludedSet = computed(() => new Set(this.excluded()));
  protected readonly selected = computed(() =>
    this.all().filter((l) => !this.excludedSet().has(l.key)),
  );
  /** Lo que va a la hoja: huecos iniciales (hoja ya usada) y las etiquetas elegidas. */
  protected readonly sheet = computed<LabelData[]>(() => {
    const skip = this.isSheet() ? Math.min(Math.max(this.startAt(), 1), this.perPage()) - 1 : 0;
    const blanks = Array.from({ length: skip }, (_, i) => ({
      key: `hueco-${i}`,
      qr: '',
      title: '',
      name: '',
      sub: '',
    }));
    return [...blanks, ...this.selected()];
  });
  protected readonly emptyText = computed(() =>
    this.source() === 'gabinete'
      ? 'Cree un gabinete para imprimir las etiquetas de sus cajones.'
      : this.source() === 'ubicaciones'
        ? 'Aún no hay ubicaciones.'
        : 'Aún no hay artículos.',
  );

  private readonly printRoot = viewChild.required<ElementRef<HTMLElement>>('printRoot');

  constructor() {
    // La copia para imprimir vive directamente en <body>, fuera del marco de
    // la app, para que el navegador pagine sin barras ni desplazamientos.
    afterNextRender(() => this.document.body.appendChild(this.printRoot().nativeElement));
    inject(DestroyRef).onDestroy(() => {
      this.printRoot().nativeElement.remove();
      this.pageStyle.remove();
    });
    // Al cambiar de gabinete u origen, se vuelve a incluir todo.
    effect(() => {
      this.data.value();
      this.excluded.set([]);
    });
    effect(() => {
      this.pageStyle.textContent = `@page { size: ${this.format().page}; margin: 0; }`;
    });
  }

  private readonly pageStyle = (() => {
    const el = this.document.createElement('style');
    el.dataset['sp'] = 'etiquetas';
    this.document.head.appendChild(el);
    return el;
  })();

  protected setSource(value: Source): void {
    this.source.set(value);
  }

  protected setFormat(id: string): void {
    this.formatId.set(id);
    writePref(FORMAT_KEY, id);
  }

  protected setDesign(value: LabelDesign): void {
    this.design.set(value);
    writePref(DESIGN_KEY, value);
  }

  protected setBase(value: string): void {
    const clean = value.trim().replace(/\/+$/, '');
    this.base.set(clean);
    if (!this.baseError()) writePref(BASE_KEY, clean);
  }

  protected toggle(key: string): void {
    const set = new Set(this.excluded());
    if (set.has(key)) set.delete(key);
    else set.add(key);
    this.excluded.set([...set]);
  }

  protected print(): void {
    this.document.defaultView?.print();
  }
}
