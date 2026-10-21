import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CdkContextMenuTrigger, CdkMenuTrigger } from '@angular/cdk/menu';
import {
  EsBadge,
  EsBreadcrumb,
  EsButton,
  EsCheckbox,
  EsCommandPaletteService,
  EsDialogService,
  EsEmptyState,
  EsFormField,
  EsInput,
  EsKbd,
  EsMenu,
  EsMenuItem,
  EsMenuSeparator,
  EsPagination,
  EsRadio,
  EsSelect,
  EsSkeleton,
  EsSwitch,
  EsTab,
  EsTable,
  EsTabs,
  EsToastService,
  EsTooltip,
} from '@elikarsystems/ui';
import {
  LucideCopy,
  LucideEllipsis,
  LucidePackageOpen,
  LucidePencil,
  LucidePlus,
  LucideTrash2,
} from '@lucide/angular';
import { ExampleDialog } from './example-dialog';

/**
 * Catálogo visual de @elikarsystems/ui. Sirve como documentación viva y
 * como banco de pruebas manual de accesibilidad (teclado y lector de pantalla).
 */
@Component({
  selector: 'sp-catalog',
  imports: [
    CdkMenuTrigger,
    CdkContextMenuTrigger,
    EsBadge,
    EsBreadcrumb,
    EsButton,
    EsCheckbox,
    EsEmptyState,
    EsFormField,
    EsInput,
    EsKbd,
    EsMenu,
    EsMenuItem,
    EsMenuSeparator,
    EsPagination,
    EsRadio,
    EsSelect,
    EsSkeleton,
    EsSwitch,
    EsTab,
    EsTable,
    EsTabs,
    EsTooltip,
    LucidePlus,
    LucidePencil,
    LucideCopy,
    LucideTrash2,
    LucideEllipsis,
    LucidePackageOpen,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host section {
      scroll-margin-top: 16px;
    }
  `,
  template: `
    <div class="mx-auto flex max-w-5xl flex-col gap-8 p-4 md:p-6">
      <header>
        <es-breadcrumb
          [items]="[
            { label: 'Design system', link: '/sistema/componentes' },
            { label: 'Componentes' },
          ]"
        />
        <h1 class="mt-2 text-xl font-semibold tracking-tight">&#64;elikarsystems/ui</h1>
        <p class="text-sm text-fg-muted">
          Componentes Angular sobre Tailwind CSS v4 y Angular CDK. Densidad alta, modo claro/oscuro
          y teclado.
        </p>
      </header>

      <section aria-labelledby="c-buttons" class="flex flex-col gap-3">
        <h2 id="c-buttons" class="text-sm font-semibold">Button</h2>
        <div class="flex flex-wrap items-center gap-2">
          <button esButton variant="primary"><svg lucidePlus></svg> Nuevo artículo</button>
          <button esButton>Exportar</button>
          <button esButton variant="secondary">Secundario</button>
          <button esButton variant="ghost">Fantasma</button>
          <button esButton variant="danger">Eliminar</button>
          <button esButton disabled>Deshabilitado</button>
          <button esButton iconOnly aria-label="Editar" esTooltip="Editar">
            <svg lucidePencil></svg>
          </button>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button esButton size="sm">Pequeño · 24</button>
          <button esButton size="md">Mediano · 28</button>
          <button esButton size="lg">Grande · 32</button>
        </div>
      </section>

      <section aria-labelledby="c-badges" class="flex flex-col gap-3">
        <h2 id="c-badges" class="text-sm font-semibold">Badge · Kbd</h2>
        <div class="flex flex-wrap items-center gap-2">
          <es-badge>Neutral</es-badge>
          <es-badge tone="primary">Primario</es-badge>
          <es-badge tone="success" dot>En stock</es-badge>
          <es-badge tone="warning" dot>Stock bajo</es-badge>
          <es-badge tone="danger" dot>Agotado</es-badge>
          <kbd esKbd>Ctrl</kbd><kbd esKbd>K</kbd>
        </div>
      </section>

      <section aria-labelledby="c-forms" class="flex flex-col gap-3">
        <h2 id="c-forms" class="text-sm font-semibold">
          Form field · Input · Select · Checkbox · Radio · Switch
        </h2>
        <div class="grid gap-4 sm:grid-cols-3">
          <es-form-field label="Nombre" hint="Visible en etiquetas" required #f1="esFormField">
            <input
              esInput
              [id]="f1.controlId"
              [attr.aria-describedby]="f1.describedBy()"
              placeholder="Resistencia 10 kΩ"
            />
          </es-form-field>
          <es-form-field label="SKU" error="El SKU ya existe" #f2="esFormField">
            <input
              esInput
              mono
              [id]="f2.controlId"
              aria-invalid="true"
              [attr.aria-describedby]="f2.describedBy()"
              value="RES-10K"
            />
          </es-form-field>
          <es-form-field label="Unidad" #f3="esFormField">
            <select esSelect [id]="f3.controlId">
              <option>Pieza</option>
              <option>Metro</option>
              <option>Kilogramo</option>
            </select>
          </es-form-field>
        </div>
        <div class="flex flex-wrap items-center gap-5 text-sm">
          <label class="flex items-center gap-2"
            ><input type="checkbox" esCheckbox checked /> Controlar stock</label
          >
          <label class="flex items-center gap-2"
            ><input type="checkbox" esCheckbox [indeterminate]="true" /> Parcial</label
          >
          <label class="flex items-center gap-2"
            ><input type="radio" esRadio name="r" checked /> Pieza</label
          >
          <label class="flex items-center gap-2"
            ><input type="radio" esRadio name="r" /> Lote</label
          >
          <span class="flex items-center gap-2">
            <button esSwitch [(checked)]="switchOn" aria-label="Alertas de stock bajo"></button>
            <span aria-hidden="true">Alertas de stock bajo</span>
          </span>
        </div>
      </section>

      <section aria-labelledby="c-tabs" class="flex flex-col gap-3">
        <h2 id="c-tabs" class="text-sm font-semibold">Tabs</h2>
        <es-tabs label="Detalle del artículo">
          <es-tab value="general" label="General"
            ><p class="text-sm text-fg-muted">Datos generales del artículo.</p></es-tab
          >
          <es-tab value="stock" label="Existencias"
            ><p class="text-sm text-fg-muted">Existencias por ubicación.</p></es-tab
          >
          <es-tab value="hist" label="Historial"
            ><p class="text-sm text-fg-muted">Movimientos recientes.</p></es-tab
          >
        </es-tabs>
      </section>

      <section aria-labelledby="c-table" class="flex flex-col gap-3">
        <h2 id="c-table" class="text-sm font-semibold">Table · Pagination · Menu</h2>
        <div class="overflow-hidden rounded-lg border border-border bg-surface">
          <table esTable>
            <thead>
              <tr>
                <th scope="col" class="w-8">
                  <input type="checkbox" esCheckbox aria-label="Seleccionar todo" />
                </th>
                <th scope="col">Artículo</th>
                <th scope="col">SKU</th>
                <th scope="col">Ubicación</th>
                <th scope="col" class="num">Disponible</th>
                <th scope="col" class="w-10"><span class="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              @for (r of rows; track r.sku) {
                <tr
                  [attr.aria-selected]="r.sku === 'MCU-ESP32S3'"
                  [cdkContextMenuTriggerFor]="rowMenu"
                >
                  <td>
                    <input
                      type="checkbox"
                      esCheckbox
                      [checked]="r.sku === 'MCU-ESP32S3'"
                      [attr.aria-label]="'Seleccionar ' + r.name"
                    />
                  </td>
                  <td>{{ r.name }}</td>
                  <td class="code">{{ r.sku }}</td>
                  <td class="code">{{ r.location }}</td>
                  <td class="num">
                    @if (r.qty <= r.min) {
                      <es-badge tone="warning" class="mr-1">bajo</es-badge>
                    }
                    {{ r.qty }}
                  </td>
                  <td>
                    <button
                      esButton
                      variant="ghost"
                      size="sm"
                      iconOnly
                      [attr.aria-label]="'Acciones de ' + r.name"
                      [cdkMenuTriggerFor]="rowMenu"
                    >
                      <svg lucideEllipsis></svg>
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
          <es-pagination
            class="border-t border-border px-3 py-1.5"
            [page]="page()"
            [pageSize]="4"
            [total]="128"
            (pageChange)="page.set($event)"
          />
        </div>
        <p class="text-xs text-fg-muted">Clic derecho sobre una fila abre el menú contextual.</p>
        <ng-template #rowMenu>
          <div esMenu>
            <button esMenuItem (triggered)="notify('Editar')">
              <svg lucidePencil></svg> Editar
            </button>
            <button esMenuItem (triggered)="notify('Duplicar')">
              <svg lucideCopy></svg> Duplicar
            </button>
            <div esMenuSeparator></div>
            <button esMenuItem data-danger (triggered)="notify('Eliminar')">
              <svg lucideTrash2></svg> Eliminar
            </button>
          </div>
        </ng-template>
      </section>

      <section aria-labelledby="c-overlays" class="flex flex-col gap-3">
        <h2 id="c-overlays" class="text-sm font-semibold">
          Dialog · Drawer · Toast · Command palette
        </h2>
        <div class="flex flex-wrap gap-2">
          <button esButton (click)="openDialog('center')">Abrir diálogo</button>
          <button esButton (click)="openDialog('right')">Abrir panel lateral</button>
          <button
            esButton
            (click)="
              toast.show('Artículo guardado', {
                tone: 'success',
                description: 'RES-10K · Cajón C4',
              })
            "
          >
            Toast de éxito
          </button>
          <button
            esButton
            (click)="
              toast.show('No se pudo guardar', {
                tone: 'danger',
                description: 'Existencias insuficientes',
              })
            "
          >
            Toast de error
          </button>
          <button esButton (click)="palette.toggle()">
            Paleta de comandos <kbd esKbd>Ctrl K</kbd>
          </button>
        </div>
      </section>

      <section aria-labelledby="c-states" class="flex flex-col gap-3 pb-8">
        <h2 id="c-states" class="text-sm font-semibold">Empty state · Skeleton</h2>
        <div class="grid gap-4 sm:grid-cols-2">
          <es-empty-state
            title="Sin artículos en este cajón"
            description="Asigne un artículo o escanee su etiqueta QR para ubicarlo aquí."
          >
            <svg esEmptyIcon lucidePackageOpen></svg>
            <button esEmptyActions esButton size="sm" variant="primary">
              <svg lucidePlus></svg> Asignar artículo
            </button>
          </es-empty-state>
          <div
            class="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3"
            aria-busy="true"
            aria-label="Cargando"
          >
            @for (i of [1, 2, 3, 4]; track i) {
              <div class="flex items-center gap-3">
                <es-skeleton class="size-6" />
                <es-skeleton class="h-3 flex-1" />
                <es-skeleton class="h-3 w-12" />
              </div>
            }
          </div>
        </div>
      </section>
    </div>
  `,
})
export default class Catalog {
  protected readonly toast = inject(EsToastService);
  protected readonly palette = inject(EsCommandPaletteService);
  private readonly dialogs = inject(EsDialogService);
  protected readonly page = signal(1);
  protected switchOn = true;

  protected readonly rows = [
    { name: 'ESP32-S3-WROOM-1', sku: 'MCU-ESP32S3', location: 'GAB-1 / C4', qty: 12, min: 3 },
    { name: 'Resistencia 10 kΩ 1/4 W', sku: 'RES-10K', location: 'GAB-1 / A2', qty: 840, min: 100 },
    { name: 'Sensor BME280', sku: 'SEN-BME280', location: 'GAB-2 / B7', qty: 2, min: 4 },
    { name: 'Tornillo M3×10', sku: 'TOR-M3X10', location: 'EST-3 / Caja 2', qty: 310, min: 50 },
  ];

  protected notify(action: string): void {
    this.toast.show(`${action}: acción de demostración`);
  }

  protected openDialog(placement: 'center' | 'right'): void {
    this.dialogs.open(ExampleDialog, { placement, size: placement === 'right' ? 'md' : 'sm' });
  }
}
