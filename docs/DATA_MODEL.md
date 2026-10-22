# Modelo de datos

Estado: **implementado en la Fase 2** para usuarios, organizaciones, catálogo, ubicaciones, existencias y movimientos (`apps/api/src/db/schema.ts`, migraciones en `apps/api/drizzle/`). Fotografías, reservas, proyectos y auditoría administrativa siguen en diseño.

## Convenciones

- Claves primarias `uuid` v7 (`id`), generables en cliente para sincronización futura.
- Toda tabla de negocio: `organization_id`, `created_at`, `updated_at`, `version int` (bloqueo optimista).
- Cantidades `numeric(18,3)`; en TypeScript se operan como enteros escalados ×1000 (`@silopro/domain/stock.ts`).
- Borrado lógico (`archived_at`) para catálogos; los movimientos nunca se borran.
- Nombres en inglés en el esquema; etiquetas en español en la interfaz.

## Aislamiento por organización (ADR-0011, implementado)

- Cada tabla de negocio tiene `organization_id` y una política RLS `organization_id = app_current_org()`; las tablas tienen `FORCE ROW LEVEL SECURITY`.
- La API abre una transacción por petición (`DbService.tenant`) y fija `app.organization_id` y `app.user_id` con `set_config(..., true)`, que se descartan al terminar.
- Las claves foráneas entre tablas de negocio son compuestas `(organization_id, id)`: es imposible referenciar una categoría, unidad, proveedor o ubicación de otra organización aunque se conozca su id.
- La aplicación debe conectarse con un rol **sin** `SUPERUSER` ni `BYPASSRLS`; la API se niega a arrancar en producción si no es así y las pruebas también lo exigen.

## Entidades

```
users ── sessions (hash SHA-256 del token)
  │
organizations ─┬─ memberships (rol: owner/admin/operator/viewer) ── users      ✅
               ├─ invitations (hash SHA-256 del token, vence en 7 días)       ✅
               ├─ units (6 por defecto al registrar)                          ✅
               ├─ categories (árbol; attributes jsonb = definiciones)         ✅
               ├─ items (attributes jsonb validado por categoría)             ✅
               │     ├─ item_suppliers ── suppliers                           ✅
               │     └─ item_photos (archivos WebP en UPLOADS_DIR)            ✅
               ├─ locations (árbol; path materializado)                       ✅
               │     └─ cabinets (diseño jsonb del motor; cajones = locations) ✅
               ├─ stock_levels (item × location)                              ✅
               ├─ stock_movements (registro inmutable, trigger)               ✅
               ├─ reservations (activa → consumida / liberada)                ✅
               ├─ projects ── bom_lines                                       ⏳ F6
               └─ audit_log (solo inserción, trigger)                         ✅
```

### Ubicaciones (`@silopro/domain/locations.ts`, implementado)

Árbol de profundidad variable (máx. 12). Tipos: `warehouse`, `zone`, `room`, `shelving`, `shelf`, `cabinet`, `drawer`, `compartment`, `box`, `bin`, `other`. La raíz siempre es un almacén. `ALLOWED_CHILDREN` define qué tipos admite cada padre (un cajón contiene compartimentos, cajas o contenedores; una estantería contiene estantes; etc.), lo que permite tanto gabinetes como estanterías y cajas sueltas. Se rechazan ciclos al mover nodos.

Columnas actuales: `id, organization_id, parent_id, kind, code, name, path, qr_code, version, archived_at`. `path` es la ruta legible materializada (`TALLER / EST-1 / C3`). `code` es único por padre; `qr_code` único global (ADR-0010). Previstas para la Fase 3: `capacity jsonb, grid_row, grid_column, row_span, column_span`.

Un gabinete guarda su `CabinetLayout` (`@silopro/cabinet-engine`) y cada compartimento del layout se materializa como una ubicación hija (`drawer`/`compartment`) para poder asignarle existencias.

### Existencias (`@silopro/domain/stock.ts`, implementado)

`stock_levels(item_id, location_id, on_hand, reserved, allow_negative)` con `CHECK (reserved >= 0 AND reserved <= on_hand)` y `CHECK (on_hand >= 0 OR allow_negative)`. Disponible = `on_hand − reserved`. Un artículo puede estar en varias ubicaciones y una ubicación contener varios artículos.

