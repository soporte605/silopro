import { Inject, Injectable } from '@nestjs/common';
import {
  generateShortCode,
  type ImportResult,
  type ImportRowResult,
  type importRequestSchema,
  type importRowSchema,
} from '@silopro/contracts';
import { toScaled, validateAttributeValues } from '@silopro/domain';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { OrgContext } from '../auth/request-context.js';
import { CategoriesService } from '../catalog/categories.service.js';
import { invalid } from '../common/http.js';
import { DbService, type Tx } from '../db/db.service.js';
import { categories, items, locations, units } from '../db/schema.js';
import { type Loc, MovementsService } from '../stock/movements.service.js';

type Request = z.output<typeof importRequestSchema>;
type Row = z.output<typeof importRowSchema>;

const SKU_RE = /^[A-Za-z0-9._\-/]+$/;
const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

interface Plan {
  result: ImportRowResult;
  row: Row;
  existingId: string | null;
  unitId: string | null;
  categoryId: string | null;
  loc: Loc | null;
}

/**
 * Importa artículos desde filas ya leídas del CSV/Excel. Primero valida todo
 * (unidades, categorías, ubicaciones, SKU repetidos); si alguna fila tiene
 * errores no se importa nada. Las cantidades se registran como entradas.
 */
@Injectable()
export class ImportService {
  constructor(
    @Inject(DbService) private readonly dbs: DbService,
    @Inject(CategoriesService) private readonly categoriesSvc: CategoriesService,
    @Inject(MovementsService) private readonly movements: MovementsService,
  ) {}

  items(ctx: OrgContext, req: Request): Promise<ImportResult> {
    return this.dbs.tenant(ctx, async (tx) => {
      const plans = await this.plan(tx, req);
      const result = this.summary(req.dryRun, plans);
      if (req.dryRun) return result;
      if (result.errors) {
        throw invalid(
          `No se importó nada: corrija ${result.errors === 1 ? '1 fila' : `${result.errors} filas`}`,
          { code: 'IMPORT_INVALID', result },
        );
      }
      for (const p of plans) await this.apply(tx, ctx, p);
      return result;
    });
  }

  private async plan(tx: Tx, req: Request): Promise<Plan[]> {
    const unitRows = await tx.select().from(units);
    const unitMap = new Map<string, string>();
    for (const u of unitRows) {
      for (const k of [u.code, u.symbol, u.name]) unitMap.set(key(k), u.id);
    }

    const catRows = await tx
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(isNull(categories.archivedAt));
    const catMap = new Map<string, string[]>();
    for (const c of catRows) catMap.set(key(c.name), [...(catMap.get(key(c.name)) ?? []), c.id]);

    const locRows = await tx
      .select({
        id: locations.id,
        path: locations.path,
        code: locations.code,
        maxItems: locations.maxItems,
      })
      .from(locations)
      .where(isNull(locations.archivedAt));
    const locByPath = new Map<string, Loc>();
    const locByCode = new Map<string, Loc[]>();
    for (const l of locRows) {
      const loc = { id: l.id, path: l.path, maxItems: l.maxItems };
      locByPath.set(key(l.path), loc);
      locByPath.set(key(l.path.replace(/\s*\/\s*/g, '/')), loc);
      locByCode.set(key(l.code), [...(locByCode.get(key(l.code)) ?? []), loc]);
    }

    const skus = req.rows.map((r) => r.sku).filter((s): s is string => !!s);
    const existing = new Map<string, string>();
    if (skus.length) {
      const found = await tx
        .select({ id: items.id, sku: items.sku })
        .from(items)
        .where(
          and(
            isNull(items.archivedAt),
            sql`lower(${items.sku}) in (${sql.join(
              [...new Set(skus.map((s) => s.toLowerCase()))].map((s) => sql`${s}`),
              sql`, `,
            )})`,
          ),
        );
      for (const f of found) existing.set(f.sku.toLowerCase(), f.id);
    }

    const requiredAttrs = new Map<string, string[]>();
    const seen = new Map<string, number>();
    const plans: Plan[] = [];
    for (const [i, row] of req.rows.entries()) {
      const errors: string[] = [];
      const n = i + 1;
      const sku = row.sku;
      let existingId: string | null = null;
      if (!sku) errors.push('Falta el SKU');
      else if (!SKU_RE.test(sku)) errors.push('SKU: solo letras, números y . _ - /');
      else {
        const first = seen.get(sku.toLowerCase());
        if (first) errors.push(`SKU repetido en el archivo (fila ${first})`);
        else seen.set(sku.toLowerCase(), n);
        existingId = existing.get(sku.toLowerCase()) ?? null;
      }
      const creating = !existingId;

      let unitId: string | null = null;
      if (row.unit) {
        unitId = unitMap.get(key(row.unit)) ?? null;
        if (!unitId) errors.push(`Unidad «${row.unit}» no existe`);
      } else if (creating) errors.push('Falta la unidad');
      if (creating && !row.name) errors.push('Falta el nombre');

      let categoryId: string | null = null;
      if (row.category) {
        const ids = catMap.get(key(row.category)) ?? [];
        if (!ids.length) errors.push(`Categoría «${row.category}» no existe`);
        else if (ids.length > 1) errors.push(`Hay varias categorías «${row.category}»`);
        else categoryId = ids[0]!;
      }
      if (categoryId && creating) {
        let missing = requiredAttrs.get(categoryId);
        if (!missing) {
          const defs = await this.categoriesSvc.effectiveAttributes(tx, categoryId);
          missing = validateAttributeValues(defs, {}).issues.map((x) => x.message);
          requiredAttrs.set(categoryId, missing);
        }
        if (missing.length) {
          errors.push(`La categoría pide atributos obligatorios: ${missing.join('; ')}`);
        }
      }

      let loc: Loc | null = null;
      if (row.location) {
        loc = locByPath.get(key(row.location)) ?? null;
        if (!loc) {
          const byCode = locByCode.get(key(row.location)) ?? [];
          if (byCode.length === 1) loc = byCode[0]!;
          else if (byCode.length > 1) {
            errors.push(`Hay varias ubicaciones «${row.location}»; use la ruta completa`);
          } else errors.push(`Ubicación «${row.location}» no existe`);
        }
      }
      if (row.quantity && !row.location)
        errors.push('Para registrar cantidad indique la ubicación');
      if (row.quantity && Math.abs(row.quantity * 1000 - Math.round(row.quantity * 1000)) > 1e-6) {
        errors.push('Cantidad: máximo 3 decimales');
      }

      const skip = !!existingId && !req.updateExisting;
      plans.push({
        row,
        existingId,
        unitId,
        categoryId,
        loc,
        result: {
          row: n,
          sku,
          action: errors.length ? 'error' : skip ? 'skip' : existingId ? 'update' : 'create',
          errors,
          stock:
            !skip && row.quantity && loc
              ? { quantity: row.quantity, locationPath: loc.path }
              : null,
        },
      });
    }
    return plans;
  }

