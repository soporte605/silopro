# API REST

Base: `/api`. Formato JSON. Esquemas de entrada y tipos de respuesta en `@silopro/contracts`.

## Convenciones

- **Sesión:** cookie `sp_session` (`HttpOnly`, `SameSite=Lax`). El navegador la envía sola; los clientes no web deben conservarla.
- **CSRF:** todo `POST`, `PATCH` y `DELETE` debe incluir `X-SiloPro-Request: 1`; sin ella la respuesta es `403`.
- **Organización:** las rutas de negocio llevan `/orgs/:orgId`. Una organización de la que no es miembro responde `404` (no se revela si existe).
- **Concurrencia:** las actualizaciones (`PATCH`) envían el `version` leído; si otra persona modificó el registro, `409 STALE_VERSION`.
- **Errores:** siempre `{ status, code, message, details? }`. `400 VALIDATION_ERROR` trae `details: [{ path, message }]`; `422 UNPROCESSABLE` trae reglas de negocio (atributos `[{ key, message }]`, existencias `{ code }`); `409 DUPLICATE` para claves únicas.
- **Cantidades:** números con hasta 3 decimales.

## Autenticación

| Método y ruta                    | Cuerpo                                          | Respuesta                                                                                        |
| -------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `POST /auth/register`            | `name, email, password (≥10), organizationName` | `201 Me`; crea organización (propietario) y 6 unidades; envía el enlace para confirmar el correo |
| `POST /auth/login`               | `email, password`                               | `200 Me`; `401` genérico; `429` tras 10 intentos/15 min                                          |
| `POST /auth/logout`              | —                                               | `204`                                                                                            |
| `GET /auth/me`                   | —                                               | `Me` (usuario con `emailVerified` y membresías) o `401`                                          |
| `POST /auth/verify-email`        | `token`                                         | `204`; `400 INVALID_LINK` si no es válido, ya se usó o venció (24 h)                             |
| `POST /auth/verify-email/resend` | — (con sesión)                                  | `204`; invalida el enlace anterior; `429` tras 3 por hora                                        |
| `POST /auth/password/forgot`     | `email`                                         | `204` exista o no la cuenta; envía el enlace (1 h, un solo uso); `429` tras 3 por hora           |
| `POST /auth/password/reset`      | `token, password (≥10)`                         | `204`; cambia la contraseña, confirma el correo y cierra todas las sesiones; `400 INVALID_LINK`  |

## Catálogo · `/orgs/:orgId/…`

| Método y ruta           | Permiso       | Notas                                                          |
| ----------------------- | ------------- | -------------------------------------------------------------- |
| `GET units`             | catalog.read  |                                                                |
| `POST units`            | catalog.write | `code, name, symbol, decimals (0–3)`                           |
| `GET categories`        | catalog.read  | Incluye `attributes` propios e `itemCount`                     |
| `POST categories`       | catalog.write | `name, parentId?, description?, attributes[]`                  |
| `PATCH categories/:id`  | catalog.write | + `version`; rechaza ciclos                                    |
| `DELETE categories/:id` | catalog.write | Archiva; `422` si tiene subcategorías activas                  |
| `GET suppliers`         | catalog.read  |                                                                |
| `POST suppliers`        | catalog.write | `name, contactName?, email?, phone?, website?, notes?`         |
| `PATCH suppliers/:id`   | catalog.write | + `version`                                                    |
| `GET items`             | catalog.read  | `q, categoryId, lowStock, limit (≤200), offset` → `Page<Item>` |
| `GET items/:id`         | catalog.read  | Con `onHand`, `reserved`, `available`, `lowStock`              |
| `POST items`            | catalog.write | Atributos validados contra la categoría y sus ancestros        |
| `PATCH items/:id`       | catalog.write | + `version`                                                    |
| `DELETE items/:id`      | catalog.write | Archiva                                                        |

## Fotografías · `/orgs/:orgId/items/:itemId/photos`

