# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). El proyecto sigue [Versionado Semántico](https://semver.org/lang/es/).

## [Sin publicar]

## [0.1.0-alpha.1] — 2026-10-21

Fase 1 · Fundamentos. Primera base técnica; sin inventario persistente todavía.

### Añadido

- Monorepo pnpm con `apps/api` (NestJS 12), `apps/web` (Angular 22, zoneless) y paquetes compartidos.
- `@silopro/cabinet-engine`: cuadrículas de hasta 200×200, tres esquemas de direccionamiento, fusión y división de compartimentos con validación de superposición, dimensiones físicas y planificación de módulos para la Creality Ender-3 V3 KE.
- `@silopro/domain`: jerarquía flexible de ubicaciones con reglas de tipos, ciclos y profundidad; existencias con cantidades escaladas, reservas y protección contra saldos negativos.
- `@silopro/contracts`: esquemas zod compartidos (salud, paginación, errores) y formato de referencias QR opacas.
- API: `GET /api/health` con sonda de PostgreSQL, validación de entorno, filtro de errores uniforme, Helmet y CORS configurable.
- `@elikarsystems/tokens`: tokens en tres capas con escalas derivadas por `color-mix()` desde dos colores fuente (provisionales), modo claro/oscuro y tema de Tailwind CSS v4.
- `@elikarsystems/ui`: Button, Badge, Kbd, Input, Select, Checkbox, Radio, Switch, Form field, Tabs, Table, Pagination, Breadcrumb, Menu/menú contextual, Tooltip, Dialog, Drawer, Toast, Command palette, Skeleton, Empty state, Nav item y servicio de tema.
- Aplicación web: shell con navegación, paleta de comandos (Ctrl/⌘ K), página de estado, catálogo de componentes y gabinete 2D de demostración.
- Identidad visual: tres conceptos de logotipo con diez variantes SVG cada uno, generados por script paramétrico.
- Docker Compose (PostgreSQL 18, API, web con nginx), workflow de CI y pruebas e2e con Playwright.
- Documentación inicial y ADR 0001–0011.
