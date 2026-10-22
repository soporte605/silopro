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

Las fotografías se guardan en el volumen `uploads` (montado en `/data/uploads` de la API). Respalde **ambos** volúmenes: `pgdata` y `uploads`. nginx acepta cuerpos de hasta 9 MB en `/api/`.

Los puertos se publican solo en `127.0.0.1`. Para exponer SiloPro en la red del taller cambie el _bind_ del servicio `web` (`0.0.0.0:8080:80`) y defina `POSTGRES_PASSWORD` en un `.env` junto al archivo Compose.

Detener: `docker compose -f infra/docker/compose.yaml down` (añadir `-v` **borra la base de datos y las fotografías**).

### Variables de la API

| Variable           | Por defecto             | Descripción                                                 |
| ------------------ | ----------------------- | ----------------------------------------------------------- |
| `PORT`             | 3000                    | Puerto HTTP                                                 |
| `CORS_ORIGINS`     | `http://localhost:4200` | Orígenes permitidos, separados por coma                     |
| `DATABASE_URL`     | —                       | **Obligatoria.** Rol sin `SUPERUSER` ni `BYPASSRLS`         |
| `MIGRATE_ON_START` | false                   | Aplica migraciones pendientes al arrancar                   |
| `SESSION_TTL_DAYS` | 14                      | Duración de la sesión                                       |
| `COOKIE_SECURE`    | `true` en producción    | Ponga `false` solo si sirve por HTTP en la red local        |
| `NODE_ENV`         | development             | `production` en contenedores                                |
| `UPLOADS_DIR`      | `./data/uploads`        | Carpeta privada de fotografías (`/data/uploads` en Docker)  |
| `PUBLIC_WEB_URL`   | `http://localhost:4200` | Dirección de la web para los enlaces de invitación          |
| `TRUST_PROXY_HOPS` | 1                       | Proxies delante de la API (2 con nginx + HTTPS en servidor) |

El contenedor de PostgreSQL crea al iniciarse por primera vez el rol de aplicación `silopro` sin privilegios especiales (`infra/docker/postgres-init.sh`); el superusuario `postgres` solo se usa para administración.

## Servidor público (app.silopro.elikarsystems.com)

Mismo modelo que los demás servicios Docker del servidor: el nginx del sistema termina HTTPS (Let's Encrypt) y reenvía a un puerto local; nada más queda expuesto.

```
/opt/silopro/
  releases/<etiqueta>/   # copia del repositorio en esa versión
  current -> releases/<etiqueta>
  shared/.env            # contraseñas y URL pública (permisos 600, fuera del repo)
  backups/               # pg_dump y fotografías, 14 días
```

`shared/.env`:

```
POSTGRES_ADMIN_PASSWORD=<aleatoria>
POSTGRES_PASSWORD=<aleatoria>
PUBLIC_WEB_URL=https://app.silopro.elikarsystems.com
SILOPRO_WEB_PORT=3200
```

Primera instalación y cada versión nueva:

```bash
git clone --branch vX.Y.Z --depth 1 https://github.com/soporte605/silopro /opt/silopro/releases/vX.Y.Z
ln -sfn /opt/silopro/releases/vX.Y.Z /opt/silopro/current
cd /opt/silopro/current
docker compose -p silopro -f infra/docker/compose.prod.yaml --env-file /opt/silopro/shared/.env up -d --build
curl -s http://127.0.0.1:3200/api/health
```

Una sola vez: copiar `infra/server/silopro.nginx.conf` a `/etc/nginx/sites-available/`, enlazarlo en `sites-enabled`, `nginx -t && systemctl reload nginx` y `certbot --nginx -d app.silopro.elikarsystems.com`. Respaldo diario con `infra/server/backup.sh` en el cron de root. Volver a la versión anterior: apuntar `current` a la release previa y repetir `up -d --build` (las migraciones solo agregan).

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
