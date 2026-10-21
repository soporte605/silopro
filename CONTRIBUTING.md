# Guía de contribución

## Flujo

1. Rama desde `main`: `feat/inventario-articulos`, `fix/stock-negativo`, `docs/…`.
2. Commits con [Conventional Commits](https://www.conventionalcommits.org/es/) **en español**:
   - `feat(inventario): agregar registro de artículos`
   - `fix(stock): corregir validación de existencias`
   - `docs(arquitectura): documentar modelo de ubicaciones`
   - `test(inventario): agregar pruebas de transferencias`
   - Tipos: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore`, `style`. Ámbitos sugeridos: `api`, `web`, `ui`, `tokens`, `dominio`, `gabinetes`, `inventario`, `stock`, `marca`, `infra`.
3. `pnpm check` en verde antes de abrir PR.
4. Actualizar `CHANGELOG.md` (sección «Sin publicar») y la documentación afectada.

## Convenciones de código

- TypeScript estricto (`strict`, `noUncheckedIndexedAccess`). Sin `any` salvo justificación.
- Nombres de código en inglés; textos de interfaz, comentarios y documentación en español.
- Reglas de negocio en `packages/domain` (puras, con pruebas). Nada de lógica de negocio en controladores ni componentes.
- Angular: componentes _standalone_, `OnPush`, _signals_, `input()`/`model()`/`output()`, control de flujo `@if/@for`. Componentes visuales genéricos van en `@elikarsystems/ui`.
- NestJS: inyectar con `@Inject(Token)` explícito; validar entradas con esquemas de `@silopro/contracts`.
- Accesibilidad: todo control operable con teclado; `aria-label` en botones de solo icono; el lint de plantillas debe pasar.
- Dependencias nuevas: justificar en el PR (licencia, tamaño, mantenimiento). Scripts de instalación solo vía `allowBuilds`.

## Versionado

SemVer. La versión vive en los `package.json` y en `apps/api/src/version.ts`. Etiquetas solo para entregables validados.
