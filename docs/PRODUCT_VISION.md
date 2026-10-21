# Visión del producto

## Problema

Quien guarda miles de piezas pequeñas (componentes, tornillería, refacciones, reactivos) pierde tiempo buscando, compra duplicados y no sabe qué falta para un proyecto. Las hojas de cálculo no saben _dónde_ está físicamente cada pieza y los ERPs son excesivos para un taller.

## Propuesta

**SiloPro conecta el inventario digital con la organización física.** Cada artículo tiene una o varias ubicaciones precisas —almacén, zona, estantería, gabinete, cajón, compartimento— visibles en 2D y 3D. Buscar un artículo resalta su cajón. Escanear el QR de un cajón muestra su contenido. Un proyecto indica qué hay, qué falta y dónde está cada pieza.

A mediano plazo, SiloPro generará los propios organizadores: el usuario diseña su gabinete virtual y obtiene archivos imprimibles validados para su impresora.

## Para quién

| Segmento                                                                      | Necesidad principal                           |
| ----------------------------------------------------------------------------- | --------------------------------------------- |
| Talleres electrónicos y makers (primer caso real: inventario del propietario) | Ubicar componentes pequeños, BOM de proyectos |
| Talleres mecánicos, de refrigeración y refaccionarias                         | Refacciones por modelo/equipo, stock mínimo   |
| Laboratorios y escuelas                                                       | Préstamos, consumibles, trazabilidad          |
| Ferreterías, almacenes y PyMEs                                                | Existencias por ubicación, movimientos        |
| Usuarios particulares                                                         | Organización doméstica o de hobby             |

## Principios

1. **Universal antes que especializado:** atributos configurables por categoría.
2. **Lo físico es de primera clase:** la ubicación no es un campo de texto.
3. **Herramienta profesional:** densa, rápida, operable con teclado.
4. **Consistencia de datos:** movimientos transaccionales, sin existencias negativas no autorizadas.
5. **Local primero, nube cuando aporte:** funciona en la red del taller; la nube es opcional.
6. **Privacidad:** los QR contienen referencias opacas, nunca datos del artículo.

## Lo que SiloPro no es (por ahora)

- No es un ERP contable ni de facturación.
- No es un motor CAD general: genera piezas de almacenamiento parametrizadas.
- No procesa pagos hasta que se aprueben proveedor y planes.

## Métricas de éxito iniciales

- Encontrar un artículo y su cajón en < 5 s desde la búsqueda.
- Registrar una entrada o salida en < 10 s (incluido escaneo).
- Inventario del propietario (componentes electrónicos) migrado y en uso diario al final de la Fase 5.
