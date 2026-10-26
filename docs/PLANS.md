# Planes y límites

Única fuente: `packages/domain/src/plans.ts` (`PLANS`, `TRIAL_DAYS`, `planState`). La API los hace cumplir y la web (Plan y facturación, página comercial, términos) los muestra.

| Plan          | Precio (MXN + IVA)      |   Usuarios |  Artículos | Fotografías |
| ------------- | ----------------------- | ---------: | ---------: | ----------: |
| Prueba gratis | 0, 14 días, sin tarjeta |         10 |     10,000 |       20 GB |
| Básico        | $299/mes · $2,990/año   |          3 |      1,000 |        2 GB |
| Profesional   | $699/mes · $6,990/año   |         10 |     10,000 |       20 GB |
| Empresa       | A la medida             | sin límite | sin límite |  sin límite |

- Usuarios cuenta miembros más invitaciones pendientes; artículos, los no archivados.
- Al pasar un límite la escritura responde `402 PLAN_LIMIT`; lo existente no se toca.
- Sin prueba vigente ni suscripción activa (`active`, `trialing`, `past_due`) la organización queda en solo lectura (`402 READ_ONLY`). Empresa nunca queda en solo lectura.
- **Asistente con IA**, preguntas por mes calendario (UTC; `ASSISTANT_MONTHLY_QUESTIONS`): prueba 50, Básico 100, Profesional 500, Empresa sin límite. Al agotarse, `402 ASSISTANT_LIMIT`; se renueva el día 1. Cifras provisionales hasta medir el costo real por pregunta (`assistant_usage` guarda los tokens).
- Precios aprobados para el lanzamiento (2026-10-25); revisar a los 6 meses.
- Stripe: claves de búsqueda `silopro_basic_month`, `silopro_basic_year`, `silopro_pro_month`, `silopro_pro_year` (ver [Despliegue](DEPLOYMENT.md)).
