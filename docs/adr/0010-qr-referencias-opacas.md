# 0010 · Etiquetas QR con referencias opacas

**Decisión.** El QR contiene `silo:<tipo>/<código>` (p. ej. `silo:location/7K3QXM9T2B`), con un código aleatorio de 10 caracteres base32 Crockford (~50 bits) generado con CSPRNG y almacenado en la entidad. No incluye ids internos, nombres, cantidades ni precios. Al escanear, la app resuelve el código contra la API **con la autorización del usuario**; un QR fotografiado no revela nada.

Para escaneo con la cámara nativa del teléfono se podrá emitir la variante URL `https://<host>/q/<código>` (misma referencia), cuando exista dominio aprobado.

**Consecuencias.** Reimprimir una etiqueta no cambia el código; se puede revocar regenerando el código de la entidad. Implementado: `@silopro/contracts/qr.ts`.
