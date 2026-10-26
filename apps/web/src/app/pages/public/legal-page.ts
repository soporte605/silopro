import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LEGAL, legalDate } from './legal-info';
import { PublicLayout } from './public-layout';

/** Marco de los documentos legales: título, fecha y estilo de texto largo. */
@Component({
  selector: 'sp-legal-page',
  imports: [PublicLayout],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sp-public-layout>
      <article
        class="mx-auto max-w-3xl px-4 py-10 text-sm leading-relaxed [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_li]:mt-1 [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5"
      >
        <h1 class="text-2xl font-semibold tracking-tight">{{ title() }}</h1>
        <p class="text-fg-muted">Última actualización: {{ date }}</p>
        @if (draft) {
          <p
            class="rounded-md border border-warning bg-warning-soft px-3 py-2 text-warning"
            role="note"
          >
            Borrador pendiente de revisión legal. Los datos entre corchetes se completarán antes del
            lanzamiento.
          </p>
        }
        <ng-content />
      </article>
    </sp-public-layout>
  `,
})
export class LegalPage {
  readonly title = input.required<string>();
  protected readonly date = legalDate;
  protected readonly draft = LEGAL.draft;
}
