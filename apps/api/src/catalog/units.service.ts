import { Inject, Injectable } from '@nestjs/common';
import type { Unit, UnitInput } from '@silopro/contracts';
import { asc } from 'drizzle-orm';
import type { OrgContext } from '../auth/request-context.js';
import { DbService } from '../db/db.service.js';
import { units } from '../db/schema.js';

@Injectable()
export class UnitsService {
  constructor(@Inject(DbService) private readonly dbs: DbService) {}

  list(ctx: OrgContext): Promise<Unit[]> {
    return this.dbs.tenant(ctx, (tx) =>
      tx
        .select({
          id: units.id,
          code: units.code,
          name: units.name,
          symbol: units.symbol,
          decimals: units.decimals,
        })
        .from(units)
        .orderBy(asc(units.name)),
    );
  }

  async create(ctx: OrgContext, input: UnitInput): Promise<Unit> {
    const [row] = await this.dbs.tenant(ctx, (tx) =>
      tx
        .insert(units)
        .values({ ...input, organizationId: ctx.organizationId })
        .returning({
          id: units.id,
          code: units.code,
          name: units.name,
          symbol: units.symbol,
          decimals: units.decimals,
        }),
    );
    return row!;
  }
}
