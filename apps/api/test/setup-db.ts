import pg from 'pg';
import { runMigrations } from '../src/db/migrate.js';

/**
 * Preparación global de las pruebas de integración: recrea el esquema de la
 * base de datos de pruebas y aplica todas las migraciones desde cero.
 * Requiere TEST_DATABASE_URL apuntando a una base DESECHABLE.
 */
export default async function setup(): Promise<void> {
  const url = process.env['TEST_DATABASE_URL'];
  if (!url) return;
  if (!/test/i.test(new URL(url).pathname)) {
    throw new Error('TEST_DATABASE_URL debe apuntar a una base cuyo nombre contenga "test"');
  }
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  const { rows } = await pool.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
    'select rolsuper, rolbypassrls from pg_roles where rolname = current_user',
  );
  if (rows[0]?.rolsuper || rows[0]?.rolbypassrls) {
    await pool.end();
    throw new Error(
      'El rol de pruebas no debe ser superusuario ni tener BYPASSRLS: las pruebas de RLS no serían válidas',
    );
  }
  await pool.query(
    'drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;',
  );
  await pool
    .query('drop type if exists member_role, location_kind, movement_kind cascade')
    .catch(() => {});
  await pool.end();
  await runMigrations(url);
}
