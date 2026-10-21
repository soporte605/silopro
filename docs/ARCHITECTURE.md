# Arquitectura

## Visión general

**Monolito modular en un monorepo pnpm.** Una API NestJS y una aplicación Angular comparten paquetes TypeScript puros. Sin microservicios: los límites entre módulos se imponen con paquetes y dependencias explícitas, de modo que extraer un servicio más adelante (p. ej. el generador CAD) sea mecánico.

```
                ┌────────────────────────── apps/web (Angular 22) ──────────────────────────┐
                │ presentación: páginas, shell        @elikarsystems/ui  @elikarsystems/tokens│
                │ adaptadores de vista: SVG 2D (F3), Three.js 3D (F4)                         │
                └───────────────┬──────────────────────────────────────────────┬─────────────┘
                                │ HTTP /api (contratos zod)                     │ importa
                ┌───────────────▼────────────── apps/api (NestJS 12) ───────────┐      │
                │ módulos: health · (F2) auth, orgs, catalog, inventory ·        │      │
                │ (F3) locations, cabinets · (F5) movements, labels · (F6) bom   │      │
                │ capas por módulo: controller → application → domain ← infra    │      │
                └───────────────┬────────────────────────────────────────────────┘      │
                                │ SQL (Drizzle, F2)                                      │
                         ┌──────▼──────┐        ┌──────────── packages/ ───────────────▼─────┐
                         │ PostgreSQL  │        │ domain · cabinet-engine · contracts         │
                         └─────────────┘        │ (TypeScript puro, sin framework, con pruebas)│
                                                └─────────────────────────────────────────────┘
                (F7) servicio CAD en Python/CadQuery detrás de una cola de trabajos
```

## Paquetes y responsabilidades

| Paquete                   | Capa                                | Depende de                            | Prohibido                |
| ------------------------- | ----------------------------------- | ------------------------------------- | ------------------------ |
| `@silopro/domain`         | Dominio                             | nada                                  | Angular, NestJS, BD, DOM |
| `@silopro/cabinet-engine` | Motor de gabinetes                  | nada                                  | render (SVG/Three), BD   |
| `@silopro/contracts`      | Contratos                           | zod                                   | lógica de negocio        |
| `@elikarsystems/tokens`   | Diseño                              | —                                     | —                        |
| `@elikarsystems/ui`       | Componentes UI                      | Angular, CDK, tokens                  | dominio de SiloPro       |
| `apps/api`                | Aplicación + infraestructura + HTTP | domain, contracts                     | Angular                  |
| `apps/web`                | Presentación                        | ui, domain, cabinet-engine, contracts | acceso directo a BD      |

`@elikarsystems/ui` y `tokens` no conocen SiloPro: son reutilizables por FincaPro u otros productos.

## Capas dentro de un módulo de la API (a partir de Fase 2)

```
inventory/
  inventory.controller.ts   HTTP: valida con contracts, traduce errores
  inventory.service.ts      casos de uso: orquesta transacciones y autorización
  inventory.repository.ts   infraestructura: Drizzle/SQL
  inventory.module.ts
```

Las reglas (p. ej. «no reservar más de lo disponible») viven en `@silopro/domain` y se ejecutan **dentro** de la transacción, sobre filas bloqueadas (`SELECT … FOR UPDATE`) o con versión optimista. La base de datos refuerza con restricciones `CHECK` y claves foráneas.

## Representación gráfica separada

```
CabinetLayout (cabinet-engine)  ──►  vista 2D SVG (Angular)        F1 demo / F3 editor
               │                ──►  escena Three.js (adaptador)    F4
               └──────────────► ──►  modelo CAD (CadQuery)          F7
```

El mismo modelo lógico alimenta tres representaciones. La visualización 3D **no** es un archivo imprimible; el CAD se genera en un servicio aparte con validación geométrica.

## Multiempresa

Cada tabla de negocio lleva `organization_id`. Doble barrera: filtros en los repositorios y **Row Level Security** de PostgreSQL con `SET LOCAL app.organization_id` por transacción (ADR-0011). Pruebas de autorización obligatorias por endpoint.

## Local, escritorio y nube

1. **Hoy:** web + API + PostgreSQL con Docker en la red local.
2. **Escritorio (Tauri):** empaqueta la web; la API puede correr como _sidecar_ o apuntar a un servidor local/nube.
3. **Nube (SaaS):** la misma imagen de API, multiempresa con RLS.
4. **Sincronización offline:** diseñada antes de implementarse (ADR-0006): identificadores UUIDv7 generables en el cliente, columnas `version` y `updated_at`, y **movimientos como registro de eventos** (las existencias se derivan de movimientos, lo que convierte la mayoría de conflictos en sumas conmutativas). Conflictos no conmutativos (renombrar un artículo en dos lugares) se resuelven por campo con «último escritor gana» registrado en auditoría y revisión manual para reglas de stock que se violen al fusionar.

## Decisiones

Ver [ADRs](adr/). Resumen: pnpm sin Nx (0001), monolito modular (0002), Angular zoneless + Tailwind v4 + CDK (0003), PostgreSQL + Drizzle (0004), contratos zod (0005), UUIDv7 y preparación de sincronización (0006), Three.js para 3D (0007), CadQuery para CAD (0008), Geist (0009), QR opacos (0010), multiempresa con RLS (0011).
