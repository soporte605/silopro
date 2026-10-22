# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). El proyecto sigue [Versionado Semántico](https://semver.org/lang/es/).

## [Sin publicar]

## [0.3.0-alpha.4] — 2026-10-22

### Añadido

- Diseño de etiqueta **Cajón** (nuevo predeterminado): encabezado con el gabinete y la dirección en grande junto al QR, legible de lejos en el frente del cajón. El diseño **Detalle** (QR con nombre y ruta) sigue disponible; la elección se recuerda.

## [0.3.0-alpha.3] — 2026-10-22

Adelanto de la Fase 5: etiquetas QR.

### Añadido

- Página **Etiquetas** (`/etiquetas`): hojas con QR para los cajones de un gabinete, las ubicaciones o los artículos. Formatos Carta 30 por hoja (66,7 × 25,4 mm), A4 21 por hoja (63,5 × 38,1 mm) y rollo térmico 50 × 25 y 40 × 30 mm. Se imprime a tamaño real o se guarda como PDF desde el navegador; permite elegir qué etiquetas incluir y empezar en una posición de una hoja ya usada.
- El QR lleva un enlace corto `…/q/u/<código>` o `…/q/a/<código>`: al escanearlo con la cámara del celular abre el gabinete con el cajón resaltado, la ubicación o el artículo. Sin sesión, pide iniciarla y vuelve.
- API `GET qr/:type/:code` para resolver un código dentro de la organización.
- Accesos: «Imprimir etiquetas» en el gabinete y en Ubicaciones, «Etiqueta» en el artículo, «Etiquetas» en el menú y en la paleta.
- Docker: `SILOPRO_WEB_BIND` para abrir la web a la red local (por defecto sigue solo en esta PC).
- Contratos: `qrUrl`, `qrTypeFromLetter`; `decodeQrReference` también acepta el enlace.

## [0.3.0-alpha.2] — 2026-10-21

Fase 3 · Almacenamiento: ubicaciones editables y capacidad.

### Añadido

- Editar ubicaciones (`PATCH locations/:id`): renombrar, cambiar el código y moverla a otro lugar. La ruta de todo lo que contiene se recalcula; se respetan las reglas de jerarquía, la profundidad máxima, los ciclos y el bloqueo optimista (`409 STALE_VERSION`).
- Archivar ubicaciones (`DELETE locations/:id`) con todo su contenido, solo si no hay existencias (`422 LOCATION_HAS_STOCK` con las rutas afectadas). El código queda libre para reutilizarse.
- Capacidad por ubicación y por cajón: máximo de artículos distintos (1–999). Una entrada o ajuste que la rebase se rechaza con `422 CAPACITY_EXCEEDED`; el mismo artículo siempre puede sumar.
- Estado «Lleno» en el gabinete (barra azul) y campo de capacidad en el detalle del cajón.
- Botones de editar y archivar en Ubicaciones.
- Dominio: `exceedsCapacity`. Migración `0006_ubicaciones_capacidad`.

### Cambiado

- `PATCH cabinets/:id/compartments/:id` acepta `name` y/o `maxItems`.
- Los cajones de un gabinete solo se mueven o quitan desde su editor.
- El índice único de código por lugar ignora las ubicaciones archivadas.

### Corregido

- Los diálogos ocupan todo el ancho de la ventana modal (antes quedaban descuadrados).
- Salidas y ajustes preseleccionan la ubicación con existencias sin esperar a que cargue la lista (antes podía salir «Inválido UUID»).

## [0.3.0-alpha.1] — 2026-10-21

Fase 3 · Almacenamiento (primera entrega): gabinetes guardados.

### Añadido

- Gabinetes guardados por organización (`/gabinetes`): se crean dentro de una ubicación con filas, columnas, direccionamiento y numeración de filas; cada celda es un cajón (ubicación de tipo cajón con su QR).
- Editor 2D conectado (`/gabinetes/:id`): fusionar, dividir y redimensionar en local y guardar el diseño completo con bloqueo optimista; nombre por cajón.
- Al guardar, los cajones que desaparecen se archivan solo si están vacíos (`422 COMPARTMENT_HAS_STOCK` si no) y los que reaparecen se restauran con su historial.
- Ocupación por cajón (vacío, con existencias, stock bajo), contenido del cajón y búsqueda por artículo, SKU o dirección que resalta los cajones.
- Desde el detalle del artículo, «ver en el gabinete» abre el gabinete con el cajón resaltado.
- Motor: `resizeLayout` y `assertCanonicalLayout`.
- Migraciones `0004_gabinetes` y `0005_gabinetes_aislamiento` (FK compuesta, CHECK y RLS).

### Cambiado

- La lista de Ubicaciones agrupa los cajones de cada gabinete en un enlace «Abrir gabinete».
- El menú lateral apunta a Gabinetes; la demostración sigue en `/gabinetes/demo`.
- El límite del cuerpo JSON de la API sube a 1 MB (el diseño de un gabinete de 60×60 ronda los 350 KB).

### Rendimiento

- Las celdas del gabinete se dibujan en un componente aparte y la selección en una capa encima: en 60×40, ≈ 9 ms de trabajo por clic en modo desarrollo.

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
