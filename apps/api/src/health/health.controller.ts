import { Controller, Get, Inject } from '@nestjs/common';
import type { HealthResponse } from '@silopro/contracts';
import { APP_VERSION } from '../version.js';
import { DatabaseProbe } from './database.probe.js';

@Controller('health')
export class HealthController {
  constructor(@Inject(DatabaseProbe) private readonly db: DatabaseProbe) {}

  @Get()
  async get(): Promise<HealthResponse> {
    const database = await this.db.check();
    return {
      status: database === 'down' ? 'degraded' : 'ok',
      version: APP_VERSION,
      uptimeSeconds: Math.round(process.uptime()),
      checks: { database },
    };
  }
}
