# Lineamientos de marca · SiloPro

> Estado: **concepto B · S-Estante adoptado** (decisión del propietario, 2026-10-21). Colores **provisionales** (ver §Color).

## Personalidad

Precisa, ordenada, técnica sin ser fría. SiloPro es una herramienta de trabajo: la marca debe sentirse como un instrumento bien hecho, no como una aplicación de consumo. Hereda de ElikarSystems el azul marino (confianza, ingeniería) y el verde (acción, «encontrado»).

## Conceptos de logotipo

Generados por `brand/scripts/generate.py` (geometría paramétrica en cuadrícula de 64 u). Archivos en `brand/concepts/<concepto>/`, vistas previas PNG en `brand/previews/`.

|            | A · Silo de cajones                                                                                                 | B · S-Estante                                                                 | C · Coordenada                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Idea       | Un silo construido con cajones apilados: almacenamiento + organización. El cajón verde es «el artículo encontrado». | La «S» trazada como dos estantes; un bloque verde es un artículo en su lugar. | Una cuadrícula de compartimentos dentro de un visor de escaneo: ubicación + QR. |
| Isotipo    | ![A](../brand/concepts/a-silo-de-cajones/04-isotipo.svg)                                                            | ![B](../brand/concepts/b-s-estante/04-isotipo.svg)                            | ![C](../brand/concepts/c-coordenada/04-isotipo.svg)                             |
| Fortalezas | Relación directa con el nombre; cuenta la historia del producto; reconocible a 16 px                                | Monograma muy propio, fuerte como icono de app                                | Comunica «ubicación» y «escaneo» con claridad                                   |
| Riesgos    | La silueta puede recordar a un «servidor» si se usa sin color                                                       | Puede leerse como «5»; menos literal                                          | El visor de escaneo es un recurso habitual; menos distintivo                    |
| Decisión   | Descartado                                                                                                          | **Adoptado como marca oficial**                                               | Descartado (posible icono funcional de escáner)                                 |

### Variantes entregadas (por concepto)

| #   | Archivo                                      | Uso                                                        |
| --- | -------------------------------------------- | ---------------------------------------------------------- |
| 1   | `01-principal.svg`                           | Isotipo + logotipo + descriptor «Inventario inteligente»   |
| 2   | `02-horizontal.svg`                          | Barra de navegación, documentos                            |
| 3   | `03-vertical.svg`                            | Portadas, pantallas de inicio                              |
| 4   | `04-isotipo.svg`                             | Símbolo sin texto                                          |
| 5   | `05-monocromatico-negro.svg` / `-blanco.svg` | Grabado, sellos, impresión a una tinta, etiquetas térmicas |
| 6   | `06-fondo-claro.svg`                         | Presentación sobre fondo claro                             |
| 7   | `07-fondo-oscuro.svg`                        | Presentación sobre fondo oscuro                            |
| 8   | `08-favicon.svg`                             | Favicon con adaptación automática a modo oscuro            |
| 9   | `09-icono-app.svg`                           | Icono de aplicación 512 px (móvil, escritorio, PWA)        |
| 10  | `10-simplificado.svg`                        | ≤ 24 px: menos piezas y separaciones más amplias           |

Todos son SVG editables con formas simples (sin texto vivo ni efectos). Para cambiar colores o proporciones, edite el script y regenere; editar a mano es posible pero se pierde la regeneración.

**Legibilidad comprobada:** las versiones simplificadas se renderizaron a 16, 24 y 32 px (`brand/previews/*--size-*.png`). A y B se mantienen legibles a 16 px; C es el menos legible a 16 px aun con su variante simplificada 2×2.

## Logotipo (texto)

«Silo» en Geist SemiBold y «Pro» en Geist Regular, convertidos a contornos, con espaciado −1 %. El contraste de peso distingue las dos partes sin un segundo color (el verde no alcanza contraste suficiente como texto).

## Construcción y espacio

- Retícula de 64 u para el isotipo; altura de mayúscula del logotipo = 25 u (≈ 39 % del isotipo).
- Separación isotipo–texto: 15 u medidos desde el borde visible del símbolo.
- Área de protección: 8 u (el grosor del trazo de la S) en todos los lados.
- Tamaños mínimos: horizontal 96 px de ancho en pantalla / 25 mm impreso; isotipo 16 px (usar variante simplificada ≤ 24 px).

## Color

| Rol                    | Valor provisional | Origen                                                |
| ---------------------- | ----------------- | ----------------------------------------------------- |
| Primario (azul marino) | `#002150`         | `msapplication-TileColor` del sitio elikarsystems.com |
| Acento (verde)         | `#67BE28`         | `theme-color` del sitio elikarsystems.com             |
| Neutro de apoyo        | `#5B6B82`         | propuesto                                             |

**Estos valores no son oficiales.** Cuando ElikarSystems entregue sus colores: actualizar `PALETTE` en `brand/scripts/generate.py` y `--es-source-*` en `packages/tokens/tokens.css`, regenerar y revisar contrastes.

Proporción orientativa: 70 % neutros, 20 % azul, ≤ 10 % verde (el verde señala, no decora).

## Tipografía

**Geist** (interfaz y logotipo) + **Geist Mono** (SKU, códigos, posiciones como `C4`). Ver [ADR-0009](adr/0009-tipografia-geist.md). Licencia SIL OFL 1.1: uso comercial, incrustación y conversión a contornos permitidos. Alternativa evaluada: IBM Plex Sans/Mono.

## Usos incorrectos

- No cambiar los colores del isotipo fuera de las variantes definidas ni usar degradados.
- No aplicar sombras, contornos, biseles ni efectos 3D al logotipo.
- No deformar, rotar ni reordenar sus piezas; no cambiar la tipografía del logotipo.
- No colocar la versión a color sobre fondos de bajo contraste o fotografías saturadas: usar la monocromática.
- No usar el verde de marca para texto pequeño sobre blanco.
- No combinar el logotipo de SiloPro con el de ElikarSystems sin la línea de respaldo «un producto de ElikarSystems».

## Pendiente

Colores oficiales · activos originales de ElikarSystems (logotipo matriz) · prueba impresa en etiquetas térmicas · registro de marca (**requiere autorización**).
