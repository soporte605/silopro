# Pruebas

## Estrategia

| Nivel                    | Herramienta                                                                                      | Alcance                                               | Ubicación                   |
| ------------------------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | --------------------------- |
| Unitarias de dominio     | Vitest                                                                                           | reglas puras, sin framework                           | `packages/*/src/*.spec.ts`  |
| Unitarias de componentes | Vitest + TestBed (runner de Angular)                                                             | `@elikarsystems/ui` y app web                         | `apps/web/src/**/*.spec.ts` |
| Integración API          | Vitest + SWC + Supertest                                                                         | módulo Nest completo sobre HTTP, con y sin PostgreSQL | `apps/api/test/*.spec.ts`   |
| End-to-end               | Playwright (escritorio y móvil)                                                                  | flujos reales en navegador                            | `apps/web/e2e/`             |
| Estáticas                | ESLint (typescript-eslint, angular-eslint con reglas de accesibilidad), `tsc` estricto, Prettier | todo                                                  | `eslint.config.js`          |

## Comandos

```bash
pnpm check                                   # lo mismo que la CI
pnpm test                                    # unitarias + integración
TEST_DATABASE_URL=postgres://silopro:silopro@localhost:5432/silopro pnpm --filter @silopro/api test
pnpm --filter @silopro/web e2e               # levanta ng serve en :4300
PLAYWRIGHT_CHROMIUM_PATH=/ruta/a/chromium pnpm --filter @silopro/web e2e   # Chromium preinstalado
```

## Última ejecución verificada (2026-10-21, v0.1.0-alpha.1)

| Suite                                        | Resultado                                                              |
| -------------------------------------------- | ---------------------------------------------------------------------- |
| `@silopro/domain`                            | 9/9 ✅                                                                 |
| `@silopro/cabinet-engine`                    | 17/17 ✅ (incluye 200×200 en < 1 s)                                    |
| `@silopro/contracts`                         | 3/3 ✅                                                                 |
| `@silopro/api`                               | 6/6 ✅ sin BD y con PostgreSQL 16                                      |
| `@silopro/web` (incluye `@elikarsystems/ui`) | 6/6 ✅                                                                 |
| e2e Playwright                               | 7 ✅ · 3 omitidas a propósito en móvil (atajos de teclado)             |
| Docker Compose                               | web + API + PostgreSQL 18: `/api/health` → `database: up` vía nginx ✅ |

La CI de GitHub Actions está definida pero **no se ha ejecutado** porque el repositorio aún no tiene remoto.

## Criterios de calidad por módulo

Cada módulo nuevo debe cumplir antes de considerarse terminado:

1. Reglas de negocio en `@silopro/domain` con pruebas de casos límite.
2. Endpoint con validación de entrada, prueba de integración feliz y de error, y **prueba de autorización entre organizaciones**.
3. Operaciones de stock: prueba de concurrencia (dos transacciones simultáneas no pueden dejar saldo negativo).
4. Pantalla con estados vacío, carga y error; navegable con teclado; sin errores de `templateAccessibility`.
5. Al menos un flujo e2e del caso principal.
6. Documentación actualizada (`DATA_MODEL`, API, `CHANGELOG`).

No se reportan como aprobadas pruebas que no se hayan ejecutado.
