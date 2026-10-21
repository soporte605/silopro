import { Inject, Injectable } from '@nestjs/common';
import type { Supplier, SupplierInput } from '@silopro/contracts';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { OrgContext } from '../auth/request-context.js';
import { notFound, staleVersion } from '../common/http.js';
import { DbService } from '../db/db.service.js';
import { suppliers } from '../db/schema.js';

const columns = {
  id: suppliers.id,
  name: suppliers.name,
  contactName: suppliers.contactName,
  email: suppliers.email,
  phone: suppliers.phone,
  website: suppliers.website,
  notes: suppliers.notes,
  version: suppliers.version,
};

@Injectable()
export class SuppliersService {
  constructor(@Inject(DbService) private readonly dbs: DbService) {}

  list(ctx: OrgContext): Promise<Supplier[]> {
    return this.dbs.tenant(ctx, (tx) =>
      tx
        .select(columns)
        .from(suppliers)
        .where(isNull(suppliers.archivedAt))
        .orderBy(asc(suppliers.name)),
    );
  }

  async create(ctx: OrgContext, input: SupplierInput): Promise<Supplier> {
    const [row] = await this.dbs.tenant(ctx, (tx) =>
      tx
        .insert(suppliers)
        .values({ ...input, organizationId: ctx.organizationId })
        .returning(columns),
    );
    return row!;
  }

  async update(
    ctx: OrgContext,
    id: string,
    input: SupplierInput & { version: number },
  ): Promise<Supplier> {
    return this.dbs.tenant(ctx, async (tx) => {
      const { version, ...data } = input;
      const [row] = await tx
        .update(suppliers)
        .set({ ...data, version: sql`${suppliers.version} + 1`, updatedAt: new Date() })
        .where(
          and(eq(suppliers.id, id), eq(suppliers.version, version), isNull(suppliers.archivedAt)),
        )
        .returning(columns);
      if (!row) {
        const exists = await tx
          .select({ id: suppliers.id })
          .from(suppliers)
          .where(eq(suppliers.id, id));
        throw exists.length ? staleVersion() : notFound('Proveedor');
      }
      return row;
    });
  }
}
