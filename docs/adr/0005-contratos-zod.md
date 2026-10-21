# 0005 · Contratos compartidos con zod

**Decisión.** Los esquemas de entrada/salida viven en `@silopro/contracts` (zod 4) y se usan en la API (`ZodValidationPipe`) y en la web (tipos y validación de formularios). Se descartó class-validator: duplica tipos, no funciona en el navegador sin decoradores y no comparte la misma fuente de verdad.

**Consecuencias.** La documentación OpenAPI se generará desde los esquemas zod (F2) en lugar de decoradores de Swagger.