| Método y ruta             | Permiso       | Notas                                                                                    |
| ------------------------- | ------------- | ---------------------------------------------------------------------------------------- |
| `GET photos`              | catalog.read  | En orden; la primera es la portada (`Item.coverPhotoId`)                                 |
| `POST photos`             | catalog.write | `multipart/form-data`, campo `file`; JPEG, PNG o WebP ≤ 8 MB; máx. 10; `413`/`415`/`422` |
| `GET photos/:id/thumb`    | catalog.read  | WebP 480 px; `Cache-Control: private, immutable`                                         |
| `GET photos/:id/full`     | catalog.read  | WebP 2000 px                                                                             |
| `POST photos/:id/portada` | catalog.write | La mueve al primer lugar                                                                 |
| `DELETE photos/:id`       | catalog.write | Borra el registro y los archivos                                                         |

## Ubicaciones y existencias · `/orgs/:orgId/…`

| Método y ruta                   | Permiso                            | Notas                                                                                                                                                                                               |
| ------------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET locations`                 | catalog.read                       | Con `path` legible, `qrCode` y `cabinetId` (si es un gabinete con diseño)                                                                                                                           |
| `GET locations/:id`             | catalog.read                       | Ficha: la ubicación, `parentCabinetId` (si es un cajón) y `contents` (artículos con existencias)                                                                                                    |
| `POST locations`                | catalog.write                      | `kind, code, name, parentId?`; reglas de `ALLOWED_CHILDREN`                                                                                                                                         |
| `PATCH locations/:id`           | catalog.write                      | `code, name, parentId, version, maxItems?`; mueve el subárbol; `409 STALE_VERSION`                                                                                                                  |
| `DELETE locations/:id`          | catalog.write                      | Archiva con su contenido; `422 LOCATION_HAS_STOCK` si hay existencias                                                                                                                               |
| `POST movements`                | stock.move (ajustes: stock.adjust) | `receipt`/`issue` con `quantity`; `adjustment` con `countedQuantity` y `reason`                                                                                                                     |
| `POST transfers`                | stock.move                         | `itemId, fromLocationId, toLocationId, quantity, reason?`: salida y entrada en una transacción, unidas por `transferId`; `422` si no alcanza lo disponible o el destino está lleno (no cambia nada) |
| `GET movements`                 | catalog.read                       | Diario de la organización: `kind?, itemId?, locationId?, from?, to?` (AAAA-MM-DD), `limit` (≤200) y `before` (cursor); devuelve `{ movements, nextCursor }`                                         |
| `GET movements/export`          | catalog.read                       | Los mismos filtros en CSV UTF-8 para Excel (hasta 10 000 filas); neutraliza fórmulas                                                                                                                |
| `GET audit`                     | members.manage                     | Bitácora: `actorId?, entityId?, from?, to?, limit, before`; `{ entries, nextCursor }`                                                                                                               |
| `GET transfers`                 | catalog.read                       | Últimas 50 transferencias; `?itemId=` filtra por artículo                                                                                                                                           |
| `GET reservations`              | catalog.read                       | Últimas 200 reservas; `?status=active\|released\|consumed` e `?itemId=` filtran                                                                                                                     |
| `POST reservations`             | stock.move                         | `itemId, locationId, quantity, purpose, projectId?`: aparta de lo disponible (`422` si no alcanza)                                                                                                  |
| `POST reservations/:id/consume` | stock.move                         | `quantity?, reason?` (por omisión, todo lo que queda): movimiento `consumption` unido por `reservationId`; `422 EXCEEDS_RESERVATION` / `RESERVATION_CLOSED`                                         |
| `POST reservations/:id/release` | stock.move                         | Devuelve lo que queda a disponible y cierra la reserva                                                                                                                                              |
| `GET items/:id/stock`           | catalog.read                       | Existencias por ubicación; `cabinetId` si la ubicación es un cajón                                                                                                                                  |
| `GET items/:id/movements`       | catalog.read                       | Historial, más reciente primero                                                                                                                                                                     |

## Proyectos y lista de materiales · `/orgs/:orgId/projects`

Un proyecto (o pedido, orden de trabajo) tiene `code` único por organización, `status` (`draft`, `active`, `done`, `cancelled`) y `dueDate?` (AAAA-MM-DD). Cada línea de su lista de materiales indica cuánto necesita de un artículo. El estado de cada línea se calcula al consultarla: `consumed` y `reserved` salen de las reservas con ese `projectId`, `available` es lo libre en todo el almacén, `pending = max(required − consumed − reserved, 0)` y `shortage = max(pending − available, 0)`. `sources` lista las ubicaciones con existencias libres (con `cabinetId` si es un cajón), de más a menos.

| Método y ruta                       | Permiso      | Notas                                                                                                                         |
| ----------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `GET projects`                      | catalog.read | Resumen con `lineCount`, `coveredCount` y `shortageCount`; `?status=` filtra                                                  |
| `POST projects`                     | stock.move   | `code, name, description?, status?, dueDate?`; `409 DUPLICATE` si el código existe                                            |
| `GET projects/:id`                  | catalog.read | Detalle: resumen, `lines` con su estado y `sources`, y `reservations` del proyecto                                            |
| `PATCH projects/:id`                | stock.move   | Los mismos campos más `version`; `409 STALE_VERSION`                                                                          |
| `POST projects/:id/lines`           | stock.move   | `itemId, quantity, notes?`; si el artículo ya está, suma la cantidad                                                          |
| `PATCH projects/:id/lines/:lineId`  | stock.move   | `quantity, notes?`                                                                                                            |
| `DELETE projects/:id/lines/:lineId` | stock.move   | Quita la línea; sus reservas siguen activas                                                                                   |
| `POST projects/:id/reserve-all`     | stock.move   | Aparta todo lo pendiente que haya libre, de las ubicaciones con más existencias; `{ project, created }`; `422 PROJECT_CLOSED` |
| `POST projects/:id/release-all`     | stock.move   | Libera las reservas activas del proyecto                                                                                      |

## Lista de compras y avisos · `/orgs/:orgId/…`

Se calcula al consultar. Por artículo: `projectPending` es lo pendiente en proyectos abiertos (`draft` o `active`), y `toBuy = max(projectPending + minStock − available, 0)`, redondeado hacia arriba si la unidad no admite decimales. El proveedor es el primero por nombre de los vinculados al artículo.

| Método y ruta              | Permiso      | Notas                                                                                                             |
| -------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------- |
| `GET shopping-list`        | catalog.read | `{ lines, estimatedTotal, missingCost }`; cada línea con `toBuy`, `reasons` (proyecto o stock mínimo) y proveedor |
| `GET shopping-list/export` | catalog.read | La misma lista en CSV UTF-8 para Excel                                                                            |
| `GET alerts`               | catalog.read | `{ lowStock, toBuy, projectsShort }` para los avisos de inicio y del menú                                         |

## Asistente con IA · `/orgs/:orgId/assistant`

Chat sin estado: el navegador envía la conversación completa (solo texto, hasta 20 turnos de 2,000 caracteres; empieza y termina con el usuario). La API consulta a Claude con herramientas de solo lectura que pasan por los servicios de arriba con el contexto del usuario (`localizar`, `que_comprar`, `proyectos`, `movimientos`) y suma preguntas y tokens del mes en `assistant_usage`.

| Método y ruta | Permiso      | Notas                                                                                                                                                                                                                               |
| ------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`         | catalog.read | `{ enabled, quota: { used, limit } }`; `limit` `null` = sin límite                                                                                                                                                                  |
| `POST chat`   | catalog.read | `{ messages }` → `{ answer, hits, quota }`; `hits` son los artículos localizados (como `GET locate`). `402 ASSISTANT_LIMIT` (cupo del mes), `503 ASSISTANT_DISABLED` (sin clave), `429 ASSISTANT_BUSY`, `503 ASSISTANT_UNAVAILABLE` |

