import { Inject, Injectable } from '@nestjs/common';
import type { AlertSummary, ShoppingLine, ShoppingList } from '@silopro/contracts';
import { fromScaled, isLowStock, purchaseNeed, toScaled } from '@silopro/domain';
import { sql } from 'drizzle-orm';
import type { OrgContext } from '../auth/request-context.js';
import { DbService, type Tx } from '../db/db.service.js';
import { num, num0 } from '../db/mappers.js';

type Row = {
  item_id: string;
  sku: string;
  name: string;
  symbol: string;
  decimals: number;
  min_stock: string | null;
  cost: string | null;
  available: string;
  supplier_id: string | null;
  supplier_name: string | null;
  /** Pendiente por proyecto abierto: [{ code, pending }]. */
  projects: { code: string; pending: string }[] | null;
};

/**
 * Lista de compras: lo que falta para los proyectos abiertos más lo necesario
 * para que cada artículo quede en su mínimo. Se calcula al consultar.
 */
@Injectable()
export class ShoppingService {
  constructor(@Inject(DbService) private readonly dbs: DbService) {}

  list(ctx: OrgContext): Promise<ShoppingList> {
    return this.dbs.tenant(ctx, async (tx) => {
      const lines = (await this.rows(tx))
        .map((r) => this.line(r))
        .filter((l) => l.toBuy > 0)
        .sort(
          (a, b) =>
            (a.supplierName ?? '\uFFFF').localeCompare(b.supplierName ?? '\uFFFF', 'es') ||
            a.sku.localeCompare(b.sku, 'es'),
        );
      let total = 0;
      let missingCost = 0;
      for (const l of lines) {
        if (l.unitCost == null) missingCost++;
        else total += toScaled(l.toBuy) * l.unitCost;
      }
      return {
        lines,
        estimatedTotal: Math.round(fromScaled(total) * 100) / 100,
        missingCost,
      };
    });
  }

  summary(ctx: OrgContext): Promise<AlertSummary> {
    return this.dbs.tenant(ctx, async (tx) => {
      const rows = await this.rows(tx);
      let lowStock = 0;
      let toBuy = 0;
      for (const r of rows) {
        if (isLowStock(num0(r.available), num(r.min_stock))) lowStock++;
        if (this.line(r).toBuy > 0) toBuy++;
      }
      const short = await tx.execute<{ n: number }>(sql`
        select count(distinct p.id)::int as n
        from projects p
        join bom_lines bl on bl.project_id = p.id
        where p.status in ('draft', 'active')
          and bl.quantity
            - coalesce((select sum(r.consumed) + sum(case when r.status = 'active'
                then r.quantity - r.consumed else 0 end)
              from reservations r
              where r.project_id = p.id and r.item_id = bl.item_id), 0)
            > coalesce((select sum(s.on_hand - s.reserved) from stock_levels s
              join locations l on l.id = s.location_id
              where s.item_id = bl.item_id and l.archived_at is null
                and s.on_hand > s.reserved), 0)`);
      return { lowStock, toBuy, projectsShort: short.rows[0]?.n ?? 0 };
    });
  }

  private line(r: Row): ShoppingLine {
    const available = toScaled(num0(r.available));
    const min = num(r.min_stock);
    const projects = (r.projects ?? [])
      .map((p) => ({ code: p.code, pending: toScaled(num0(p.pending)) }))
      .filter((p) => p.pending > 0);
    const projectPending = projects.reduce((a, p) => a + p.pending, 0);
    const toBuy = purchaseNeed({
      available,
      minStock: min == null ? null : toScaled(min),
      projectPending,
      wholeUnits: r.decimals === 0,
    });
    const reasons: ShoppingLine['reasons'] = projects.map((p) => ({
      kind: 'project' as const,
      projectCode: p.code,
      quantity: fromScaled(p.pending),
    }));
    if (min != null && min > 0 && available - projectPending < toScaled(min)) {
      reasons.push({
        kind: 'low_stock',
        quantity: min,
      });
    }
    return {
      itemId: r.item_id,
      sku: r.sku,
      itemName: r.name,
      unitSymbol: r.symbol,
      available: fromScaled(available),
      minStock: min,
      projectPending: fromScaled(projectPending),
      toBuy: fromScaled(toBuy),
      unitCost: num(r.cost),
      supplierId: r.supplier_id,
      supplierName: r.supplier_name,
      reasons,
    };
  }

  /** Artículos con mínimo o con pendientes en proyectos abiertos. */
  private async rows(tx: Tx): Promise<Row[]> {
    const res = await tx.execute<Row>(sql`
      with pending as (
        select bl.item_id,
          json_agg(json_build_object('code', p.code, 'pending', greatest(bl.quantity
            - coalesce((select sum(r.consumed) + sum(case when r.status = 'active'
                then r.quantity - r.consumed else 0 end)
              from reservations r
              where r.project_id = p.id and r.item_id = bl.item_id), 0), 0))
            order by p.code) as projects
        from bom_lines bl
        join projects p on p.id = bl.project_id and p.status in ('draft', 'active')
        group by bl.item_id
      )
      select i.id as item_id, i.sku, i.name, u.symbol, u.decimals, i.min_stock, i.cost,
        coalesce((select sum(s.on_hand - s.reserved) from stock_levels s
          join locations l on l.id = s.location_id
          where s.item_id = i.id and l.archived_at is null), 0) as available,
        sup.id as supplier_id, sup.name as supplier_name, pd.projects
      from items i
      join units u on u.id = i.unit_id
      left join pending pd on pd.item_id = i.id
      left join lateral (
        select s.id, s.name from item_suppliers isup
        join suppliers s on s.id = isup.supplier_id and s.archived_at is null
        where isup.item_id = i.id order by s.name limit 1
      ) sup on true
      where i.archived_at is null and (pd.item_id is not null or i.min_stock > 0)`);
    return res.rows;
  }
}
