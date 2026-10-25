import { ChangeDetectionStrategy, Component, input, linkedSignal } from '@angular/core';
import { EsTab, EsTabs } from '@elikarsystems/ui';
import { PageHeader } from '../page-header';
import { MovementsReport } from './movements-report';
import { StaleReport } from './stale-report';
import { ValuationReport } from './valuation-report';

/** Reportes operativos: valor del inventario, movimientos del periodo y sin movimiento. */
@Component({
  selector: 'sp-reports',
  imports: [EsTab, EsTabs, MovementsReport, PageHeader, StaleReport, ValuationReport],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mx-auto flex max-w-6xl flex-col gap-4 p-4 md:p-6">
      <sp-page-header
        title="Reportes"
        description="Cuánto vale lo que tiene, qué entró y salió en un periodo y qué lleva tiempo sin moverse. Cada reporte se descarga en CSV para Excel."
      />
      <es-tabs label="Reportes" [(value)]="tab">
        <es-tab value="valor" label="Valor del inventario"><sp-valuation-report /></es-tab>
        <es-tab value="movimientos" label="Movimientos del periodo"><sp-movements-report /></es-tab>
        <es-tab value="sin-movimiento" label="Sin movimiento"><sp-stale-report /></es-tab>
      </es-tabs>
    </div>
  `,
})
export default class Reports {
  /** Pestaña inicial desde `?vista=`. */
  readonly vista = input<string>();
  protected readonly tab = linkedSignal(() => this.vista() ?? 'valor');
}
