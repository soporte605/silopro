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
               ├─ units (6 por defecto al registrar)                          ✅
               ├─ categories (árbol; attributes jsonb = definiciones)         ✅
               ├─ items (attributes jsonb validado por categoría)             ✅
               │     ├─ item_suppliers ── suppliers                           ✅
               │     └─ item_photos                                           ⏳ F2 (alpha.2)
               ├─ locations (árbol; path materializado)                       ✅
               │     └─ cabinet_layouts (jsonb del motor)                     ⏳ F3
               ├─ stock_levels (item × location)                              ✅
               ├─ stock_movements (registro inmutable, trigger)               ✅
               ├─ reservations                                                ⏳ F5
               ├─ projects ── bom_lines                                       ⏳ F6
               └─ audit_log                                                   ⏳ F5
```

### Ubicaciones (`@silopro/domain/locations.ts`, implementado)

Árbol de profundidad variable (máx. 12). Tipos: `warehouse`, `zone`, `room`, `shelving`, `shelf`, `cabinet`, `drawer`, `compartment`, `box`, `bin`, `other`. La raíz siempre es un almacén. `ALLOWED_CHILDREN` define qué tipos admite cada padre (un cajón contiene compartimentos, cajas o contenedores; una estantería contiene estantes; etc.), lo que permite tanto gabinetes como estanterías y cajas sueltas. Se rechazan ciclos al mover nodos.

Columnas actuales: `id, organization_id, parent_id, kind, code, name, path, qr_code, version, archived_at`. `path` es la ruta legible materializada (`TALLER / EST-1 / C3`). `code` es único por padre; `qr_code` único global (ADR-0010). Previstas para la Fase 3: `capacity jsonb, grid_row, grid_column, row_span, column_span`.

Un gabinete guarda su `CabinetLayout` (`@silopro/cabinet-engine`) y cada compartimento del layout se materializa como una ubicación hija (`drawer`/`compartment`) para poder asignarle existencias.

### Existencias (`@silopro/domain/stock.ts`, implementado)

`stock_levels(item_id, location_id, on_hand, reserved, allow_negative)` con `CHECK (reserved >= 0 AND reserved <= on_hand)` y `CHECK (on_hand >= 0 OR allow_negative)`. Disponible = `on_hand − reserved`. Un artículo puede estar en varias ubicaciones y una ubicación contener varios artículos.

`stock_movements(id, kind, item_id, location_id, delta, reason, actor_id, occurred_at)`; tipos implementados: `receipt`, `issue`, `adjustment` (fija la existencia al valor contado y exige motivo). Previstos: `transfer`, `consumption` (F5). Un trigger impide `UPDATE` y `DELETE`.

Escritura: dentro de la transacción se inserta la fila de `stock_levels` si no existe, se bloquea con `SELECT … FOR UPDATE`, se aplica `applyDelta` del dominio y se escriben nivel y movimiento. Prueba: 12 salidas concurrentes de 1 sobre una existencia de 5 → exactamente 5 aceptadas.

### Artículos y categorías

`items(id, sku, internal_code, name, description, category_id, manufacturer, model, unit_id, cost, price, min_stock, attributes jsonb, qr_code, version, archived_at)`; SKU único por organización sin distinguir mayúsculas. Los atributos se validan (`@silopro/domain/attributes.ts`) contra las definiciones **efectivas** de la categoría, es decir, las suyas más las heredadas de sus ancestros (tipo, unidad, obligatoriedad, opciones), lo que permite que «Resistencia» tenga _valor/tolerancia/potencia_ y «Refacción de compresor» tenga _marca/modelo de equipo/refrigerante_ sin cambiar el esquema.
