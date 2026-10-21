# CLAUDE.md

Lee primero [AGENTS.md](AGENTS.md): contiene las reglas del proyecto, que aplican íntegramente.

## Entorno

- Node 24 LTS y pnpm 12 (`corepack enable`). Tras clonar: `pnpm install && pnpm build:packages`.
- Los paquetes `@silopro/*` se consumen compilados (`dist/`); recompílalos (`pnpm build:packages`) después de cambiarlos si la app no ve los cambios.
- `@elikarsystems/ui` se consume como fuente vía alias de TypeScript; sus pruebas están en `apps/web/src/ui-library.spec.ts`.
- La API es ESM con decoradores: en pruebas se usa SWC (`apps/api/vitest.config.ts`). Inyecta dependencias con `@Inject(Clase)` explícito.
- Pruebas de API contra PostgreSQL: exporta `TEST_DATABASE_URL`.
- E2E con Chromium preinstalado: `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm --filter @silopro/web e2e`.

## Verificación mínima antes de entregar

```bash
pnpm check
pnpm --filter @silopro/web e2e
```
