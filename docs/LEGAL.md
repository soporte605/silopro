# Documentos legales

El aviso de privacidad (`/privacidad`) y los términos y condiciones (`/terminos`) viven en `apps/web/src/app/pages/public/`. Los datos del responsable están en `legal-info.ts`; mientras `LEGAL.draft` sea `true`, ambas páginas muestran que son un borrador.

> Son borradores redactados con base en la LFPDPPP y en cómo funciona SiloPro hoy. **Deben revisarse con un abogado antes del lanzamiento.**

## Pendiente antes de quitar `draft`

| Dato                                          | Dónde                                     |
| --------------------------------------------- | ----------------------------------------- |
| Nombre o razón social del responsable         | `LEGAL.owner`                             |
| Domicilio para notificaciones                 | `LEGAL.address`                           |
| Ciudad para controversias                     | `LEGAL.jurisdiction`                      |
| Correo para derechos ARCO (hoy el de soporte) | `CONTACT_EMAIL` en `billing/plan-copy.ts` |

## Decisiones de negocio escritas en los términos (confirmar)

- Sin reembolsos por periodos parciales al cancelar, salvo que la ley lo exija.
- Aviso de 30 días antes de un cambio de precio; aplica en la siguiente renovación.
- Responsabilidad limitada a lo pagado en los últimos 12 meses.
- Aviso de 60 días si se deja de ofrecer el servicio.
- Respaldos sobrescritos en hasta 30 días tras una solicitud de eliminación.
- No se menciona la emisión de factura (CFDI); definir si se ofrecerá y cómo.

## Al cambiar el funcionamiento

Actualice los textos y `LEGAL.updated` si cambia: qué datos se guardan, los proveedores que los tratan (hoy Stripe, Resend y Contabo; al agregar respaldos externos, ese proveedor), las cookies o el almacenamiento del navegador, o las finalidades (por ejemplo, correos de novedades, que requerirían consentimiento y forma de negarse).
