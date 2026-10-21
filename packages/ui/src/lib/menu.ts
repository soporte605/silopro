import { CdkMenu, CdkMenuItem } from '@angular/cdk/menu';
import { Directive } from '@angular/core';

/**
 * Menú desplegable / contextual sobre Angular CDK Menu (roles ARIA,
 * navegación con flechas, escritura anticipada, cierre con Escape).
 *
 *   <button esButton [cdkMenuTriggerFor]="m">Acciones</button>
 *   <ng-template #m><div esMenu><button esMenuItem>Editar</button></div></ng-template>
 *
 * Para menú contextual use `[cdkContextMenuTriggerFor]`.
 */
@Directive({
  selector: '[esMenu]',
  hostDirectives: [CdkMenu],
  host: {
    class:
      'flex min-w-40 flex-col rounded-md border border-border bg-surface-raised p-1 text-sm shadow-md outline-none',
  },
})
export class EsMenu {}

@Directive({
  selector: '[esMenuItem]',
  hostDirectives: [
    {
      directive: CdkMenuItem,
      inputs: ['cdkMenuItemDisabled: disabled'],
      outputs: ['cdkMenuItemTriggered: triggered'],
    },
  ],
  host: {
    class:
      'flex h-7 w-full cursor-pointer select-none items-center gap-2 rounded-sm px-2 text-left text-fg outline-none focus:bg-surface-active aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_svg]:size-3.5 [&_svg]:text-fg-muted data-[danger]:text-danger',
  },
})
export class EsMenuItem {}

@Directive({
  selector: '[esMenuSeparator]',
  host: { role: 'separator', class: 'my-1 h-px bg-border' },
})
export class EsMenuSeparator {}
