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

## Fase 2 — Inventario · `v0.2.0` · ✅ `v0.2.0-alpha.2` (funcionalidad completa; `v0.2.0` tras su revisión)

Autenticación (sesiones seguras, Argon2id), organizaciones y membresías con roles, aislamiento por organización (RLS), categorías jerárquicas con plantillas de atributos, artículos (SKU, código interno, fabricante, modelo, unidades, precios, costos, proveedores, stock mínimo), fotografías con almacenamiento seguro, tabla de movimientos con escritura transaccional, Drizzle + migraciones versionadas.

_Aceptación:_ pruebas de autorización entre organizaciones; CRUD completo con validación; e2e de alta de artículo; migraciones reproducibles.

| Criterio                              | Estado | Evidencia                                                |
| ------------------------------------- | :----: | -------------------------------------------------------- |
| Autorización entre organizaciones     |   ✅   | `apps/api/test/isolation.spec.ts`, e2e `auth.spec.ts`    |
| CRUD con validación compartida        |   ✅   | `@silopro/contracts`, `apps/api/test/inventory.spec.ts`  |
| e2e de alta de artículo y movimientos |   ✅   | `apps/web/e2e/inventory.spec.ts` (escritorio y móvil)    |
| Migraciones reproducibles             |   ✅   | `apps/api/drizzle/`, aplicadas desde cero en cada prueba |
| Concurrencia de existencias           |   ✅   | 12 salidas simultáneas sobre 5 → 5 aceptadas             |
| Fotografías con almacenamiento seguro |   ✅   | `apps/api/test/photos.spec.ts`, e2e `photos-members`     |
| Invitar miembros a una organización   |   ✅   | `apps/api/test/members.spec.ts`, e2e `photos-members`    |

## Fase 3 — Almacenamiento · `v0.3.0` · 🟡 `v0.3.0-alpha.5`

Almacenes y árbol de ubicaciones (reglas de `@silopro/domain`), gabinetes persistidos con el modelo de `@silopro/cabinet-engine`, editor 2D completo (crear, redimensionar, fusionar, etiquetar), existencias por ubicación, búsqueda que resalta posiciones, estados de ocupación.

_Aceptación:_ gabinete de 60×40 fluido (< 16 ms por interacción); un artículo en varias ubicaciones; validaciones de capacidad.

| Criterio                                                    | Estado | Evidencia                                                                                       |
| ----------------------------------------------------------- | :----: | ----------------------------------------------------------------------------------------------- |
| Gabinetes guardados y ligados a ubicaciones                 |   ✅   | `apps/api/test/cabinets.spec.ts`, e2e `cabinets.spec.ts`                                        |
| Editor 2D: crear, redimensionar, fusionar, dividir, nombrar |   ✅   | `/gabinetes/:id`; reglas en `@silopro/cabinet-engine` (`resizeLayout`, `assertCanonicalLayout`) |
| Existencias por cajón y estados de ocupación                |   ✅   | vacío / con existencias / stock bajo                                                            |
| Búsqueda que resalta posiciones                             |   ✅   | buscador del editor y enlace «ver en el gabinete» desde el artículo                             |
| Un artículo en varias ubicaciones                           |   ✅   | `stock_levels` por artículo × ubicación (desde la Fase 2)                                       |
| 60×40 fluido (< 16 ms por interacción)                      |   ✅   | ≈ 7,5 ms de script + 1,7 ms de estilo y maquetación por clic (ver `docs/TESTING.md`)            |
| Almacenes y árbol de ubicaciones editable                   |   ✅   | crear, renombrar, mover y archivar (`alpha.2`)                                                  |
| Validaciones de capacidad                                   |   ✅   | artículos distintos por ubicación o cajón (`alpha.2`)                                           |

## Fase 4 — Visualización 3D · `v0.4.0` · 🟡 `v0.4.0-alpha.1`

Three.js con carga diferida, gabinete modular con frentes transparentes, cámara orbital, selección por _raycasting_, apertura animada de cajones, panel de artículo, sincronización con ubicaciones. Representación separada del dominio (adaptador sobre `cabinet-engine`).

**Hecho en `v0.4.0-alpha.1`:** vista 3D en el editor del gabinete (botón «3D», se recuerda), Three.js en un fragmento aparte que solo se descarga al abrirla, modelo de escena en `cabinet-engine` (`cabinetSceneModel`, sin Three.js), cajones con `InstancedMesh`, frentes transparentes con la dirección impresa, cámara orbital (girar, acercar, encuadrar), selección por clic o con flechas del teclado, apertura animada, colores de ocupación iguales a la cuadrícula y el mismo panel de contenido. Pendiente: medidas físicas por gabinete (hoy se usan 40 × 30 × 120 mm por celda), abrir la vista 3D desde la ficha del artículo o de la ubicación y ver varios gabinetes de una estantería juntos.

## Fase 5 — Operaciones · `v0.5.0`

Entradas, salidas, ajustes, transferencias, reservas, consumos; bloqueo optimista/pesimista; auditoría inmutable; QR por artículo/ubicación; etiquetas PDF individuales y por lotes; escaneo desde móvil.

**Adelantado en `v0.3.0-alpha.3`:** etiquetas QR imprimibles (Carta, A4 y rollo térmico; imprimir o PDF) por gabinete, ubicaciones o artículos, y enlace `/q/…` que al escanearlo con la cámara del celular abre el cajón o el artículo. En `v0.3.0-alpha.5`, la etiqueta de un cajón abre su ficha para el celular con el contenido y entradas/salidas rápidas. Pendiente en esta fase: escáner dentro de la app (requiere HTTPS para usar la cámara desde el navegador).

## Fase 6 — Productividad · `v0.6.0`

Proyectos y listas de materiales (necesario / disponible / faltante / ubicación), reservas por proyecto, lista de compra, alertas de stock bajo, reportes operativos, importación CSV/Excel con vista previa y validación.

## Fase 7 — Fabricación · `v0.7.0`

Servicio CAD (CadQuery), modelos paramétricos de cajones, gabinetes, separadores y uniones; exportación STL/3MF; validación geométrica (manifold, espesores mínimos, volumen de impresión); división en piezas ensamblables; prototipos físicos en PLA/PETG en la Ender-3 V3 KE.

## Fase 8 — Comercialización · `v1.0.0`

Planes y límites, administración comercial, proveedor de pagos aprobado, despliegue en nube, endurecimiento de seguridad, Tauri (escritorio) y estrategia de sincronización implementada según el diseño documentado.
