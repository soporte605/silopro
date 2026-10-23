import { computed, inject, Injectable, resource } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import type { AlertSummary } from '@silopro/contracts';
import { filter } from 'rxjs';
import { Api } from './api';
import { SessionService } from './session';

/** Avisos (stock bajo, por comprar, proyectos con faltantes); se refrescan al navegar. */
@Injectable({ providedIn: 'root' })
export class AlertsService {
  private readonly api = inject(Api);
  private readonly session = inject(SessionService);

  readonly summary = resource({
    params: () => this.session.orgId() ?? undefined,
    loader: () => this.api.get<AlertSummary>('/alerts'),
  });

  /** Los avisos, o null mientras cargan o si la consulta falló. */
  readonly counts = computed(() => (this.summary.hasValue() ? this.summary.value() : null));

  constructor() {
    inject(Router)
      .events.pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => {
        if (this.session.orgId()) this.summary.reload();
      });
  }
}
