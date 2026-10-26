# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). El proyecto sigue [Versionado Semántico](https://semver.org/lang/es/).

## [Sin publicar]

### Añadido

- **¿Dónde está?** (`/donde`, en la barra lateral, la paleta y con la tecla **/** desde cualquier pantalla): se escribe un artículo, SKU, fabricante o alias y responde en qué cajones hay existencias, de más a menos, con su ruta. Tolera mayúsculas, acentos, guiones y espacios («esp 32» encuentra «ESP32-WROOM»). Enter lleva al primer cajón. **Pantalla completa** para dejarla en una tablet del almacén. Es la primera etapa del asistente de almacén (después vienen el chat con IA y el dispositivo con luces y voz).
- «Ver en 3D» abre el estante con el cajón **seleccionado y abierto**: la cámara viaja hasta él, **destella** unos segundos y el resto del estante se atenúa salvo los cajones con el mismo artículo (`/gabinetes/estante/:id?resaltar=<ubicación>&buscar=<texto>`).
- Campo **«También se le dice»** en la ficha del artículo (alias separados por comas, hasta 20) para encontrarlo por otros nombres. API `GET /orgs/:orgId/locate?q=`; `Item.aliases` y búsqueda de artículos por alias. Migración `0015_alias_articulos` (`items.aliases`).

- **Asistente con IA** (`/asistente`, en la barra lateral y la paleta): chat escrito sobre el inventario. Responde «¿dónde están los ESP32?», «¿qué tengo que comprar?», «¿qué le falta al proyecto X?» o «¿quién sacó resistencias?» consultando SiloPro con herramientas de **solo lectura** (localizar, lista de compras, proyectos y movimientos), con los permisos del usuario. Debajo de cada respuesta aparecen los cajones encontrados con **«Ver en 3D»**. La conversación vive solo en la pantalla (la API no la guarda). Usa Claude (`claude-opus-5-5`, con modelos de reserva del lado de Anthropic). **Cupo mensual por plan**: prueba 50, Básico 100, Profesional 500, Empresa sin límite; al agotarse responde `402 ASSISTANT_LIMIT`. Sin `ANTHROPIC_API_KEY` el asistente aparece desactivado y remite a «¿Dónde está?». API `GET /orgs/:orgId/assistant` y `POST /orgs/:orgId/assistant/chat`. Migración `0016_asistente` (`assistant_usage`, con RLS).

### Cambiado

- La página comercial tiene su propio dominio, **silopro.elikarsystems.com** (como FincaPro), y la app queda en app.silopro.elikarsystems.com. En el dominio comercial solo se ven la landing y los avisos legales; «Iniciar sesión», «Prueba gratis» y cualquier otra ruta abren la app. En la app, la raíz sin sesión lleva al acceso y el logotipo de las pantallas de acceso a la página comercial. En la red local todo sigue en un solo origen (`/producto`).
- **Nuevo inicio para clientes**: resumen de artículos, miembros, fotografías y plan (con lo que permite el plan), avisos, actividad reciente con los últimos movimientos y contacto de soporte. Los primeros pasos solo aparecen mientras la organización no tiene artículos.

### Quitado

- Del inicio, la hoja de ruta, la fase actual y el estado del sistema (información interna). Del menú, el enlace «Design system» y las etiquetas «alpha» y «F7»; el catálogo de componentes sigue en `/sistema/componentes`.

## [0.7.0] — 2026-10-26

Fase 8 · Comercialización: lo necesario para el lanzamiento (correo, planes con Stripe en modo prueba, página comercial, avisos legales, respaldos externos y vigilante).

### Añadido

- **Correos con Resend**: al registrarse llega un enlace para **confirmar el correo** (vence en 24 h); mientras no se confirme, un aviso arriba permite **reenviarlo**.
- **Recuperar contraseña** desde «¿Olvidaste tu contraseña?» en el acceso: el enlace vence en 1 hora, sirve una vez y al usarlo se cierran todas las sesiones abiertas. No revela si un correo está registrado.
- Las **invitaciones** llegan también por correo con el enlace.
- API `POST auth/verify-email`, `auth/verify-email/resend`, `auth/password/forgot` y `auth/password/reset`; `Me.user.emailVerified`. Migración `0013_correo` (`users.email_verified_at`, tabla `auth_tokens`).
- Variables `RESEND_API_KEY` y `MAIL_FROM`; sin clave los correos se escriben en el registro.
- **Planes y límites**: cada organización nueva empieza con **14 días de prueba gratis** con los límites de Profesional, sin tarjeta. Básico ($299 MXN/mes o $2,990/año + IVA): 3 usuarios, 1,000 artículos, 2 GB de fotos. Profesional ($699/mes o $6,990/año + IVA): 10 usuarios, 10,000 artículos, 20 GB. Empresa: a la medida. Al pasar el límite, crear artículos, importar, subir fotos o invitar responde `402 PLAN_LIMIT` con un mensaje claro.
- Al terminar la prueba o si la suscripción deja de estar activa, la organización queda **en solo lectura** (`402 READ_ONLY` al escribir); no se borra nada. Un aviso arriba lo indica y otro avisa cuando quedan 5 días o menos de prueba.
- Pantalla **Plan y facturación** (`/plan`, en la barra lateral, el menú de cuenta y la paleta): plan actual, uso contra límites y planes con precio mensual o anual.
- **Cobro con Stripe (modo prueba)**: «Elegir plan» abre Stripe Checkout y «Administrar suscripción» el portal de cliente; el webhook `POST /api/billing/webhook` (firmado) actualiza plan, estado y periodo. Sin clave de Stripe la pantalla ofrece contratar por correo. Script `apps/api/scripts/stripe-setup.mjs` crea productos, precios, webhook y configuración del portal. Variables `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` y `STRIPE_PORTAL_CONFIGURATION`.
- API `GET orgs/:orgId/billing`, `POST …/billing/checkout` y `…/billing/portal`. Migración `0014_planes`: columnas de plan y suscripción en `organizations`; las organizaciones existentes pasan a prueba con 30 días.
- **Página comercial** (`/producto`): qué hace SiloPro, precios con pago mensual o anual, preguntas frecuentes y registro de prueba gratis. Quien entra a la raíz sin sesión llega aquí; los enlaces directos siguen llevando al acceso.
- **Aviso de privacidad** (`/privacidad`, LFPDPPP) y **Términos y condiciones** (`/terminos`), enlazados desde el pie de la página comercial y desde el registro. Son borradores pendientes de revisión legal (ver `docs/LEGAL.md`).
- **Respaldos fuera del servidor**: `infra/server/backup.sh` cifra y sube a Cloudflare R2 la base y las fotografías cuando existe `shared/backup.env`, verifica la subida y avisa por correo si falla.
- **Vigilante** (`infra/server/watchdog.sh`, cada 5 minutos): reinicia la app tras 2 fallas seguidas, avisa por correo al caer y al recuperarse, y si el respaldo externo se atrasa. Cron en `infra/server/silopro.cron`.
- «Plan y facturación» también en el menú de cuenta, para llegar desde el celular.

### Cambiado

- Las variables de entorno vacías se tratan como no definidas.

## [0.6.0] — 2026-10-25

Cierre de la Fase 6 · Productividad (contenido de `0.6.0-alpha.1` a `0.6.0-alpha.4`): proyectos con lista de materiales, lista de compras y avisos, importación desde Excel o CSV y reportes.

### Cambiado

- La Fase 8 (comercialización) se adelanta a la 7 (fabricación) para lanzar antes. Inicio muestra el estado de cada fase según la hoja de ruta.

## [0.6.0-alpha.4] — 2026-10-25

Fase 6 · Productividad: reportes.

### Añadido

- **Reportes** (`/reportes`, en el menú y en la paleta), cada uno con **Exportar CSV**:
  - **Valor del inventario**: existencia × costo registrado, total, por categoría y por artículo; avisa cuántos artículos con existencia no tienen costo.
  - **Movimientos del periodo**: por artículo, entradas, salidas (incluye consumos de reservas), ajustes, neto, cantidad transferida y número de movimientos. Periodos rápidos de 7, 30 y 90 días o fechas a elegir (hasta un año), en días completos de la hora local.
  - **Sin movimiento**: artículos con existencia que no se mueven desde hace 30, 90, 180 o 365 días, con el valor detenido.
- API `GET reports/valuation`, `GET reports/movements`, `GET reports/stale` y sus `…/export`. Sin migraciones.
- **CI**: el workflow «Título del PR» valida que el título de cada pull request siga Conventional Commits con los tipos de `CONTRIBUTING.md`. Si no cumple, el check falla y deja un comentario con un título sugerido (deducido de las etiquetas, p. ej. `bug` → `fix`). Usa [conventional-pr-check](https://github.com/soporte605/conventional-pr-check) v0.2.0.

### Corregido

- **Vista 3D**: el aviso distingue si el navegador no tiene WebGL 2 (el visor lo exige), si solo tiene WebGL 1 o si el visor falló por otra causa; en ese caso muestra el detalle del error para soporte en lugar de culpar a WebGL. Las indicaciones mencionan chrome://gpu y el controlador de video.

## [0.6.0-alpha.3] — 2026-10-23

Fase 6 · Productividad: importación de artículos.

### Añadido

- **Importar artículos** (`/importar`, botón «Importar» en Artículos y en la paleta): desde Excel (`.xlsx`) o CSV (con coma o punto y coma, como lo guarda Excel en español). Reconoce los encabezados comunes (SKU, Nombre, Unidad, Marca, Costo, Mínimo, Cantidad, Ubicación…) y se pueden reasignar.
- **Revisión antes de guardar**: por cada fila dice si crea, actualiza, se omite o tiene error (unidad o categoría inexistente, SKU repetido, cantidad sin ubicación…). Si hay errores no se importa nada.
- Los artículos existentes (mismo SKU) se actualizan solo con las columnas que trae el archivo, o se omiten. La cantidad se registra como entrada con motivo «Importación».
- **Descargar plantilla** CSV.
- API `POST import/items`. Sin migraciones. El límite de las peticiones JSON sube a 5 MB.

## [0.6.0-alpha.2] — 2026-10-23

Fase 6 · Productividad: lista de compras y avisos.

### Añadido

- **Lista de compras** (`/compras`, en el menú y en la paleta): por cada artículo, cuánto comprar para cubrir los proyectos abiertos y quedar en su mínimo, agrupado por proveedor, con el motivo (proyecto o stock mínimo), costo estimado y **Exportar CSV**.
- **Avisos** en inicio: artículos con stock bajo (abre el inventario filtrado), por comprar y proyectos con faltantes. El menú muestra cuántos artículos hay por comprar.
- API `GET shopping-list`, `GET shopping-list/export` y `GET alerts`. Sin migraciones.

### Corregido

- **Mover existencias** y **Reservar**: el botón «Todo» queda junto a la cantidad, no a la altura del texto «Disponible» o del error.

## [0.6.0-alpha.1] — 2026-10-22

Fase 6 · Productividad: proyectos y lista de materiales.

### Añadido

- **Proyectos** (`/proyectos`, en el menú y en la paleta): proyecto, pedido u orden de trabajo con código, estado (borrador, en curso, terminado, cancelado) y fecha de entrega.
- **Lista de materiales**: por cada artículo se ve lo necesario, lo consumido, lo reservado para el proyecto, lo disponible en el almacén, el faltante y en qué ubicaciones está (con enlace al cajón resaltado).
- **Reservar lo disponible**: un clic aparta para el proyecto todo lo pendiente que haya libre, tomando primero de donde hay más. Lo que no alcanza queda como faltante. **Liberar todo lo apartado** lo devuelve.
- Las reservas pueden ligarse a un proyecto (`projectId`), y consumirlas cuenta como avance.
- API `projects` (ver docs/API.md). Migración `0012_proyectos`: tablas `projects` y `bom_lines` y la columna `reservations.project_id`, con aislamiento por organización. No borra datos.

## [0.5.1] — 2026-10-22

### Corregido

- **Fotografías**: mientras se descargan se ve un esqueleto de carga, en la galería, en la foto ampliada, en la portada del artículo y en la lista de artículos.
- **Vista 3D**: el aviso ya no dice «WebGL no disponible» cuando lo que falló fue descargar el visor (pasa si la página quedó abierta mientras se publicaba una versión); ahora lo dice y ofrece **Recargar la página**. Si de verdad falta WebGL, explica que hay que activar la aceleración por hardware del navegador. Si la GPU rechaza el antialiasing, se intenta sin él.
- El servidor web ya no deja `index.html` en caché, para que tras publicar el navegador pida los archivos nuevos.
- Inicio: «Fase actual» mostraba la fase 3; ahora sale de la hoja de ruta.

## [0.5.0] — 2026-10-22

Cierra la Fase 5 · Operaciones.

### Añadido

- **Escanear etiqueta** (`/escanear`, en el menú y en la barra del celular): lee el QR con la cámara trasera sin salir de la app y abre el cajón, la ubicación o el artículo. Usa el lector nativo del navegador y, si no hay, jsQR (se descarga solo al usarlo). Sin cámara o sin permiso, se puede pegar el enlace de la etiqueta. Necesita HTTPS, como en app.silopro.elikarsystems.com.
- Prueba de punta a punta con una cámara falsa que muestra un QR.

## [0.5.0-alpha.5] — 2026-10-22

Fase 5 · Operaciones: auditoría y diario de movimientos.

### Añadido

- **Auditoría**: cada cambio aceptado (crear, editar, archivar, mover, reservar, invitar…) queda registrado con quién, qué, sobre qué y cuándo. La bitácora no se puede editar ni borrar (trigger en la base) y solo la ven dueños y administradores, en la página **Auditoría**.
- **Movimientos**: diario de toda la organización con filtros por tipo, ubicación y fechas, «Cargar más» y **Exportar CSV** para abrir en Excel.
- API `GET movements`, `GET movements/export` y `GET audit`.
- Migración `0011_auditoria`: tabla `audit_log` con aislamiento por organización y un índice para el diario. No borra datos.

## [0.5.0-alpha.4] — 2026-10-22

Publicación en servidor.

### Añadido

- `infra/docker/compose.prod.yaml`: SiloPro detrás del nginx del servidor con HTTPS. Solo la web escucha en `127.0.0.1:3200`; las contraseñas vienen de un `.env` del servidor y son obligatorias.
- `infra/server/`: sitio de nginx para `app.silopro.elikarsystems.com` y respaldo diario (base de datos y fotografías, 14 días).
- Variable `TRUST_PROXY_HOPS` para obtener la IP real del cliente detrás de dos proxies; el nginx del contenedor conserva el esquema HTTPS del proxy externo.

### Seguridad

- `deploy/` y `*.local.env` quedan fuera del repositorio.

## [0.5.0-alpha.3] — 2026-10-22

Anaqueles con charolas.

### Añadido

- **Anaqueles**: al crear un mueble se elige **Gabinete** (cajones) o **Anaquel** (repisas con charolas). En el anaquel cada fila es una repisa y cada celda una charola, que es una ubicación con su QR, igual que un cajón.
- El editor, la búsqueda, la capacidad, las etiquetas y «Ver en 3D» funcionan igual que en los gabinetes. La vista 3D dibuja el anaquel abierto, con las charolas que se deslizan hacia afuera.
- Medidas por omisión de taller para anaqueles: charolas de 300 × 250 mm y repisas de 300 mm de fondo.
- Migración `0010_anaqueles`: columna `style` en `cabinets` (los gabinetes existentes quedan como `drawers`). No borra datos.

### Cambiado

- La sección **Gabinetes** pasa a llamarse **Gabinetes y anaqueles**.

## [0.5.0-alpha.2] — 2026-10-22

Fase 5 · Operaciones: reservas y consumos.

### Añadido

- **Reservas**: apartar existencias de una ubicación para un proyecto o pedido. Lo reservado deja de estar disponible: no se puede sacar ni mover hasta consumirlo o liberarlo.
- **Consumir** una reserva, en parte o completa, registra una salida de tipo consumo con el motivo de la reserva; **liberar** devuelve lo que queda a disponible.
- Página **Reservas** (menú y paleta) con filtro «Activas» / «Todas» y «Nueva reserva». Botón **Reservar** en el artículo.
- API `GET/POST reservations`, `POST reservations/:id/consume` y `POST reservations/:id/release`; `Movement.reservationId`.
- Migración `0009_reservas`: tabla `reservations` (con aislamiento por organización) y columna `reservation_id` en `stock_movements`. No borra datos.

## [0.5.0-alpha.1] — 2026-10-22

Fase 5 · Operaciones: transferencias.

### Añadido

- **Transferencias**: mover existencias de un artículo de una ubicación a otra en un solo paso. La salida y la entrada se registran juntas y quedan unidas en el historial. Si no alcanza lo disponible o el destino está lleno, no cambia nada. Solo se mueve lo disponible: lo reservado se queda donde está.
- Página **Transferencias** (menú y paleta) con el historial y «Nueva transferencia». Botón **Mover** en el artículo y en cada artículo de la ficha de una ubicación o cajón, con «Todo» para llevarse lo disponible.
- API `POST transfers` y `GET transfers`; `Movement.transferId`.
- Migración `0008_transferencias`: columna `transfer_id` en `stock_movements`.
- Bloqueo en orden fijo (ubicación de destino con capacidad y luego las dos existencias por id): transferencias cruzadas simultáneas no se interbloquean (probado con 16 en paralelo).

## [0.4.0] — 2026-10-22

Cierre de la Fase 4 · Visualización 3D (incluye `0.4.0-alpha.1` y `0.4.0-alpha.2`). La Fase 3 se cierra como `v0.3.0` con el contenido de `0.3.0-alpha.5`.

### Añadido

- **Estante en 3D** (`/gabinetes/estante/:id`): todos los gabinetes de un mismo lugar, uno junto a otro sobre una tabla, con el código de cada uno encima. La búsqueda «¿Dónde está?» (artículo, SKU o cajón) atenúa los cajones que no coinciden y cuenta las coincidencias. Al tocar un cajón se abre y el panel muestra su contenido y «Abrir gabinete». Con las flechas se pasa de un gabinete al vecino.
- Accesos: «Ver N gabinetes en 3D» en la ficha de la ubicación que los contiene y «Estante en 3D» en el editor del gabinete.
- API: `parentId` en el resumen y el detalle del gabinete.

## [0.4.0-alpha.2] — 2026-10-22

### Añadido

- **Medidas del gabinete**: en el editor, «Medidas del gabinete» guarda ancho y alto de celda, profundidad y grosor de pared en mm. Muestra las medidas exteriores y en cuántos módulos se imprime en la Ender-3 V3 KE. La vista 3D se dibuja a esa escala.
- **Ver en 3D** desde la ficha de una ubicación o cajón y junto a cada ubicación en las existencias del artículo: abre el gabinete en 3D con el cajón afuera. El editor acepta `?vista=3d` o `?vista=cuadricula`.
- API `PUT cabinets/:id/physical` (con control de versión); el gabinete incluye `physical`.
- Migración `0007_gabinetes_medidas`: cuatro columnas con valores por omisión; los gabinetes existentes quedan con 40 × 30 × 120 mm y pared de 2 mm.

## [0.4.0-alpha.1] — 2026-10-22

Fase 4 · Visualización 3D.

### Añadido

- **Vista 3D del gabinete**: botón «Cuadrícula / 3D» en el editor (la elección se recuerda). Se gira arrastrando, se acerca con la rueda o pellizcando y «Encuadrar» vuelve a la vista inicial. Al elegir un cajón (clic, toque o flechas del teclado) sale con una animación y el panel lateral muestra su contenido; Enter o un segundo clic lo cierra. Frentes transparentes con la dirección del cajón, colores de ocupación iguales a la cuadrícula y la búsqueda atenúa los cajones que no coinciden.
- Three.js 0.186.0 en un fragmento aparte (~119 kB comprimido) que solo se descarga al abrir la vista 3D. Si el navegador no tiene WebGL, se avisa y se sigue usando la cuadrícula.
- `cabinet-engine`: `cabinetSceneModel` traduce el diseño a cajas en milímetros (paredes, separadores y cajones) sin depender de Three.js; `DEFAULT_PHYSICAL_SPEC`.

### Cambiado

- Aviso de tamaño del paquete inicial de 600 kB a 650 kB (el límite de error sigue en 1 MB).
- Pruebas E2E: tiempo máximo por prueba de 30 s a 60 s; los flujos largos rozaban el límite con la suite en paralelo.

## [0.3.0-alpha.5] — 2026-10-22

### Añadido

- **Ficha de ubicación** (`/ubicaciones/:id`), pensada para el celular: qué hay dentro con cantidades y aviso de stock bajo, capacidad usada, botones de entrada (+) y salida (−) por artículo y «Guardar un artículo aquí» con buscador. Enlace «Ver en el gabinete» para los cajones.
- Escanear la etiqueta de un cajón o de una ubicación abre su ficha; la de un gabinete, su editor.
- API `GET locations/:id` con el contenido; `QrTarget.locationKind`.
- En Ubicaciones, el nombre de cada una enlaza a su ficha.

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
