# 0004 · PostgreSQL con Drizzle ORM

**Contexto.** Inventario exige transacciones, bloqueo de filas, restricciones `CHECK`, árboles (`ltree`), JSONB para atributos y RLS para multiempresa.

**Decisión.** PostgreSQL ≥ 16. Acceso con **Drizzle ORM** (SQL tipado, `SELECT … FOR UPDATE`, transacciones explícitas, migraciones SQL versionadas y revisables con drizzle-kit). Se descartaron Prisma (la versión 7 aún estaba en RC al iniciar; su modelo dificulta `FOR UPDATE`, RLS por transacción y tipos de PostgreSQL avanzados) y TypeORM (decoradores y migraciones autogeneradas poco predecibles).

**Consecuencias.** La Fase 1 solo incluye una sonda `select 1` (`DatabaseProbe`) con `pg`. Drizzle y la primera migración llegan en la Fase 2. Las migraciones se revisan en PR como SQL.
