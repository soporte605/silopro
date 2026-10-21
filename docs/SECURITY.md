# Seguridad

## Reporte de vulnerabilidades

Escriba a soporte de ElikarSystems con el asunto «Seguridad SiloPro». No abra incidencias públicas con detalles explotables.

## Controles implementados (Fases 1 y 2)

| Control                                                                                                                  | Dónde                                                        |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Validación de configuración al arranque; los mensajes nunca incluyen valores (solo nombres de variable)                  | `apps/api/src/config/env.ts` + prueba                        |
| Cabeceras de seguridad (Helmet: `nosniff`, sin `X-Powered-By`, etc.)                                                     | `apps/api/src/bootstrap.ts` + prueba                         |
| CORS con lista explícita de orígenes                                                                                     | `CORS_ORIGINS`                                               |
| Errores uniformes; errores no controlados responden genéricamente y se registran solo en servidor                        | `http-exception.filter.ts`                                   |
| Validación de entradas con esquemas compartidos (zod)                                                                    | `ZodValidationPipe` + `@silopro/contracts`                   |
| QR con referencias opacas aleatorias (CSPRNG), sin datos del artículo                                                    | `@silopro/contracts/qr.ts` (ADR-0010)                        |
| Secretos fuera del repositorio (`.env` ignorado; `.env.example` sin secretos reales)                                     | `.gitignore`                                                 |
| Contenedores: usuario sin privilegios (`node`), puertos publicados solo en `127.0.0.1`                                   | `infra/docker/`                                              |
| nginx: `X-Frame-Options DENY`, `nosniff`, `Referrer-Policy`, sin versión                                                 | `infra/docker/nginx.conf`                                    |
| Contraseñas con Argon2id (parámetros OWASP); mínimo 10 caracteres, sin reglas de composición (NIST)                      | `auth/password.ts`                                           |
| Sesión en cookie `sp_session` `HttpOnly; SameSite=Lax` (`Secure` en producción); en BD solo el hash SHA-256 del token    | `auth.service.ts`                                            |
| Inicio de sesión: límite de 10 intentos por 15 min (IP + correo), tiempo constante con hash ficticio, mensaje genérico   | `auth/rate-limiter.ts`, prueba                               |
| CSRF: toda petición que modifica exige la cabecera `X-SiloPro-Request: 1` (no se puede enviar desde otro sitio sin CORS) | `common/csrf.guard.ts`, prueba                               |
| Autorización por rol en cada endpoint (`@RequirePermission`), misma matriz en dominio, API y web                         | `@silopro/domain/permissions.ts`                             |
| Aislamiento entre organizaciones: guard (404 para organizaciones ajenas) + RLS forzado + FK compuestas                   | `auth/guards.ts`, migración `0001`, `test/isolation.spec.ts` |
| La API no arranca en producción con un rol de BD `SUPERUSER` o `BYPASSRLS`                                               | `db.service.ts`                                              |
| Movimientos inmutables (trigger) y saldos no negativos (CHECK + bloqueo de fila)                                         | migración `0001`, `test/inventory.spec.ts`                   |
| Redirección tras iniciar sesión solo a rutas internas (sin _open redirect_)                                              | `pages/auth/auth-layout.ts`, prueba                          |

## Diseño para las fases siguientes

- **Sesiones:** el limitador de intentos vive en memoria (una instancia); con varias réplicas pasará a PostgreSQL o Redis. Pendiente: cerrar todas las sesiones, recuperación de contraseña por correo e invitaciones a la organización.
- **Archivos (fotografías):** tamaño máximo, verificación de tipo por firma (no por extensión), re-codificación de imágenes para eliminar metadatos EXIF/GPS, nombres aleatorios, almacenamiento fuera de la raíz pública, descarga mediante URL firmada.
- **Auditoría:** registro inmutable de movimientos y cambios administrativos (quién, qué, cuándo, desde dónde).
- **Dependencias:** `pnpm audit` en CI y actualización mensual; scripts de instalación solo para paquetes aprobados (`allowBuilds` en `pnpm-workspace.yaml`).
- **CSP** estricta en producción (`script-src 'self'`); el único script en línea actual (aplicar el tema antes del primer pintado) se moverá a un archivo o se autorizará por hash.