## Reportes · `/orgs/:orgId/reports`

Se calculan al consultar. Cada uno tiene su versión CSV en `…/export` con los mismos parámetros.

| Método y ruta           | Permiso      | Notas                                                                                                                                                                                                                     |
| ----------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET reports/valuation` | catalog.read | `{ rows, byCategory, totalValue, missingCost }`: existencia en ubicaciones vigentes × costo del artículo; los artículos sin costo no suman                                                                                |
| `GET reports/movements` | catalog.read | `from`, `to` (AAAA-MM-DD, hasta un año) y `tz` (zona IANA, por omisión `UTC`). Por artículo: `received`, `issued` (salidas y consumos), `adjusted`, `net`, `transferred` y `movements` (una transferencia cuenta una vez) |
| `GET reports/stale`     | catalog.read | `days` (1 a 3650, por omisión 90): artículos con existencia cuyo último movimiento es más antiguo, con su valor                                                                                                           |

## Importación · `/orgs/:orgId/import`

La web lee el archivo (Excel `.xlsx` o CSV con coma o punto y coma) y envía las filas con las columnas ya elegidas: `sku, name, unit, category?, internalCode?, manufacturer?, model?, description?, cost?, price?, minStock?, quantity?, location?`. La unidad se reconoce por código, símbolo o nombre; la categoría, por nombre; la ubicación, por ruta (`ALM / C1`) o por código si es único.

| Método y ruta       | Permiso       | Notas                                                                                                                                                                                                                                                                                          |
| ------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST import/items` | catalog.write | `rows` (hasta 2000), `dryRun` (por omisión `true`) y `updateExisting`. Devuelve qué pasa con cada fila (`create`, `update`, `skip`, `error`). Sin `dryRun`, importa todo en una transacción o nada (`422 IMPORT_INVALID` con el detalle). Las cantidades son entradas con motivo «Importación» |

