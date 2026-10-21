import { Inject, Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service.js';

@Injectable()
export class DatabaseProbe {
  constructor(@Inject(DbService) private readonly dbs: DbService) {}

  async check(): Promise<'up' | 'down'> {
    try {
      await this.dbs.pool.query('select 1');
      return 'up';
    } catch {
      return 'down';
    }
  }
}