`stock_movements(id, kind, item_id, location_id, delta, reason, transfer_id, reservation_id, actor_id, occurred_at)`; tipos implementados: `receipt`, `issue`, `adjustment` (fija la existencia al valor contado y exige motivo), `transfer` (dos filas, salida y entrada, con el mismo `transfer_id`) y `consumption` (salida desde una reserva, con su `reservation_id`). Un trigger impide `UPDATE` y `DELETE`.

`reservations(id, item_id, location_id, quantity, consumed, status, purpose, created_by, closed_at)` (migración `0009`, con RLS) con `CHECK (quantity > 0 AND consumed >= 0 AND consumed <= quantity)`. Mientras está activa, lo que queda (`quantity − consumed`) suma en `stock_levels.reserved`. Consumir libera esa parte y la saca como `consumption` en la misma transacción; liberar devuelve el resto a disponible. Ambos bloquean la reserva con `FOR UPDATE`.

`audit_log(id, actor_id, action, entity_id, label, details, ip, occurred_at)` (migración `0011`, RLS forzada, trigger que impide `UPDATE`/`DELETE`). Un interceptor global registra cada `POST`/`PUT`/`PATCH`/`DELETE` aceptado dentro de una organización: `action` es el método y la ruta sin prefijo (`PATCH items/:id`), `label` el SKU/código/nombre y `details` lo enviado sin campos con `pass`, `token` o `secret` (recortado a los nombres de campo si supera 4 KB). Se escribe tras la operación: si fallara, la operación no se revierte y queda en el registro de errores.

Escritura: dentro de la transacción se inserta la fila de `stock_levels` si no existe, se bloquea con `SELECT … FOR UPDATE`, se aplica `applyDelta` del dominio y se escriben nivel y movimiento. Prueba: 12 salidas concurrentes de 1 sobre una existencia de 5 → exactamente 5 aceptadas.

### Artículos y categorías

`items(id, sku, internal_code, name, description, category_id, manufacturer, model, unit_id, cost, price, min_stock, attributes jsonb, qr_code, version, archived_at)`; SKU único por organización sin distinguir mayúsculas. Los atributos se validan (`@silopro/domain/attributes.ts`) contra las definiciones **efectivas** de la categoría, es decir, las suyas más las heredadas de sus ancestros (tipo, unidad, obligatoriedad, opciones), lo que permite que «Resistencia» tenga _valor/tolerancia/potencia_ y «Refacción de compresor» tenga _marca/modelo de equipo/refrigerante_ sin cambiar el esquema.

### Fotografías e invitaciones (migraciones `0002` y `0003`)

- `item_photos`: dimensiones, bytes y `position` (la menor es la portada). FK compuesta a `items`; los archivos viven en `UPLOADS_DIR/<organización>/<id>-{full,thumb}.webp`, fuera de la raíz pública.
- `invitations`: correo en minúsculas (CHECK), rol, `token_hash` único, `expires_at`, `accepted_at/by`, `revoked_at`. El estado se deriva de esas columnas.
- Ambas tablas tienen RLS forzada como el resto de tablas de negocio.

### Gabinetes y anaqueles (migraciones `0004`, `0005`, `0007` y `0010`)

- `cabinets`: `location_id` único (la ubicación de tipo `cabinet`), `rows` y `columns` (1–60, CHECK), `addressing`, `row_origin` y `compartments` jsonb con el diseño de `@silopro/cabinet-engine`; medidas físicas en mm `cell_width`, `cell_height`, `depth`, `wall_thickness` (`real`, con CHECK de rango; por omisión 40, 30, 120 y 2); `version` para bloqueo optimista. FK compuesta a `locations` y RLS forzada.
- `locations.max_items` (NULL o 1–999, CHECK): capacidad en artículos distintos; la valida `MovementsService` al registrar entradas y ajustes, bloqueando la ubicación. El índice único `(organization_id, parent_id, code)` es parcial (`archived_at is null`).
- `cabinets.style` (`drawers` o `shelves`, CHECK): un gabinete es una ubicación `cabinet` con cajones `drawer`; un anaquel es una ubicación `shelving` con charolas `bin`, una fila por repisa (medidas por omisión 300 × 250 × 300 mm y 15 mm de repisa).
- Cada compartimento es una fila de `locations` de tipo `drawer` (o `bin` en un anaquel), hija del gabinete, con la dirección como `code` y ruta `ALMACÉN / GABINETE / A1`. Al fusionar, los cajones absorbidos se archivan (`archived_at`); al dividir se restauran, conservando su id, QR e historial.
