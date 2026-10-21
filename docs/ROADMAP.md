# Hoja de ruta

Cada fase cierra con criterios de aceptación verificados, pruebas en verde y documentación actualizada. Solo entonces se etiqueta una versión.

**Ajuste respecto a la propuesta inicial:** las reglas de _movimientos y reservas_ (Fase 5) se modelan desde la Fase 2, porque «stock disponible / reservado» y el historial dependen de ellas; en la Fase 2 se implementa la tabla de movimientos y la escritura transaccional mínima (entrada inicial y ajuste), y la Fase 5 añade transferencias, reservas por proyecto, auditoría completa y QR. El motor de gabinetes se adelantó a la Fase 1 como paquete puro porque condiciona el modelo de ubicaciones.

## Fase 1 — Fundamentos · `v0.1.0-alpha.1` · ✅ completada

| Criterio                                                | Evidencia                                                       |
| ------------------------------------------------------- | --------------------------------------------------------------- |
| Monorepo con web, API y paquetes compartidos compilando | `pnpm build`                                                    |
| Calidad automatizada: formato, lint, tipos, pruebas     | `pnpm check`, `.github/workflows/ci.yml`                        |
| API arranca, valida entorno y expone salud con BD       | `apps/api/test/health.e2e.spec.ts` (con y sin PostgreSQL)       |
| Despliegue local con Docker                             | `infra/docker/compose.yaml` verificado (web + API + PostgreSQL) |
| Design system usable: tokens, componentes, catálogo     | `/sistema/componentes`, `apps/web/src/ui-library.spec.ts`       |
| Motor de gabinetes y reglas de dominio con pruebas      | `packages/*/src/*.spec.ts`                                      |
| Identidad: 3 conceptos × 10 variantes SVG               | `brand/concepts/`                                               |
| Documentación y ADRs                                    | `docs/`                                                         |

Marca: concepto B · S-Estante adoptado. Pendiente: colores oficiales de ElikarSystems.

## Fase 2 — Inventario · `v0.2.0` · 🟡 `v0.2.0-alpha.1` (falta fotografías)

Autenticación (sesiones seguras, Argon2id), organizaciones y membresías con roles, aislamiento por organización (RLS), categorías jerárquicas con plantillas de atributos, artículos (SKU, código interno, fabricante, modelo, unidades, precios, costos, proveedores, stock mínimo), fotografías con almacenamiento seguro, tabla de movimientos con escritura transaccional, Drizzle + migraciones versionadas.

_Aceptación:_ pruebas de autorización entre organizaciones; CRUD completo con validación; e2e de alta de artículo; migraciones reproducibles.

| Criterio                              | Estado | Evidencia                                                |
| ------------------------------------- | :----: | -------------------------------------------------------- |
| Autorización entre organizaciones     |   ✅   | `apps/api/test/isolation.spec.ts`, e2e `auth.spec.ts`    |
| CRUD con validación compartida        |   ✅   | `@silopro/contracts`, `apps/api/test/inventory.spec.ts`  |
| e2e de alta de artículo y movimientos |   ✅   | `apps/web/e2e/inventory.spec.ts` (escritorio y móvil)    |
| Migraciones reproducibles             |   ✅   | `apps/api/drizzle/`, aplicadas desde cero en cada prueba |
| Concurrencia de existencias           |   ✅   | 12 salidas simultáneas sobre 5 → 5 aceptadas             |
| Fotografías con almacenamiento seguro |   ⏳   | siguiente iteración (`v0.2.0-alpha.2`)                   |
| Invitar miembros a una organización   |   ⏳   | los roles ya se aplican; falta la pantalla de invitación |

## Fase 3 — Almacenamiento · `v0.3.0`

Almacenes y árbol de ubicaciones (reglas de `@silopro/domain`), gabinetes persistidos con el modelo de `@silopro/cabinet-engine`, editor 2D completo (crear, redimensionar, fusionar, etiquetar), existencias por ubicación, búsqueda que resalta posiciones, estados de ocupación.

_Aceptación:_ gabinete de 60×40 fluido (< 16 ms por interacción); un artículo en varias ubicaciones; validaciones de capacidad.

## Fase 4 — Visualización 3D · `v0.4.0`

Three.js con carga diferida, gabinete modular con frentes transparentes, cámara orbital, selección por _raycasting_, apertura animada de cajones, panel de artículo, sincronización con ubicaciones. Representación separada del dominio (adaptador sobre `cabinet-engine`).

## Fase 5 — Operaciones · `v0.5.0`

Entradas, salidas, ajustes, transferencias, reservas, consumos; bloqueo optimista/pesimista; auditoría inmutable; QR por artículo/ubicación; etiquetas PDF individuales y por lotes; escaneo desde móvil.

## Fase 6 — Productividad · `v0.6.0`

Proyectos y listas de materiales (necesario / disponible / faltante / ubicación), reservas por proyecto, lista de compra, alertas de stock bajo, reportes operativos, importación CSV/Excel con vista previa y validación.

## Fase 7 — Fabricación · `v0.7.0`

Servicio CAD (CadQuery), modelos paramétricos de cajones, gabinetes, separadores y uniones; exportación STL/3MF; validación geométrica (manifold, espesores mínimos, volumen de impresión); división en piezas ensamblables; prototipos físicos en PLA/PETG en la Ender-3 V3 KE.

## Fase 8 — Comercialización · `v1.0.0`

Planes y límites, administración comercial, proveedor de pagos aprobado, despliegue en nube, endurecimiento de seguridad, Tauri (escritorio) y estrategia de sincronización implementada según el diseño documentado.
