import { ChangeDetectionStrategy, Component } from '@angular/core';
import { EsToaster } from '@elikarsystems/ui';
import { Shell } from './layout/shell';

@Component({
  selector: 'sp-root',
  imports: [Shell, EsToaster],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<sp-shell /><es-toaster />`,
})
export class App {}
