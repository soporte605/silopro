# Registros de decisiones de arquitectura (ADR)

Formato: contexto → decisión → consecuencias. Un ADR aceptado no se edita: se reemplaza con uno nuevo que lo marque como sustituido.

| #                                                | Decisión                                                                 | Estado                       |
| ------------------------------------------------ | ------------------------------------------------------------------------ | ---------------------------- |
| [0001](0001-monorepo-pnpm.md)                    | Monorepo con pnpm workspaces, sin Nx                                     | Aceptado                     |
| [0002](0002-monolito-modular.md)                 | Monolito modular, sin microservicios                                     | Aceptado                     |
| [0003](0003-angular-tailwind-cdk.md)             | Angular 22 zoneless + Tailwind CSS v4 + Angular CDK                      | Aceptado                     |
| [0004](0004-postgresql-drizzle.md)               | PostgreSQL con Drizzle ORM y migraciones SQL                             | Aceptado (implementación F2) |
| [0005](0005-contratos-zod.md)                    | Contratos compartidos con zod                                            | Aceptado                     |
| [0006](0006-identificadores-y-sincronizacion.md) | UUIDv7, versionado y movimientos como eventos para sincronización futura | Aceptado (diseño)            |
| [0007](0007-threejs-visualizacion.md)            | Three.js para visualización 3D, separado del dominio                     | Aceptado (implementación F4) |
| [0008](0008-cadquery-generacion-cad.md)          | CadQuery para CAD paramétrico; OpenSCAD descartado como motor principal  | Propuesto (F7)               |
| [0009](0009-tipografia-geist.md)                 | Geist + Geist Mono                                                       | Aceptado                     |
| [0010](0010-qr-referencias-opacas.md)            | QR con referencias opacas resolubles                                     | Aceptado                     |
| [0011](0011-multiempresa-rls.md)                 | Multiempresa con `organization_id` + RLS                                 | Aceptado (implementación F2) |
