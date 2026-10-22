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

| Método y ruta         | Cuerpo                                          | Respuesta                                               |
| --------------------- | ----------------------------------------------- | ------------------------------------------------------- |
| `POST /auth/register` | `name, email, password (≥10), organizationName` | `201 Me`; crea organización (propietario) y 6 unidades  |
| `POST /auth/login`    | `email, password`                               | `200 Me`; `401` genérico; `429` tras 10 intentos/15 min |
| `POST /auth/logout`   | —                                               | `204`                                                   |
| `GET /auth/me`        | —                                               | `Me` (usuario y membresías) o `401`                     |

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

| Método y ruta             | Permiso                            | Notas                                                                                            |
| ------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| `GET locations`           | catalog.read                       | Con `path` legible, `qrCode` y `cabinetId` (si es un gabinete con diseño)                        |
| `GET locations/:id`       | catalog.read                       | Ficha: la ubicación, `parentCabinetId` (si es un cajón) y `contents` (artículos con existencias) |
| `POST locations`          | catalog.write                      | `kind, code, name, parentId?`; reglas de `ALLOWED_CHILDREN`                                      |
| `PATCH locations/:id`     | catalog.write                      | `code, name, parentId, version, maxItems?`; mueve el subárbol; `409 STALE_VERSION`               |
| `DELETE locations/:id`    | catalog.write                      | Archiva con su contenido; `422 LOCATION_HAS_STOCK` si hay existencias                            |
| `POST movements`          | stock.move (ajustes: stock.adjust) | `receipt`/`issue` con `quantity`; `adjustment` con `countedQuantity` y `reason`                  |
| `GET items/:id/stock`     | catalog.read                       | Existencias por ubicación; `cabinetId` si la ubicación es un cajón                               |
| `GET items/:id/movements` | catalog.read                       | Historial, más reciente primero                                                                  |

## Gabinetes · `/orgs/:orgId/cabinets`

Un gabinete es una ubicación de tipo `cabinet`; cada compartimento es una ubicación hija de tipo `drawer` cuyo código es su dirección (`A1`, `B12`, `3-4`). Las existencias se registran en los cajones con `POST movements` como en cualquier ubicación.

| Método y ruta                         | Permiso       | Notas                                                                                                             |
| ------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------- |
| `GET cabinets`                        | catalog.read  | Con tamaño, número de cajones y cajones ocupados                                                                  |
| `POST cabinets`                       | catalog.write | `parentId, code, name, rows (1–60), columns (1–60), addressing?, rowOrigin?`; crea un cajón por celda             |
| `GET cabinets/:id`                    | catalog.read  | Diseño completo; cada compartimento con `locationId`, `name`, `qrCode`, `itemCount` y `state`                     |
| `GET cabinets/:id/stock`              | catalog.read  | Una fila por artículo y cajón, con `lowStock`                                                                     |
| `PUT cabinets/:id/layout`             | catalog.write | `version, rows, columns, compartments[]` (diseño del motor); `409 STALE_VERSION`; `422 COMPARTMENT_HAS_STOCK`     |
| `PUT cabinets/:id/physical`           | catalog.write | `version, cellWidth, cellHeight, depth, wallThickness` (mm); `409 STALE_VERSION`. El gabinete devuelve `physical` |
| `PATCH cabinets/:id/compartments/:id` | catalog.write | `name` y/o `maxItems` (1–999 o `null`) del cajón                                                                  |

Al guardar un diseño la API lo valida con `assertCanonicalLayout` (sin huecos ni superposiciones; cada id coincide con su celda), archiva los cajones que desaparecen **solo si están vacíos** y restaura con su mismo id los que reaparecen. El esquema de direccionamiento se fija al crear el gabinete.

## Etiquetas QR · `/orgs/:orgId/qr`

Cada artículo y ubicación tiene un código corto aleatorio (`qrCode`, base32 Crockford de 10 caracteres). La etiqueta impresa lleva el enlace `<dirección>/q/<letra>/<código>` (`a` artículo, `u` ubicación); la web lo resuelve con la sesión de quien escanea y abre el artículo, el editor del gabinete o la ficha de la ubicación o cajón.

| Método y ruta        | Permiso      | Notas                                                                                                                |
| -------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------- |
| `GET qr/:type/:code` | catalog.read | `type` = `item` o `location`; devuelve `{ type, id, name, label, cabinetId, locationKind }`; `404` si no existe aquí |

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
