# 0007 · Three.js para visualización 3D

**Contexto.** Se necesita ver gabinetes en 3D, rotar, hacer zoom, seleccionar y abrir cajones, sincronizado con el inventario.

**Decisión.** Three.js (0.186) cargado de forma diferida solo en la vista 3D, con `InstancedMesh` para cajones (cientos de piezas con pocas llamadas de dibujo), `OrbitControls`, _raycasting_ para selección y materiales físicos con transmisión para frentes transparentes. Un adaptador traduce `CabinetLayout` + `CabinetPhysicalSpec` de `@silopro/cabinet-engine` a la escena; el dominio no conoce Three.js. Se descartaron Babylon.js (más pesado para este alcance) y frameworks declarativos sobre React (requisito: sin React).

**Consecuencias.** La vista 3D es representación, no geometría de fabricación (ver ADR-0008).
