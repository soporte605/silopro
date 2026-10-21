# 0011 · Multiempresa con `organization_id` y Row Level Security

**Decisión.** Base de datos compartida, esquema compartido, columna `organization_id` en cada tabla de negocio. Doble barrera:

1. Los repositorios filtran siempre por la organización del contexto de la petición.
2. **RLS** en PostgreSQL: políticas `USING (organization_id = current_setting('app.organization_id')::uuid)` y el servicio ejecuta `SET LOCAL app.organization_id = …` al inicio de cada transacción con un rol sin `BYPASSRLS`.

Roles iniciales por organización: propietario, administrador, operador (movimientos), consulta. Límites por plan (usuarios, almacenes, artículos) se verifican en la capa de aplicación.

**Consecuencias.** Pruebas de autorización obligatorias por endpoint (usuario de la organización A intenta acceder a datos de B → 404). Instalaciones locales usan una sola organización con el mismo código.
