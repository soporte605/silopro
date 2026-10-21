# Investigación inicial

Fecha: 2026-10-21. Este documento separa lo **verificado** (con fuente) de lo que proviene de **conocimiento previo** y debe confirmarse antes de usarse en material comercial.

## 1. BOM-Trace (referencia funcional)

**Fuentes:** sitio [bomtrace.com](https://bomtrace.com/), su [modelo en Printables](https://www.printables.com/model/1708454-modular-storage-cabinet-system-by-bom-trace), [MakerWorld](https://makerworld.com/en/models/2747734-bom-trace-modular-storage-system), [cuenta de X](https://x.com/bomtrace) y las 16 capturas del video compartidas por el propietario.

Verificado:

- Se presenta como software que «mapea el BOM digital a ubicaciones físicas reales» para ingenieros, equipos de hardware y manufactura.
- Publica un **sistema de almacenamiento modular imprimible en 3D** (12 diseños) que se conecta con su software, el cual visualiza existencias en 2D y 3D.
- Observado en las capturas: gabinetes con cientos de cajones de frente transparente; etiqueta por cajón con código 2D (DataMatrix/QR), nombre del gabinete y posición (`D14`, `C4`); vista 3D de un gabinete en el navegador con la cuadrícula de posiciones; panel lateral con grupos de gabinetes («Group 3», «Cabinet 1…4»); filtros de ocupación («All», «Empty», «Partial»); botón «New Cabinet»; estado «Select a Drawer to view information».

No encontrado públicamente: precios, documentación técnica, API, importación de BOM, multiempresa, idiomas.

**Implicación para SiloPro:** el diferenciador «organizadores imprimibles» **ya existe** en BOM-Trace con diseños fijos. Nuestra ventaja debe ser la **generación paramétrica a medida** (dimensiones del usuario, holguras por material, división automática según el volumen de _su_ impresora, exportación validada) y no solo ofrecer modelos descargables.

## 2. Alternativas (conocimiento previo, verificar antes de citar)

| Producto                                 | Tipo                                        | Enfoque                                                  | Fortalezas                                | Debilidades frente a SiloPro                                                               |
| ---------------------------------------- | ------------------------------------------- | -------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------ |
| [InvenTree](https://docs.inventree.org/) | Código abierto (Python/Django), autoalojado | Partes, ubicaciones jerárquicas, BOM, compras, etiquetas | Muy completo, plugins, API                | Interfaz densa pero genérica; sin representación visual de gabinetes; curva de aprendizaje |
| [Part-DB](https://docs.part-db.de/)      | Código abierto (PHP/Symfony)                | Componentes electrónicos                                 | Integración con distribuidores, etiquetas | Centrado en electrónica; sin 2D/3D                                                         |
| BOMIST                                   | Escritorio / nube                           | Electrónica, BOM, compras                                | Flujo de BOM maduro                       | Electrónica únicamente; sin organización física visual                                     |
| Sortly                                   | SaaS PyME                                   | Inventario visual con fotos y QR                         | Fácil, móvil                              | Sin jerarquía física fina (cajón/compartimento) ni BOM                                     |
| Homebox                                  | Código abierto (Go)                         | Inventario doméstico                                     | Ligero                                    | Sin multiempresa, sin BOM                                                                  |
| ERPs (Odoo Inventory, etc.)              | Suite                                       | Almacenes y logística                                    | Integración contable                      | Pesados para talleres; ubicación a nivel cajón poco práctica                               |

## 3. Oportunidades de diferenciación

1. **Universal:** atributos por categoría (no un esquema de electrónica): refrigeración, mecánica, laboratorio, ferretería.
2. **Ubicación física de grano fino y visual:** gabinete → cajón → compartimento con vistas 2D/3D sincronizadas con existencias, búsqueda que _ilumina_ la posición.
3. **Fabricación paramétrica propia:** del gabinete virtual al archivo imprimible, con validación geométrica y división para la impresora del usuario.
4. **Mercado hispanohablante:** producto nativo en español (México/LatAm), precios y soporte locales.
5. **Híbrido local/nube:** despliegue local con Docker desde el día 1; escritorio (Tauri) y sincronización después.
6. **Interfaz profesional compacta** en lugar de tableros de tarjetas grandes.

## 4. Marca ElikarSystems

Del sitio [elikarsystems.com](https://elikarsystems.com/) (sin hoja de estilos accesible, solo etiquetas meta):

- `msapplication-TileColor`: `#002150` (azul marino) · `theme-color`: `#67be28` (verde).
- Idioma `es_MX`; tono profesional y directo; producto hermano: FincaPro.

Estos valores se usan como **fuente provisional** en `@elikarsystems/tokens` y en el generador de marca. **No son colores oficiales** hasta que ElikarSystems entregue su manual o activos originales.

## 5. Versiones del stack (consultadas en npm/nodejs.org el 2026-10-21)

| Tecnología    | Versión                  | Nota                                                       |
| ------------- | ------------------------ | ---------------------------------------------------------- |
| Node.js       | 24.22.0 LTS «Krypton»    | Angular CLI 22 exige ≥ 22.22.3 / 24.15                     |
| pnpm          | 12.14                    |                                                            |
| Angular / CDK | 22.2.3                   | zoneless por defecto, Vitest como runner                   |
| TypeScript    | 6.0.3                    | Angular 22 requiere `>=6.0 <6.1` (TS 7.0 aún no soportado) |
| NestJS        | 12.2                     | paquetes ESM                                               |
| Tailwind CSS  | 4.3.3                    |                                                            |
| Vitest        | 5.0.5                    |                                                            |
| zod           | 4.6                      |                                                            |
| Three.js      | 0.186                    | se incorporará en Fase 4                                   |
| PostgreSQL    | 18 (Docker) / 16 (local) |                                                            |
