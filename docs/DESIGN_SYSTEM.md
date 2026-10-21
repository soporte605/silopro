# Design system

`@elikarsystems/tokens` + `@elikarsystems/ui`. Catálogo vivo: **`/sistema/componentes`** en la aplicación web.

## Principios

Minimalismo funcional · alta densidad · bordes sutiles en lugar de sombras · tipografía legible a 13 px · teclado primero · accesibilidad WCAG 2.2 AA · claro y oscuro con los mismos tokens. Referentes estudiados: Linear, shadcn/ui, Radix Themes (principios, no código).

## Tokens

Tres capas en `packages/tokens/tokens.css`:

1. **Fuente de marca** — `--es-source-primary`, `--es-source-accent`, `--es-source-neutral`. Únicos valores a cambiar cuando lleguen los colores oficiales (hoy **provisionales**).
2. **Escalas** — `--es-primary-50…900`, `--es-accent-*`, `--es-neutral-*`, derivadas con `color-mix(in oklch, …)`.
3. **Semánticos** — `--es-bg`, `--es-surface(-raised|-sunken|-hover|-active)`, `--es-border(-strong)`, `--es-fg(-muted|-subtle)`, `--es-primary(-hover|-fg)`, `--es-accent(-fg|-soft)`, `--es-danger`, `--es-warning`, `--es-ring`…

`packages/tokens/tailwind.css` los expone a Tailwind v4 con `@theme inline` → utilidades `bg-surface`, `text-fg-muted`, `border-border`, `ring-ring`, etc. El tema se cambia en tiempo de ejecución con `data-theme="light|dark"` en `<html>` o por preferencia del sistema.

| Dimensión  | Valores                                                              |
| ---------- | -------------------------------------------------------------------- |
| Texto      | 11 / 12 / **13 (base)** / 14 / 16 / 20 px                            |
| Controles  | 24 (sm) / **28 (md)** / 32 (lg) px                                   |
| Radios     | 4 / 6 / 8 px                                                         |
| Sombras    | `sm` (controles), `md` (superposiciones)                             |
| Movimiento | 120 ms, `cubic-bezier(0.2,0,0,1)`; 0 ms con `prefers-reduced-motion` |

**Verde de marca y contraste:** `#67be28` sobre blanco no alcanza 4.5:1; para texto se usa `--es-accent-fg` (verde oscurecido). El verde puro se reserva para indicadores, barras y el isotipo.

## Componentes

Todos son _standalone_, `OnPush`, con _signals_, y se aplican **sobre elementos nativos** cuando existen (`<button esButton>`, `<input esInput>`, `<select esSelect>`), conservando semántica, formularios y accesibilidad del navegador. El comportamiento complejo se delega en **Angular CDK** (Dialog, Overlay, Menu), que aporta captura y restauración de foco, roles ARIA y navegación por teclado.

| Componente        | Selector                                                                                           | Variantes / API                                                                                     | Accesibilidad                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Button            | `button[esButton]`, `a[esButton]`                                                                  | `variant`: primary, secondary, outline, ghost, danger · `size`: sm, md, lg · `iconOnly` · `loading` | `aria-busy`; `iconOnly` exige `aria-label`                           |
| Badge             | `es-badge`                                                                                         | `tone`: neutral, primary, success, warning, danger · `dot`                                          | texto siempre presente (no solo color)                               |
| Kbd               | `kbd[esKbd]`                                                                                       | —                                                                                                   | —                                                                    |
| Input / Textarea  | `input[esInput]`, `textarea[esInput]`                                                              | `size`, `mono`                                                                                      | estado de error con `aria-invalid`                                   |
| Select            | `select[esSelect]`                                                                                 | nativo                                                                                              | nativo (móvil incluido)                                              |
| Checkbox / Radio  | `input[type=checkbox][esCheckbox]`, `[esRadio]`                                                    | `indeterminate`                                                                                     | nativo                                                               |
| Switch            | `button[esSwitch]`                                                                                 | `[(checked)]`                                                                                       | `role="switch"`, `aria-checked`                                      |
| Form field        | `es-form-field`                                                                                    | `label`, `hint`, `error`, `required`                                                                | `label for`, `aria-describedby`, error con `role="alert"`            |
| Tabs              | `es-tabs` + `es-tab`                                                                               | `[(value)]`                                                                                         | patrón WAI-ARIA, flechas/Inicio/Fin, tabindex itinerante             |
| Table             | `table[esTable]`                                                                                   | clases `num`, `code`; `aria-selected` en filas                                                      | HTML semántico con `th scope`                                        |
| Pagination        | `es-pagination`                                                                                    | `page`, `pageSize`, `total`, `(pageChange)`                                                         | `role="navigation"`                                                  |
| Breadcrumb        | `es-breadcrumb`                                                                                    | `items`                                                                                             | `aria-current="page"`                                                |
| Menu / contextual | `[esMenu]`, `[esMenuItem]`, `[esMenuSeparator]` + `cdkMenuTriggerFor` / `cdkContextMenuTriggerFor` | `disabled`, `(triggered)`, `data-danger`                                                            | CDK Menu: roles, flechas, _typeahead_, Escape                        |
| Tooltip           | `[esTooltip]`                                                                                      | `esTooltipPosition`                                                                                 | hover y foco, `aria-describedby`, Escape                             |
| Dialog / Drawer   | `EsDialogService.open(C, { placement: 'center' \| 'right', size })` + `es-dialog-shell`            | `title`, `description`, `[esDialogFooter]`                                                          | CDK Dialog: `aria-modal`, foco atrapado y restaurado                 |
| Toast             | `EsToastService.show()` + `es-toaster`                                                             | `tone`, `description`, `duration`                                                                   | `aria-live` polite / assertive (errores)                             |
| Command palette   | `EsCommandPaletteService.register()/toggle()`                                                      | grupos, sinónimos, atajos                                                                           | combobox + listbox con `aria-activedescendant`; búsqueda sin acentos |
| Skeleton          | `es-skeleton`                                                                                      | tamaño por utilidades                                                                               | `aria-hidden`; respeta movimiento reducido                           |
| Empty state       | `es-empty-state`                                                                                   | `title`, `description`, `[esEmptyIcon]`, `[esEmptyActions]`                                         | —                                                                    |
| Nav item          | `a[esNavItem]`                                                                                     | `routerLinkActive="is-active"`                                                                      | `ariaCurrentWhenActive`                                              |
| Tema              | `EsThemeService`                                                                                   | `system` / `light` / `dark`                                                                         | —                                                                    |

**Pendientes** (se construirán cuando una pantalla real los necesite, Fase 2–3): Data Grid virtualizado (CDK Scrolling), Combobox con búsqueda remota, Date picker, Toolbar con `role="toolbar"`, Sidebar colapsable, Search con sugerencias.

## Iconos

[Lucide](https://lucide.dev) vía `@lucide/angular` (ISC), trazo 2 px, 14–16 px en controles. Importación por icono para _tree-shaking_.

## Biblioteca reutilizable

`@elikarsystems/ui` vive en `packages/ui` y hoy se consume como código fuente (alias de TypeScript) desde la app web; sus pruebas se ejecutan con el runner de Angular de la web (`apps/web/src/ui-library.spec.ts`). Cuando otro producto (p. ej. FincaPro) la necesite se empaquetará con `ng-packagr` y se publicará en un registro privado — **publicar requiere autorización**.