  private summary(dryRun: boolean, plans: Plan[]): ImportResult {
    const rows = plans.map((p) => p.result);
    const count = (a: ImportRowResult['action']) => rows.filter((r) => r.action === a).length;
    return {
      dryRun,
      created: count('create'),
      updated: count('update'),
      skipped: count('skip'),
      errors: count('error'),
      stockEntries: rows.filter((r) => r.action !== 'error' && r.stock).length,
      rows,
    };
  }

  private async apply(tx: Tx, ctx: OrgContext, p: Plan): Promise<void> {
    const { row, result } = p;
    if (result.action === 'skip' || result.action === 'error') return;
    const money = (v: number | null) => (v == null ? null : String(v));
    let itemId = p.existingId;
    if (result.action === 'create') {
      const [created] = await tx
        .insert(items)
        .values({
          organizationId: ctx.organizationId,
          sku: row.sku!,
          name: row.name!,
          unitId: p.unitId!,
          categoryId: p.categoryId,
          internalCode: row.internalCode,
          manufacturer: row.manufacturer,
          model: row.model,
          description: row.description,
          cost: money(row.cost),
          price: money(row.price),
          minStock: money(row.minStock),
          qrCode: generateShortCode(),
        })
        .returning({ id: items.id });
      itemId = created!.id;
    } else {
      // Solo se cambian las columnas que trae el archivo.
      const set: Partial<typeof items.$inferInsert> = {};
      if (row.name) set.name = row.name;
      if (p.unitId) set.unitId = p.unitId;
      if (p.categoryId) set.categoryId = p.categoryId;
      if (row.internalCode) set.internalCode = row.internalCode;
      if (row.manufacturer) set.manufacturer = row.manufacturer;
      if (row.model) set.model = row.model;
      if (row.description) set.description = row.description;
      if (row.cost != null) set.cost = money(row.cost);
      if (row.price != null) set.price = money(row.price);
      if (row.minStock != null) set.minStock = money(row.minStock);
      await tx
        .update(items)
        .set({ ...set, version: sql`${items.version} + 1`, updatedAt: new Date() })
        .where(eq(items.id, itemId!));
    }
    if (result.stock && p.loc) {
      const quantity = toScaled(result.stock.quantity);
      await this.movements.applyInTx(tx, ctx, {
        kind: 'receipt',
        itemId: itemId!,
        loc: p.loc,
        delta: () => quantity,
        reason: 'Importación',
        transferId: null,
      });
    }
  }
}
