import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { EsToaster } from '@elikarsystems/ui';

@Component({
  selector: 'sp-root',
  imports: [RouterOutlet, EsToaster],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet /><es-toaster />`,
})
export class App {}
