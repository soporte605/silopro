# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). El proyecto sigue [Versionado Semántico](https://semver.org/lang/es/).

## [Sin publicar]

## [0.2.0-alpha.2] — 2026-10-21

Fase 2 · Inventario (funcionalidad completa).

### Añadido

- Fotografías de artículos: hasta 10 por artículo (JPEG, PNG o WebP ≤ 8 MB), re-codificadas a WebP sin metadatos, miniatura y tamaño completo, portada elegible, visor y miniatura en la lista de artículos.
- Miembros: pantalla `/miembros` con cambio de rol y baja; nunca queda una organización sin propietario.
- Invitaciones por enlace (válido 7 días, de un solo uso, ligado al correo invitado y revocable); página pública `/invitacion/…` que lleva a crear cuenta o iniciar sesión y aceptar.
- Migraciones `0002_fotos_e_invitaciones` y `0003_fotos_e_invitaciones_aislamiento` (RLS y FK compuesta).
- Docker: volumen `uploads` para las fotografías; nginx acepta cuerpos de hasta 9 MB.

### Corregido

- Los scripts y archivos de Docker se fuerzan a finales de línea LF (`.gitattributes`); en Windows el rol de base de datos no se creaba.

### Limitaciones conocidas

- Las invitaciones no se envían por correo: el enlace se copia y se comparte a mano.
- Quien se registra desde una invitación también recibe su propia organización.

## [0.2.0-alpha.1] — 2026-10-21

Fase 2 · Inventario (primera entrega). Pendiente para `alpha.2`: fotografías de artículos e invitación de miembros.

### Añadido

- Cuentas: registro (crea organización y unidades base), inicio y cierre de sesión con Argon2id, cookie `HttpOnly`, límite de intentos y protección CSRF por cabecera.
- Organizaciones con roles propietario, administrador, operador y consulta; matriz de permisos única en `@silopro/domain`.
- Aislamiento por organización en tres capas: guard HTTP, Row Level Security forzado en PostgreSQL y claves foráneas compuestas.
- Catálogo: artículos (SKU, código interno, fabricante, modelo, unidad, costo, precio, mínimo, proveedores, QR), categorías jerárquicas con atributos propios heredables y validados, proveedores y unidades.
- Ubicaciones jerárquicas con ruta legible y reglas de tipos.
- Existencias por ubicación y movimientos inmutables: entradas, salidas y ajustes por conteo, con bloqueo de fila y prueba de concurrencia.
- Web: pantallas de acceso y registro, lista de artículos con búsqueda y filtros, alta y edición en panel lateral con atributos dinámicos, detalle con existencias e historial, categorías, proveedores y ubicaciones; menú de cuenta y cambio de organización.
- Migraciones Drizzle versionadas (`0000_inicial`, `0001_aislamiento_organizaciones`) y documentación de la API (`docs/API.md`).
- Mensajes de validación en español (zod) compartidos por API y web.

### Cambiado

- Marca: se adopta el concepto B · S-Estante como logotipo oficial; la aplicación y el favicon lo usan.
- `DATABASE_URL` pasa a ser obligatoria; Docker y CI usan un rol de aplicación sin superusuario.
- Toda la aplicación web requiere sesión, incluido el catálogo de componentes.

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
