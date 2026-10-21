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
TEST_DATABASE_URL=postgres://silopro:silopro@localhost:5432/silopro_test pnpm --filter @silopro/api test
# e2e: arranca la API compilada (:3000, base E2E_DATABASE_URL, por defecto silopro_e2e) y ng serve (:4300)
pnpm --filter @silopro/api build && pnpm --filter @silopro/web e2e
PLAYWRIGHT_CHROMIUM_PATH=/ruta/a/chromium pnpm --filter @silopro/web e2e   # Chromium preinstalado
```

## Última ejecución verificada (2026-10-21, v0.3.0-alpha.1)

| Suite                                                | Resultado                                                                                                                                                                   |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check` (formato, lint, tipos, pruebas, build)  | ✅                                                                                                                                                                          |
| `@silopro/domain`                                    | 21/21 ✅                                                                                                                                                                    |
| `@silopro/cabinet-engine`                            | 21/21 ✅ (incluye 200×200 en < 1 s)                                                                                                                                         |
| `@silopro/contracts`                                 | 3/3 ✅                                                                                                                                                                      |
| `@silopro/api` con PostgreSQL (rol sin superusuario) | 52/52 ✅: sesión, CSRF, límite de intentos, aislamiento por rutas/ids/FK/RLS, roles, atributos, versiones, concurrencia, fotografías, invitaciones, gabinetes (incl. 60×40) |
| `@silopro/web` (incluye `@elikarsystems/ui`)         | 10/10 ✅                                                                                                                                                                    |
| e2e Playwright contra la API real                    | 23 ✅ · 3 omitidas a propósito en móvil (atajos de teclado)                                                                                                                 |
| Docker Compose                                       | migraciones al arrancar; gabinete de 60×40 creado y guardado (181 KB) vía nginx ✅                                                                                          |

**Rendimiento del editor (60×40, 2400 cajones):** medido con Chromium sin interfaz contra `ng serve` (modo desarrollo, más lento que producción) y métricas de CDP: ≈ 7,5 ms de script y ≈ 1,7 ms de estilo y maquetación por clic, incluida la sobrecarga de Playwright. Las celdas viven en un componente `OnPush` aparte (`CabinetCells`) y la selección se dibuja en una capa encima, así que seleccionar no vuelve a evaluar las 2400 celdas. Guardar el diseño completo pesa unos 200 KB (límite JSON de la API: 1 MB).

CI de GitHub Actions en el repositorio privado `soporte605/silopro`: la primera ejecución (`v0.2.0-alpha.2`, commit `5249eab`) terminó en verde.

## Criterios de calidad por módulo

Cada módulo nuevo debe cumplir antes de considerarse terminado:

1. Reglas de negocio en `@silopro/domain` con pruebas de casos límite.
2. Endpoint con validación de entrada, prueba de integración feliz y de error, y **prueba de autorización entre organizaciones**.
3. Operaciones de stock: prueba de concurrencia (dos transacciones simultáneas no pueden dejar saldo negativo).
4. Pantalla con estados vacío, carga y error; navegable con teclado; sin errores de `templateAccessibility`.
5. Al menos un flujo e2e del caso principal.
6. Documentación actualizada (`DATA_MODEL`, API, `CHANGELOG`).

No se reportan como aprobadas pruebas que no se hayan ejecutado.
