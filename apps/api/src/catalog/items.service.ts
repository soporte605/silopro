import { Inject, Injectable } from '@nestjs/common';
import {
  generateShortCode,
  type Item,
  type itemListQuerySchema,
  type Page,
  type itemInputSchema,
} from '@silopro/contracts';
import { isLowStock, validateAttributeValues } from '@silopro/domain';
import { and, asc, eq, ilike, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { z } from 'zod';
import type { OrgContext } from '../auth/request-context.js';
import { invalid, notFound, staleVersion } from '../common/http.js';
import { DbService, type Tx } from '../db/db.service.js';
import { num, num0 } from '../db/mappers.js';
import { categories, itemPhotos, items, itemSuppliers, stockLevels, units } from '../db/schema.js';
import { CategoriesService } from './categories.service.js';

type ItemData = z.output<typeof itemInputSchema>;

@Injectable()
export class ItemsService {
  constructor(
    @Inject(DbService) private readonly dbs: DbService,
    @Inject(CategoriesService) private readonly categoriesSvc: CategoriesService,
  ) {}

  async list(ctx: OrgContext, q: z.output<typeof itemListQuerySchema>): Promise<Page<Item>> {
    return this.dbs.tenant(ctx, async (tx) => {
      const filters: SQL[] = [isNull(items.archivedAt)];
      if (q.q) {
        const like = `%${q.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
        filters.push(
          or(
            ilike(items.sku, like),
            ilike(items.name, like),
            ilike(items.internalCode, like),
            ilike(items.manufacturer, like),
            ilike(items.model, like),
          )!,
        );
      }
      if (q.categoryId) filters.push(eq(items.categoryId, q.categoryId));
      const stock = this.stockSubquery(tx);
      if (q.lowStock) {
        filters.push(
          sql`${items.minStock} > 0 and coalesce(${stock.onHand}, 0) - coalesce(${stock.reserved}, 0) <= ${items.minStock}`,
        );
      }
      const where = and(...filters);
      const [rows, totalRows] = await Promise.all([
        this.baseQuery(tx, stock)
          .where(where)
          .orderBy(asc(items.name), asc(items.id))
          .limit(q.limit)
          .offset(q.offset),
        tx
          .select({ n: sql<number>`count(*)::int` })
          .from(items)
          .leftJoin(stock, eq(stock.itemId, items.id))
          .where(where),
      ]);
      return {
        items: rows.map((r) => this.toDto(r, [])),
        total: totalRows[0]?.n ?? 0,
        limit: q.limit,
        offset: q.offset,
      };
    });
  }

  get(ctx: OrgContext, id: string): Promise<Item> {
    return this.dbs.tenant(ctx, (tx) => this.load(tx, id));
  }

  async create(ctx: OrgContext, input: ItemData): Promise<Item> {
    return this.dbs.tenant(ctx, async (tx) => {
      const attributes = await this.checkAttributes(tx, input.categoryId, input.attributes);
      const [row] = await tx
        .insert(items)
        .values({
          ...this.columns(input),
          attributes,
          organizationId: ctx.organizationId,
          qrCode: generateShortCode(),
        })
        .returning({ id: items.id });
      await this.setSuppliers(tx, ctx, row!.id, input.supplierIds);
      return this.load(tx, row!.id);
    });
  }

  async update(ctx: OrgContext, id: string, input: ItemData & { version: number }): Promise<Item> {
    return this.dbs.tenant(ctx, async (tx) => {
      const attributes = await this.checkAttributes(tx, input.categoryId, input.attributes);
      const res = await tx
        .update(items)
        .set({
          ...this.columns(input),
          attributes,
          version: sql`${items.version} + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(items.id, id), eq(items.version, input.version), isNull(items.archivedAt)))
        .returning({ id: items.id });
      if (!res.length) {
        const exists = await tx
          .select({ id: items.id })
          .from(items)
          .where(and(eq(items.id, id), isNull(items.archivedAt)));
        throw exists.length ? staleVersion() : notFound('Artículo');
      }
      await this.setSuppliers(tx, ctx, id, input.supplierIds);
      return this.load(tx, id);
    });
  }

  async archive(ctx: OrgContext, id: string): Promise<void> {
    await this.dbs.tenant(ctx, async (tx) => {
      const res = await tx
        .update(items)
        .set({ archivedAt: new Date() })
        .where(and(eq(items.id, id), isNull(items.archivedAt)))
        .returning({ id: items.id });
      if (!res.length) throw notFound('Artículo');
    });
  }

  // ── auxiliares ───────────────────────────────────────────────────────────

  private columns(input: ItemData) {
    return {
      sku: input.sku,
      internalCode: input.internalCode,
      name: input.name,
      description: input.description,
      categoryId: input.categoryId,
      unitId: input.unitId,
      manufacturer: input.manufacturer,
      model: input.model,
      cost: input.cost == null ? null : String(input.cost),
      price: input.price == null ? null : String(input.price),
      minStock: input.minStock == null ? null : String(input.minStock),
    };
  }

  private async checkAttributes(
    tx: Tx,
    categoryId: string | null,
    values: Record<string, unknown>,
  ) {
    const defs = categoryId ? await this.categoriesSvc.effectiveAttributes(tx, categoryId) : [];
    const { values: clean, issues } = validateAttributeValues(defs, values);
    if (issues.length) throw invalid('Atributos inválidos', issues);
    return clean;
  }

  private async setSuppliers(tx: Tx, ctx: OrgContext, itemId: string, supplierIds: string[]) {
    await tx.delete(itemSuppliers).where(eq(itemSuppliers.itemId, itemId));
    const unique = [...new Set(supplierIds)];
    if (unique.length) {
      // La FK compuesta (organization_id, supplier_id) rechaza proveedores ajenos.
      await tx
        .insert(itemSuppliers)
        .values(
          unique.map((supplierId) => ({ organizationId: ctx.organizationId, itemId, supplierId })),
        );
    }
  }

  private stockSubquery(tx: Tx) {
    return tx
      .select({
        itemId: stockLevels.itemId,
        onHand: sql<string>`sum(${stockLevels.onHand})`.as('on_hand'),
        reserved: sql<string>`sum(${stockLevels.reserved})`.as('reserved'),
      })
      .from(stockLevels)
      .groupBy(stockLevels.itemId)
      .as('stock');
  }

  private baseQuery(tx: Tx, stock: ReturnType<ItemsService['stockSubquery']>) {
    return tx
      .select({
        item: items,
        categoryName: categories.name,
        unitSymbol: units.symbol,
        onHand: stock.onHand,
        reserved: stock.reserved,
        coverPhotoId: sql<
          string | null
        >`(select ${itemPhotos.id} from ${itemPhotos} where ${itemPhotos.itemId} = ${items.id} order by ${itemPhotos.position}, ${itemPhotos.createdAt} limit 1)`,
      })
      .from(items)
      .innerJoin(units, eq(units.id, items.unitId))
      .leftJoin(categories, eq(categories.id, items.categoryId))
      .leftJoin(stock, eq(stock.itemId, items.id));
  }

  private async load(tx: Tx, id: string): Promise<Item> {
    const stock = this.stockSubquery(tx);
    const [row] = await this.baseQuery(tx, stock).where(
      and(eq(items.id, id), isNull(items.archivedAt)),
    );
    if (!row) throw notFound('Artículo');
    const sup = await tx
      .select({ id: itemSuppliers.supplierId })
      .from(itemSuppliers)
      .where(eq(itemSuppliers.itemId, id));
    return this.toDto(
      row,
      sup.map((s) => s.id),
    );
  }

  private toDto(
    r: {
      item: typeof items.$inferSelect;
      categoryName: string | null;
      unitSymbol: string;
      onHand: string | null;
      reserved: string | null;
      coverPhotoId: string | null;
    },
    supplierIds: string[],
  ): Item {
    const onHand = num0(r.onHand);
    const reserved = num0(r.reserved);
    const minStock = num(r.item.minStock);
    return {
      id: r.item.id,
      sku: r.item.sku,
      internalCode: r.item.internalCode,
      name: r.item.name,
      description: r.item.description,
      categoryId: r.item.categoryId,
      categoryName: r.categoryName,
      unitId: r.item.unitId,
      unitSymbol: r.unitSymbol,
      manufacturer: r.item.manufacturer,
      model: r.item.model,
      cost: num(r.item.cost),
      price: num(r.item.price),
      minStock,
      attributes: r.item.attributes as Item['attributes'],
      supplierIds,
      qrCode: r.item.qrCode,
      coverPhotoId: r.coverPhotoId,
      onHand,
      reserved,
      available: onHand - reserved,
      lowStock: isLowStock(onHand - reserved, minStock),
      version: r.item.version,
      createdAt: r.item.createdAt.toISOString(),
      updatedAt: r.item.updatedAt.toISOString(),
    };
  }
}
