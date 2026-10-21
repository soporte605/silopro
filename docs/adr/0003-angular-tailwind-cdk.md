# 0003 · Angular 22 zoneless + Tailwind CSS v4 + Angular CDK

**Contexto.** Requisito: Angular y Tailwind v4, sin React. Se necesitan comportamientos accesibles (diálogos, menús, superposiciones) sin adoptar una estética ajena.

**Decisión.**

- Angular 22 _standalone_, **zoneless**, _signals_, `OnPush`, carga diferida por ruta, runner Vitest.
- Tailwind CSS 4.3 vía PostCSS; tokens propios con `@theme inline`.
- **Angular CDK** para Dialog, Overlay, Menu (y Scrolling/A11y cuando haga falta). Se descartó Angular Material (estética Material, difícil de compactar) y PrimeNG/Spartan (dependencia de terceros en la capa visual; Spartan replica shadcn y conviene no acoplar la identidad a él). Los componentes visuales son propios en `@elikarsystems/ui`.
- Iconos Lucide (`@lucide/angular`, ISC).

**Consecuencias.** Control total de densidad y marca; más componentes que mantener. Las pruebas de la biblioteca se ejecutan con el runner de la app web hasta que se empaquete con ng-packagr.
