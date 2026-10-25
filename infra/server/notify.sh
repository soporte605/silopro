#!/bin/sh
# Aviso por correo para las tareas del servidor (respaldo, vigilante).
#   notify.sh "<asunto>" "<mensaje>"
# Usa RESEND_API_KEY y MAIL_FROM de /opt/silopro/shared/.env; destino
# ALERT_EMAIL (por omisión soporte@elikarsystems.com).
set -eu
SHARED=${SILOPRO_SHARED:-/opt/silopro/shared}
CURL=${CURL:-curl}
val() { sed -n "s/^$1=//p" "$SHARED/.env" 2>/dev/null | tail -n1 | sed 's/^["'\'']//; s/["'\'']$//'; }
KEY=$(val RESEND_API_KEY)
FROM=$(val MAIL_FROM)
TO=$(val ALERT_EMAIL)
[ -n "$KEY" ] || { echo "Sin RESEND_API_KEY: no se pudo avisar por correo" >&2; exit 1; }
json() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g' | awk 'BEGIN{ORS="\\n"} {print}' | sed 's/\\n$//'; }
TEXT="$(json "${2:-$1}")\\n\\nServidor: $(hostname)\\nHora: $(TZ=America/Mexico_City date '+%Y-%m-%d %H:%M')"
BODY=$(printf '{"from":"%s","to":["%s"],"subject":"SiloPro: %s","text":"%s"}' \
  "$(json "${FROM:-SiloPro <no-responder@silopro.elikarsystems.com>}")" \
  "$(json "${TO:-soporte@elikarsystems.com}")" "$(json "$1")" "$TEXT")
printf '%s' "$BODY" | $CURL -fsS --max-time 15 -o /dev/null https://api.resend.com/emails \
  -H "Authorization: Bearer $KEY" -H 'Content-Type: application/json' --data-binary @-
