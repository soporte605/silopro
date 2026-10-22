# SiloPro

**Sistema universal de inventario y almacenamiento inteligente.** Un producto de [ElikarSystems](https://elikarsystems.com/).

SiloPro conecta el inventario digital con la organización física: almacenes, estanterías, gabinetes, cajones y compartimentos se representan virtualmente y cada artículo tiene una ubicación identificable. Más adelante el sistema generará modelos CAD paramétricos para fabricar organizadores por impresión 3D.

> Estado: **v0.5.0-alpha.2 — Fase 5 (Operaciones)**; Fases 1 a 4 cerradas. Inventario completo (Fase 2), gabinetes guardados con editor 2D y vista 3D (cada cajón es una ubicación con sus existencias), ubicaciones editables, capacidad por cajón, etiquetas QR imprimibles, transferencias y reservas. Ver [ROADMAP](docs/ROADMAP.md).

## Qué hay hoy

| Área                                                                                                                        | Estado                                 |
| --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Monorepo pnpm (Angular 22 + NestJS 12 + paquetes de dominio)                                                                | ✅                                     |
| Cuentas y organizaciones: registro, inicio de sesión, roles, aislamiento entre organizaciones (RLS)                         | ✅ con pruebas                         |
| Catálogo: artículos, categorías jerárquicas con atributos propios, proveedores, unidades                                    | ✅ `/inventario`, `/categorias`        |
| Ubicaciones y existencias: entradas, salidas, ajustes por conteo, historial, alertas de mínimo                              | ✅ `/ubicaciones`, detalle de artículo |
| Fotografías de artículos e invitación de miembros                                                                           | ✅ detalle de artículo, `/miembros`    |
| API: `GET /api/health`, configuración validada, errores uniformes, cabeceras de seguridad                                   | ✅                                     |
| Motor de gabinetes (`@silopro/cabinet-engine`): cuadrícula, direccionamiento, fusión/división, planificación para impresora | ✅ con pruebas                         |
| Reglas de dominio (`@silopro/domain`): jerarquía de ubicaciones, existencias y reservas                                     | ✅ con pruebas                         |
| Design system: tokens (`@elikarsystems/tokens`) y componentes (`@elikarsystems/ui`)                                         | ✅ catálogo en `/sistema/componentes`  |
| Gabinetes guardados con editor 2D (fusionar, dividir, redimensionar, buscar) y demostración en `/gabinetes/demo`            | ✅ `/gabinetes`                        |
| Identidad visual: logotipo B · S-Estante (más 2 conceptos alternativos)                                                     | ✅ colores oficiales pendientes        |
| Docker Compose (web + API + PostgreSQL) y CI de GitHub Actions                                                              | ✅                                     |

## Requisitos

- Node.js **24 LTS** (≥ 24.15) — ver `.nvmrc`
- pnpm **12** (`corepack enable`)
- PostgreSQL 16+ o Docker (la API necesita un rol **sin** superusuario; ver [Despliegue](docs/DEPLOYMENT.md))

## Inicio rápido

```bash
corepack enable
pnpm install
pnpm build:packages          # compila los paquetes de dominio compartidos

cp apps/api/.env.example apps/api/.env   # ajuste DATABASE_URL
pnpm dev:api                 # API en http://localhost:3000/api (aplica migraciones)
pnpm dev:web                 # Web en http://localhost:4200 (proxy /api → :3000)
```

Con Docker:

```bash
docker compose -f infra/docker/compose.yaml up -d --build
# Web http://localhost:8080 · API http://localhost:3000/api/health
```

Por defecto la web solo responde en esta PC. Para escanear etiquetas QR con el celular en la red local, cree `infra/docker/.env` con `SILOPRO_WEB_BIND=0.0.0.0`, vuelva a levantar el stack, permita el puerto 8080 en el firewall y use en Etiquetas la dirección de la PC en la red (p. ej. `http://192.168.1.50:8080`). Hágalo solo en una red de confianza.

## Comandos

| Comando                                       | Descripción                                                      |
| --------------------------------------------- | ---------------------------------------------------------------- |
| `pnpm check`                                  | Todo lo que ejecuta la CI: formato, lint, tipos, pruebas y build |
| `pnpm test`                                   | Pruebas unitarias e integración de todos los paquetes            |
| `pnpm --filter @silopro/web e2e`              | Pruebas end-to-end (Playwright)                                  |
| `pnpm lint` / `pnpm format`                   | ESLint / Prettier                                                |
| `python3 brand/scripts/generate.py --preview` | Regenera los SVG de marca                                        |

## Estructura

```
apps/
  api/               NestJS — API REST (monolito modular)
  web/               Angular — aplicación web
packages/
  domain/            Reglas de negocio puras (sin framework)
  cabinet-engine/    Modelo lógico y físico de gabinetes (sin render)
  contracts/         Esquemas zod compartidos API ↔ web
  tokens/            @elikarsystems/tokens — tokens de diseño + tema Tailwind v4
  ui/                @elikarsystems/ui — componentes Angular
brand/               Identidad visual: generador, SVG, vistas previas
docs/                Documentación y ADRs
infra/docker/        Dockerfiles, nginx y Compose
```

## Documentación

[Visión](docs/PRODUCT_VISION.md) · [Hoja de ruta](docs/ROADMAP.md) · [Arquitectura](docs/ARCHITECTURE.md) · [Modelo de datos](docs/DATA_MODEL.md) · [API](docs/API.md) · [Design system](docs/DESIGN_SYSTEM.md) · [Marca](docs/BRAND_GUIDELINES.md) · [Investigación](docs/RESEARCH.md) · [Seguridad](docs/SECURITY.md) · [Pruebas](docs/TESTING.md) · [Despliegue](docs/DEPLOYMENT.md) · [ADRs](docs/adr/) · [Contribuir](CONTRIBUTING.md) · [Cambios](CHANGELOG.md)

## Licencia

Software propietario de ElikarSystems. Todos los derechos reservados.
