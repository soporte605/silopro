import { Inject, Injectable } from '@nestjs/common';
import type { Category, CategoryInput } from '@silopro/contracts';
import {
  type AttributeDefinition,
  effectiveAttributes,
  validateAttributeDefinitions,
} from '@silopro/domain';
import { and, asc, count, eq, isNull, sql } from 'drizzle-orm';
import type { OrgContext } from '../auth/request-context.js';
import { invalid, notFound, staleVersion } from '../common/http.js';
import { DbService, type Tx } from '../db/db.service.js';
import { categories, items } from '../db/schema.js';

@Injectable()
export class CategoriesService {
  constructor(@Inject(DbService) private readonly dbs: DbService) {}

  list(ctx: OrgContext): Promise<Category[]> {
    return this.dbs.tenant(ctx, async (tx) => {
      const counts = tx
        .select({ categoryId: items.categoryId, n: count().as('n') })
        .from(items)
        .where(isNull(items.archivedAt))
        .groupBy(items.categoryId)
        .as('counts');
      const rows = await tx
        .select({
          id: categories.id,
          name: categories.name,
          parentId: categories.parentId,
          description: categories.description,
          attributes: categories.attributes,
          version: categories.version,
          itemCount: sql<number>`coalesce(${counts.n}, 0)::int`,
        })
        .from(categories)
        .leftJoin(counts, eq(counts.categoryId, categories.id))
        .where(isNull(categories.archivedAt))
        .orderBy(asc(categories.name));
      return rows.map((r) => ({ ...r, attributes: r.attributes as AttributeDefinition[] }));
    });
  }

  async create(ctx: OrgContext, input: CategoryInput): Promise<Category> {
    this.assertDefinitions(input.attributes);
    return this.dbs.tenant(ctx, async (tx) => {
      if (input.parentId) await this.ancestors(tx, input.parentId);
      const [row] = await tx
        .insert(categories)
        .values({ ...input, organizationId: ctx.organizationId })
        .returning();
      return this.toDto(row!, 0);
    });
  }

  async update(
    ctx: OrgContext,
    id: string,
    input: CategoryInput & { version: number },
  ): Promise<Category> {
    this.assertDefinitions(input.attributes);
    return this.dbs.tenant(ctx, async (tx) => {
      if (input.parentId) {
        const chain = await this.ancestors(tx, input.parentId);
        if (input.parentId === id || chain.some((c) => c.id === id)) {
          throw invalid('Una categoría no puede ser subcategoría de sí misma');
        }
      }
      const [row] = await tx
        .update(categories)
        .set({
          name: input.name,
          parentId: input.parentId,
          description: input.description,
          attributes: input.attributes,
          version: sql`${categories.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(categories.id, id),
            eq(categories.version, input.version),
            isNull(categories.archivedAt),
          ),
        )
        .returning();
      if (!row) {
        const exists = await tx
          .select({ id: categories.id })
          .from(categories)
          .where(eq(categories.id, id));
        throw exists.length ? staleVersion() : notFound('Categoría');
      }
      return this.toDto(row, 0);
    });
  }

  async archive(ctx: OrgContext, id: string): Promise<void> {
    await this.dbs.tenant(ctx, async (tx) => {
      const [children] = await tx
        .select({ n: count() })
        .from(categories)
        .where(and(eq(categories.parentId, id), isNull(categories.archivedAt)));
      if ((children?.n ?? 0) > 0) throw invalid('La categoría tiene subcategorías activas');
      const res = await tx
        .update(categories)
        .set({ archivedAt: new Date() })
        .where(and(eq(categories.id, id), isNull(categories.archivedAt)))
        .returning({ id: categories.id });
      if (!res.length) throw notFound('Categoría');
    });
  }

  /** Atributos efectivos (heredados de la raíz a la hoja) de una categoría. */
  async effectiveAttributes(tx: Tx, categoryId: string): Promise<AttributeDefinition[]> {
    const chain = await this.ancestors(tx, categoryId);
    return effectiveAttributes(chain.reverse().map((c) => c.attributes));
  }

  /** Cadena desde la categoría hasta la raíz (hoja primero). */
  private async ancestors(tx: Tx, id: string) {
    const rows = await tx.execute<{ id: string; attributes: AttributeDefinition[] }>(sql`
      with recursive chain as (
        select id, parent_id, attributes, 1 as depth from categories
          where id = ${id} and archived_at is null
        union all
        select c.id, c.parent_id, c.attributes, chain.depth + 1 from categories c
          join chain on c.id = chain.parent_id
          where chain.depth < 20
      )
      select id, attributes from chain order by depth`);
    if (!rows.rows.length) throw invalid('La categoría indicada no existe');
    return rows.rows;
  }

  private assertDefinitions(defs: AttributeDefinition[]): void {
    const issues = validateAttributeDefinitions(defs);
    if (issues.length) throw invalid('Definición de atributos inválida', issues);
  }

  private toDto(row: typeof categories.$inferSelect, itemCount: number): Category {
    return {
      id: row.id,
      name: row.name,
      parentId: row.parentId,
      description: row.description,
      attributes: row.attributes as AttributeDefinition[],
      version: row.version,
      itemCount,
    };
  }
}
