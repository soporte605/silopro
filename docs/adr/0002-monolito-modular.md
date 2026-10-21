# 0002 · Monolito modular

**Contexto.** El producto debe correr localmente en un taller (un servidor, Docker) y también como SaaS.

**Decisión.** Una sola API NestJS organizada en módulos por contexto (auth, organizations, catalog, inventory, locations, cabinets, movements, labels, projects). Los módulos se comunican por servicios de aplicación, no accediendo a tablas ajenas. Reglas puras en paquetes sin framework.

**Consecuencias.** Despliegue y transacciones simples (un movimiento de stock y su auditoría en la misma transacción). La excepción prevista es el generador CAD (Python), que correrá como proceso aparte detrás de una cola porque su stack y su perfil de CPU son distintos (ADR-0008).
