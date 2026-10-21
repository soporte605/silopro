import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import pg from 'pg';
import { ENV, type Env } from '../config/env.js';

/**
 * Sonda mínima de PostgreSQL para Fase 1. La capa de persistencia completa
 * (Drizzle + migraciones) se incorpora en Fase 2; ver ADR-0004.
 */
@Injectable()
export class DatabaseProbe implements OnModuleDestroy {
  private pool: pg.Pool | null = null;

  constructor(@Inject(ENV) private readonly env: Env) {}

  async check(): Promise<'up' | 'down' | 'skipped'> {
    if (!this.env.DATABASE_URL) return 'skipped';
    this.pool ??= new pg.Pool({
      connectionString: this.env.DATABASE_URL,
      max: 1,
      connectionTimeoutMillis: 2000,
    });
    try {
      await this.pool.query('select 1');
      return 'up';
    } catch {
      return 'down';
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}
