# Modelo de datos

Estado: **diseño** (la persistencia se implementa en la Fase 2). Las reglas ya implementadas en código se indican con su módulo.

## Convenciones

- Claves primarias `uuid` v7 (`id`), generables en cliente para sincronización futura.
- Toda tabla de negocio: `organization_id`, `created_at`, `updated_at`, `version int` (bloqueo optimista).
- Cantidades `numeric(18,3)`; en TypeScript se operan como enteros escalados ×1000 (`@silopro/domain/stock.ts`).
- Borrado lógico (`archived_at`) para catálogos; los movimientos nunca se borran.
- Nombres en inglés en el esquema; etiquetas en español en la interfaz.

## Entidades

```
organizations ─┬─ memberships ── users
               ├─ categories (árbol) ── attribute_definitions
               ├─ items ── item_attributes (jsonb validado por categoría)
               │     ├─ item_suppliers ── suppliers
               │     └─ item_photos
               ├─ units
               ├─ locations (árbol) ── cabinet_layouts (jsonb del motor)
               ├─ stock_levels (item × location)
               ├─ stock_movements (registro inmutable)
               ├─ reservations
               ├─ projects ── bom_lines
               └─ audit_log
```

### Ubicaciones (`@silopro/domain/locations.ts`, implementado)

Árbol de profundidad variable (máx. 12). Tipos: `warehouse`, `zone`, `room`, `shelving`, `shelf`, `cabinet`, `drawer`, `compartment`, `box`, `bin`, `other`. La raíz siempre es un almacén. `ALLOWED_CHILDREN` define qué tipos admite cada padre (un cajón contiene compartimentos, cajas o contenedores; una estantería contiene estantes; etc.), lo que permite tanto gabinetes como estanterías y cajas sueltas. Se rechazan ciclos al mover nodos.

Columnas previstas: `id, organization_id, parent_id, kind, code, name, path ltree, qr_code char(10), capacity jsonb, grid_row, grid_column, row_span, column_span`. `code` es único por padre; `qr_code` único global (ADR-0010).

Un gabinete guarda su `CabinetLayout` (`@silopro/cabinet-engine`) y cada compartimento del layout se materializa como una ubicación hija (`drawer`/`compartment`) para poder asignarle existencias.

### Existencias (`@silopro/domain/stock.ts`, implementado)

`stock_levels(item_id, location_id, on_hand, reserved)` con `CHECK (reserved >= 0 AND reserved <= on_hand)` salvo permiso de negativos. Disponible = `on_hand − reserved`. Un artículo puede estar en varias ubicaciones y una ubicación contener varios artículos.

`stock_movements(id, kind, item_id, from_location_id, to_location_id, quantity, reason, project_id, actor_id, occurred_at)`; tipos: `receipt`, `issue`, `adjustment`, `transfer`, `consumption`, `reservation`, `release`. Cada escritura actualiza `stock_levels` en la misma transacción.

### Artículos y categorías

`items(id, sku, internal_code, name, description, category_id, manufacturer, model, unit_id, cost, price, min_stock, attributes jsonb, qr_code)`. Los atributos se validan contra `attribute_definitions` de la categoría (tipo, unidad, obligatoriedad, opciones), lo que permite que «Resistencia» tenga _valor/tolerancia/potencia_ y «Refacción de compresor» tenga _marca/modelo de equipo/refrigerante_ sin cambiar el esquema.
