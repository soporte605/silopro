#!/bin/sh
# Respaldo diario de SiloPro: base de datos y fotografías. Guarda 14 días en el
# servidor y, si existe /opt/silopro/shared/backup.env, sube una copia cifrada a
# Cloudflare R2 (ver docs/DEPLOYMENT.md). Si algo falla, avisa por correo.
# Cron: infra/server/silopro.cron
set -eu
DEST=${BACKUP_DIR:-/opt/silopro/backups}
SHARED=${SILOPRO_SHARED:-/opt/silopro/shared}
DOCKER=${DOCKER:-docker}
STAMP=$(date -u +%Y%m%dT%H%MZ)
HERE=$(dirname "$0")

fail() {
  echo "$(date -Is) respaldo falló: $1" >&2
  "$HERE/notify.sh" "falló el respaldo diario" "Detalle: $1. Bitácora: /var/log/silopro-backup.log" || true
  exit 1
}

mkdir -p "$DEST"
DB="$DEST/silopro-$STAMP.dump"
UP="$DEST/uploads-$STAMP.tar.gz"
$DOCKER exec silopro-postgres-1 pg_dump -U postgres -Fc silopro > "$DB" || fail "pg_dump"
$DOCKER run --rm -v silopro_uploads:/data:ro -v "$DEST":/out alpine:3.20 \
  tar czf "/out/$(basename "$UP")" -C /data . || fail "empaquetar fotografías"
find "$DEST" -type f -mtime +14 -delete
echo "$(date -Is) respaldo local listo: $(basename "$DB") $(basename "$UP")"

[ -f "$SHARED/backup.env" ] || exit 0
# shellcheck disable=SC1091
. "$SHARED/backup.env"
for v in R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BACKUP_BUCKET BACKUP_PASSPHRASE; do
  eval "[ -n \"\${$v:-}\" ]" || fail "falta $v en backup.env"
done

# Las llaves pasan por el entorno, no en la línea de comandos (visible en ps).
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
PREFIX="daily/$(date -u +%Y/%m)"
for f in "$DB" "$UP"; do
  enc="$f.enc"
  # Cifrado AES-256 con la frase de backup.env; sin ella el respaldo no se puede leer.
  BACKUP_PASSPHRASE=$BACKUP_PASSPHRASE openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt \
    -pass env:BACKUP_PASSPHRASE -in "$f" -out "$enc" || fail "cifrar $(basename "$f")"
  name=$(basename "$enc")
  size=$(wc -c < "$enc" | tr -d ' ')
  $DOCKER run --rm -v "$DEST":/data:ro \
    -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY \
    -e AWS_DEFAULT_REGION=auto amazon/aws-cli:2.38.5 \
    --endpoint-url "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com" \
    s3 cp --only-show-errors "/data/$name" "s3://$R2_BACKUP_BUCKET/$PREFIX/$name" ||
    { rm -f "$enc"; fail "subir $name a R2"; }
  remote=$($DOCKER run --rm \
    -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY \
    -e AWS_DEFAULT_REGION=auto amazon/aws-cli:2.38.5 \
    --endpoint-url "https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com" \
    s3api head-object --bucket "$R2_BACKUP_BUCKET" --key "$PREFIX/$name" \
    --query ContentLength --output text) || remote=""
  rm -f "$enc"
  [ "$remote" = "$size" ] || fail "$name: tamaño en R2 «$remote» distinto del local $size"
  echo "$(date -Is) subido $PREFIX/$name ($size bytes)"
done
date -Is > "$DEST/.ultimo-r2"
