import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { ENV, type Env } from '../config/env.js';
import * as schema from './schema.js';

export type Database = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Contexto de seguridad con el que se ejecuta una transacción. */
export interface TenantContext {
  userId: string;
  organizationId: string | null;
}

@Injectable()
export class DbService implements OnModuleDestroy {
  private readonly logger = new Logger(DbService.name);
  readonly pool: pg.Pool;
  readonly db: Database;

  constructor(@Inject(ENV) private readonly env: Env) {
    if (!env.DATABASE_URL) throw new Error('DATABASE_URL es obligatoria');
    this.pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 });
    this.db = drizzle(this.pool, { schema });
  }

  /**
   * Ejecuta `fn` en una transacción con el contexto de seguridad fijado para
   * las políticas RLS. Todo acceso a datos de negocio debe pasar por aquí.
   */
  tenant<T>(ctx: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select set_config('app.user_id', ${ctx.userId}, true), set_config('app.organization_id', ${ctx.organizationId ?? ''}, true)`,
      );
      return fn(tx);
    });
  }

  /**
   * Verifica que el rol de conexión no pueda saltarse RLS. Un superusuario o
   * un rol con BYPASSRLS anularía el aislamiento entre organizaciones.
   */
  async assertRlsEnforced(): Promise<void> {
    const { rows } = await this.pool.query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      'select rolsuper, rolbypassrls from pg_roles where rolname = current_user',
    );
    const role = rows[0];
    if (role?.rolsuper || role?.rolbypassrls) {
      const msg =
        'El rol de base de datos es superusuario o tiene BYPASSRLS: el aislamiento entre organizaciones no se aplicaría.';
      if (this.env.NODE_ENV === 'production') throw new Error(msg);
      this.logger.warn(msg);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
