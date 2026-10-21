# Despliegue

## Local con Docker (prioridad actual)

```bash
docker compose -f infra/docker/compose.yaml up -d --build
```

| Servicio | URL                              | Imagen                                                     |
| -------- | -------------------------------- | ---------------------------------------------------------- |
| web      | http://localhost:8080            | nginx 1.29 + build de Angular; `/api` se redirige a la API |
| api      | http://localhost:3000/api/health | Node 24 alpine, usuario `node`, `pnpm deploy --prod`       |
| postgres | localhost:5432                   | postgres:18-alpine, volumen `pgdata`                       |

Los puertos se publican solo en `127.0.0.1`. Para exponer SiloPro en la red del taller cambie el _bind_ del servicio `web` (`0.0.0.0:8080:80`) y defina `POSTGRES_PASSWORD` en un `.env` junto al archivo Compose.

Detener: `docker compose -f infra/docker/compose.yaml down` (añadir `-v` **borra la base de datos**).

### Variables de la API

| Variable       | Por defecto             | Descripción                                          |
| -------------- | ----------------------- | ---------------------------------------------------- |
| `PORT`         | 3000                    | Puerto HTTP                                          |
| `CORS_ORIGINS` | `http://localhost:4200` | Orígenes permitidos, separados por coma              |
| `DATABASE_URL` | —                       | `postgres://…`; si falta, la salud reporta `skipped` |
| `NODE_ENV`     | development             | `production` en contenedores                         |

## Desarrollo sin Docker

```bash
pnpm install && pnpm build:packages
pnpm dev:api     # :3000
pnpm dev:web     # :4200, proxy /api → :3000 (apps/web/proxy.conf.json)
```

## Nube y escritorio

Aún no hay despliegues públicos. Cualquier despliegue público, contratación de servicios o dominio **requiere autorización previa** del propietario. Opciones previstas: una VM con Docker Compose y proxy TLS (Caddy) para pilotos; servicio gestionado de PostgreSQL para SaaS; Tauri para escritorio (Fase 8).

## Versionado y publicación

SemVer con sufijos `-alpha.N` / `-beta.N`. Las etiquetas git se crean solo cuando la fase correspondiente pasa todos sus criterios. Publicar en un remoto requiere autorización.
