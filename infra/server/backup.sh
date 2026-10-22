#!/bin/sh
# Respaldo diario de SiloPro: base de datos y fotografías. Guarda 14 días.
# Cron (root): 30 3 * * * /opt/silopro/current/infra/server/backup.sh
set -eu
DEST=/opt/silopro/backups
STAMP=$(date +%Y%m%d-%H%M)
mkdir -p "$DEST"
docker exec silopro-postgres-1 pg_dump -U postgres -Fc silopro > "$DEST/silopro-$STAMP.dump"
docker run --rm -v silopro_uploads:/data:ro -v "$DEST":/out alpine \
  tar czf "/out/uploads-$STAMP.tar.gz" -C /data .
find "$DEST" -type f -mtime +14 -delete
