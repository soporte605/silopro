import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

/** Carpeta de migraciones SQL versionadas (generadas con drizzle-kit). */
export const MIGRATIONS_DIR = fileURLToPath(new URL('../../drizzle', import.meta.url));

export async function runMigrations(databaseUrl: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_DIR });
  } finally {
    await pool.end();
  }
}

// Ejecución directa: `node dist/db/migrate.js`
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    console.error('DATABASE_URL es obligatoria');
    process.exit(1);
  }
  runMigrations(url)
    .then(() => console.warn('Migraciones aplicadas'))
    .catch((e: unknown) => {
      console.error(e);
      process.exit(1);
    });
}
