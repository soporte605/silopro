# Seguridad

## Reporte de vulnerabilidades

Escriba a soporte de ElikarSystems con el asunto «Seguridad SiloPro». No abra incidencias públicas con detalles explotables.

## Controles implementados (Fase 1)

| Control                                                                                                 | Dónde                                      |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Validación de configuración al arranque; los mensajes nunca incluyen valores (solo nombres de variable) | `apps/api/src/config/env.ts` + prueba      |
| Cabeceras de seguridad (Helmet: `nosniff`, sin `X-Powered-By`, etc.)                                    | `apps/api/src/bootstrap.ts` + prueba       |
| CORS con lista explícita de orígenes                                                                    | `CORS_ORIGINS`                             |
| Errores uniformes; errores no controlados responden genéricamente y se registran solo en servidor       | `http-exception.filter.ts`                 |
| Validación de entradas con esquemas compartidos (zod)                                                   | `ZodValidationPipe` + `@silopro/contracts` |
| QR con referencias opacas aleatorias (CSPRNG), sin datos del artículo                                   | `@silopro/contracts/qr.ts` (ADR-0010)      |
| Secretos fuera del repositorio (`.env` ignorado; `.env.example` sin secretos reales)                    | `.gitignore`                               |
| Contenedores: usuario sin privilegios (`node`), puertos publicados solo en `127.0.0.1`                  | `infra/docker/`                            |
| nginx: `X-Frame-Options DENY`, `nosniff`, `Referrer-Policy`, sin versión                                | `infra/docker/nginx.conf`                  |

## Diseño para las fases siguientes

- **Autenticación (F2):** contraseñas con Argon2id; sesiones en cookie `HttpOnly; Secure; SameSite=Lax` con rotación; protección CSRF por _double submit_; límite de intentos por IP y cuenta.
- **Autorización por recurso:** cada caso de uso recibe el contexto (usuario, organización, rol) y verifica permisos; RLS de PostgreSQL como segunda barrera (ADR-0011). Pruebas que intentan leer/escribir datos de otra organización en **cada** endpoint.
- **Archivos (fotografías):** tamaño máximo, verificación de tipo por firma (no por extensión), re-codificación de imágenes para eliminar metadatos EXIF/GPS, nombres aleatorios, almacenamiento fuera de la raíz pública, descarga mediante URL firmada.
- **Auditoría:** registro inmutable de movimientos y cambios administrativos (quién, qué, cuándo, desde dónde).
- **Dependencias:** `pnpm audit` en CI y actualización mensual; scripts de instalación solo para paquetes aprobados (`allowBuilds` en `pnpm-workspace.yaml`).
- **CSP** estricta en producción (`script-src 'self'`); el único script en línea actual (aplicar el tema antes del primer pintado) se moverá a un archivo o se autorizará por hash.
