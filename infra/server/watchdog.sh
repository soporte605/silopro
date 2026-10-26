#!/bin/sh
# Vigilante de SiloPro: cada 5 minutos revisa la app en el servidor y desde
# internet. Con 2 fallas seguidas reinicia la API (solo si falla en el servidor)
# y avisa por correo; avisa también cuando se recupera y si el respaldo a R2
# lleva más de 26 horas sin completarse. Cron: infra/server/silopro.cron
set -u
SHARED=${SILOPRO_SHARED:-/opt/silopro/shared}
STATE=${WATCHDOG_STATE:-/opt/silopro/backups/.vigilante}
BACKUPS=${BACKUP_DIR:-/opt/silopro/backups}
LOCAL=${WATCHDOG_LOCAL:-http://127.0.0.1:3200/api/health}
PUBLIC=${WATCHDOG_PUBLIC:-https://app.silopro.elikarsystems.com/api/health}
CURL=${CURL:-curl}
DOCKER=${DOCKER:-docker}
HERE=$(dirname "$0")
NOTIFY="$HERE/notify.sh"

check() { $CURL -fsS --max-time 10 -o /dev/null "$1"; }

# Respaldo externo atrasado: un aviso por día como máximo.
if [ -f "$SHARED/backup.env" ] && [ -f "$BACKUPS/.ultimo-r2" ]; then
  if [ -n "$(find "$BACKUPS/.ultimo-r2" -mmin +1560)" ] && [ -z "$(find "$STATE.respaldo" -mmin -1440 2>/dev/null)" ]; then
    "$NOTIFY" "respaldo externo atrasado" "El último respaldo en R2 fue el $(cat "$BACKUPS/.ultimo-r2"). Revise /var/log/silopro-backup.log." && touch "$STATE.respaldo"
  fi
fi

fails=$(cat "$STATE" 2>/dev/null || echo 0)
problem=""
check "$LOCAL" || problem="local"
[ -z "$problem" ] && { check "$PUBLIC" || problem="public"; }

if [ -z "$problem" ]; then
  if [ "$fails" -ge 2 ]; then
    "$NOTIFY" "la app se recuperó" "SiloPro vuelve a responder después de $fails revisiones con falla." || true
  fi
  echo 0 > "$STATE"
  exit 0
fi

fails=$((fails + 1))
echo "$fails" > "$STATE"
echo "$(date -Is) falla $fails: $problem"
if [ "$fails" -eq 2 ]; then
  if [ "$problem" = local ]; then
    detail="La API no responde en el servidor."
    action="Sin acción automática."
    if (cd /opt/silopro/current && $DOCKER compose -p silopro -f infra/docker/compose.prod.yaml \
      --env-file "$SHARED/.env" restart api web >/dev/null 2>&1); then
      action="Reinicié la API y la web (docker compose restart)."
    fi
  else
    detail="La app responde en el servidor pero no desde internet (nginx, DNS o certificado)."
    action="Revise nginx; el vigilante no lo toca porque lo comparten otros servicios."
  fi
  "$NOTIFY" "la app no responde" "$detail (2 revisiones seguidas, cada 5 min). $action Le aviso cuando se recupere." || true
fi