## Gabinetes · `/orgs/:orgId/cabinets`

Un gabinete es una ubicación de tipo `cabinet`; cada compartimento es una ubicación hija de tipo `drawer` cuyo código es su dirección (`A1`, `B12`, `3-4`). Las existencias se registran en los cajones con `POST movements` como en cualquier ubicación.

| Método y ruta                         | Permiso       | Notas                                                                                                                          |
| ------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `GET cabinets`                        | catalog.read  | Con `style`, tamaño, `parentId` (dónde está), número de cajones y ocupados                                                     |
| `POST cabinets`                       | catalog.write | `style? (drawers\|shelves), parentId, code, name, rows, columns, addressing?, rowOrigin?`; crea un cajón (o charola) por celda |
| `GET cabinets/:id`                    | catalog.read  | Diseño completo; cada compartimento con `locationId`, `name`, `qrCode`, `itemCount` y `state`                                  |
| `GET cabinets/:id/stock`              | catalog.read  | Una fila por artículo y cajón, con `lowStock`                                                                                  |
| `PUT cabinets/:id/layout`             | catalog.write | `version, rows, columns, compartments[]` (diseño del motor); `409 STALE_VERSION`; `422 COMPARTMENT_HAS_STOCK`                  |
| `PUT cabinets/:id/physical`           | catalog.write | `version, cellWidth, cellHeight, depth, wallThickness` (mm); `409 STALE_VERSION`. El gabinete devuelve `physical`              |
| `PATCH cabinets/:id/compartments/:id` | catalog.write | `name` y/o `maxItems` (1–999 o `null`) del cajón                                                                               |

Al guardar un diseño la API lo valida con `assertCanonicalLayout` (sin huecos ni superposiciones; cada id coincide con su celda), archiva los cajones que desaparecen **solo si están vacíos** y restaura con su mismo id los que reaparecen. El esquema de direccionamiento se fija al crear el gabinete.

## Etiquetas QR · `/orgs/:orgId/qr`

