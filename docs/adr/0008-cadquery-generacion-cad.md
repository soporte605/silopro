# 0008 · Generación CAD paramétrica con CadQuery

**Contexto.** Diferenciador futuro: generar cajones, gabinetes, separadores y uniones imprimibles a partir de parámetros (filas, columnas, dimensiones, paredes, holguras, portaetiquetas, frentes transparentes) para la Creality Ender-3 V3 KE (220×220×240 mm), en PLA y PETG.

**Opciones.**

|                     | OpenSCAD                    | CadQuery (OCCT)                                       | Three.js                |
| ------------------- | --------------------------- | ----------------------------------------------------- | ----------------------- |
| Modelo              | CSG de mallas               | B-rep (sólidos exactos)                               | Mallas de visualización |
| Redondeos/chaflanes | Limitados (minkowski lento) | Nativos                                               | No aplica               |
| Exportación         | STL, 3MF, (sin STEP)        | STL, 3MF, **STEP**, AMF                               | glTF                    |
| Integración         | CLI, lenguaje propio        | Biblioteca Python, testeable                          | Navegador               |
| Validación          | Externa                     | Volúmenes, _bounding boxes_, sólidos válidos con OCCT | —                       |

**Decisión.** **CadQuery** como motor de generación en un servicio Python aislado (trabajos en cola, sin acceso a la BD, entrada = parámetros validados, salida = archivos + reporte de validación). **Three.js** solo para previsualización. OpenSCAD queda como opción para usuarios avanzados que quieran exportar fuentes `.scad`, no como motor.

**Estrategia de división.** `planModules()` (`@silopro/cabinet-engine/physical.ts`, ya implementado) calcula cuántas celdas caben por módulo dentro del volumen útil (margen de 5 mm por lado). Los módulos se unen con colas de milano deslizantes o pasadores; holguras iniciales a calibrar con piezas de prueba: 0.2 mm (PLA), 0.3 mm (PETG).

**Validación prevista.** Sólido válido y cerrado, espesor mínimo ≥ 2 × ancho de línea (0.8 mm con boquilla de 0.4), cabe en el volumen, voladizos ≤ 45° o con puentes cortos, prueba física antes de publicar cada plantilla.

**Estado.** Propuesto; se confirmará con un prototipo al iniciar la Fase 7.
