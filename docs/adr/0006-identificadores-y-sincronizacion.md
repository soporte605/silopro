# 0006 · Identificadores, versionado y preparación para sincronización

**Contexto.** Se quiere evolucionar a escritorio/móvil con trabajo sin conexión. La sincronización no es trivial y debe diseñarse antes de implementarse.

**Decisión (diseño, sin implementar).**

1. **UUIDv7** como clave primaria: generables en cliente sin colisiones y ordenables por tiempo.
2. Columnas `version` (entero, bloqueo optimista) y `updated_at` en toda entidad mutable.
3. **Las existencias se derivan de movimientos.** Los movimientos son un registro inmutable de eventos con id del cliente; sincronizar consiste en intercambiar eventos (idempotentes por id). Entradas/salidas concurrentes en dos dispositivos se suman de forma conmutativa.
4. Conflictos no conmutativos:
   - Atributos descriptivos (nombre, descripción): último escritor gana **por campo**, registrado en auditoría.
   - Violaciones de reglas al fusionar (p. ej. dos salidas offline que juntas dejan saldo negativo): el servidor acepta ambos eventos, marca la existencia como «en conflicto» y genera una tarea de revisión; nunca descarta silenciosamente un movimiento físico real.
   - Estructura (mover una ubicación en dos lugares): se rechaza la segunda con conflicto explícito.
5. Protocolo previsto: _pull_ por cursor (`updated_at`, `id`) + _push_ de lotes de eventos; servidor como autoridad.

**Consecuencias.** Desde la Fase 2 las tablas nacen con estas columnas y los movimientos como fuente de verdad, aunque la sincronización se implemente en la Fase 8.