Cada artículo y ubicación tiene un código corto aleatorio (`qrCode`, base32 Crockford de 10 caracteres). La etiqueta impresa lleva el enlace `<dirección>/q/<letra>/<código>` (`a` artículo, `u` ubicación); la web lo resuelve con la sesión de quien escanea y abre el artículo, el editor del gabinete o la ficha de la ubicación o cajón.

| Método y ruta        | Permiso      | Notas                                                                                                                |
| -------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------- |
| `GET qr/:type/:code` | catalog.read | `type` = `item` o `location`; devuelve `{ type, id, name, label, cabinetId, locationKind }`; `404` si no existe aquí |

## Plan y facturación · `/orgs/:orgId/billing`

Planes y límites en `@silopro/domain/plans.ts`. Al exceder un límite, la escritura responde `402 PLAN_LIMIT` con `details: { kind, limit, used }` (`kind`: `users` cuenta miembros e invitaciones pendientes, `items` artículos no archivados, `storage` bytes de fotos). Si la prueba terminó o la suscripción no está activa (`active`, `trialing`, `past_due`), toda escritura de la organización responde `402 READ_ONLY`, salvo contratar.

| Método y ruta   | Permiso             | Notas                                                                                                                                                                       |
| --------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET billing`   | catalog.read        | `BillingSummary`: plan, `readOnly`, prueba, estado de la suscripción, periodo, límites, uso y `checkoutAvailable`                                                           |
| `POST checkout` | organization.manage | `plan` (`basic`/`pro`), `interval` (`month`/`year`) → `{ url }` de Stripe Checkout; `400 ALREADY_SUBSCRIBED` o `PRICE_NOT_CONFIGURED`; `503 BILLING_UNAVAILABLE` sin Stripe |
| `POST portal`   | organization.manage | `{ url }` del portal de cliente de Stripe; `400 NO_SUBSCRIPTION` si aún no hay cliente                                                                                      |

`POST /billing/webhook` (sin sesión ni cabecera CSRF) recibe los eventos `customer.subscription.created|updated|deleted` firmados con `STRIPE_WEBHOOK_SECRET`; `400` si la firma no es válida.

## Miembros e invitaciones · `/orgs/:orgId/…`

| Método y ruta            | Permiso        | Notas                                                                                            |
| ------------------------ | -------------- | ------------------------------------------------------------------------------------------------ |
| `GET members`            | catalog.read   | Nombre, correo, rol y fecha de alta                                                              |
| `PATCH members/:userId`  | members.manage | `role`; solo un propietario asigna o quita el rol propietario; `422 LAST_OWNER`                  |
| `DELETE members/:userId` | members.manage | Cualquiera puede salir de la organización (salvo el último propietario)                          |
| `GET invitations`        | members.manage | Con `status`: `pending`, `accepted`, `revoked`, `expired`                                        |
| `POST invitations`       | members.manage | `email, role` → `201` con `url` (se muestra una sola vez); vence en 7 días; `409 ALREADY_MEMBER` |
| `DELETE invitations/:id` | members.manage | Revoca                                                                                           |

Rutas públicas del enlace (`/invitacion/:orgId/:token` en la web):

| Método y ruta                           | Sesión | Notas                                                                   |
| --------------------------------------- | ------ | ----------------------------------------------------------------------- |
| `GET invitations/:orgId/:token`         | no     | Organización, quien invita, correo, rol y estado; `404` si no es válido |
| `POST invitations/:orgId/:token/accept` | sí     | El correo de la sesión debe coincidir (`403 INVITATION_EMAIL_MISMATCH`) |

## Roles

| Permiso        | Propietario | Administrador | Operador | Consulta |
| -------------- | :---------: | :-----------: | :------: | :------: |
| catalog.read   |      ✓      |       ✓       |    ✓     |    ✓     |
| catalog.write  |      ✓      |       ✓       |          |          |
| stock.move     |      ✓      |       ✓       |    ✓     |          |
| stock.adjust   |      ✓      |       ✓       |          |          |
| stock.negative |      ✓      |               |          |          |
| members.manage |      ✓      |       ✓       |          |          |
