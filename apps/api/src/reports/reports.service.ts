import { Inject, Injectable } from '@nestjs/common';
import type {
  MovementReport,
  movementReportQuerySchema,
  StaleReport,
  ValuationCategory,
  ValuationReport,
} from '@silopro/contracts';
import { fromScaled, toScaled } from '@silopro/domain';
import { sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { OrgContext } from '../auth/request-context.js';
import { DbService } from '../db/db.service.js';
import { iso, num, num0 } from '../db/mappers.js';

type MovementQuery = z.output<typeof movementReportQuerySchema>;

const cents = (v: number | null) => (v == null ? 0 : Math.round(v * 100));

/** Existencia total por artículo en ubicaciones vigentes (ver `valuation` y `stale`). */
const stockByItem = sql`
  select i.id as item_id, i.sku, i.name, u.symbol, i.cost, c.name as category_name,
    sum(s.on_hand) as on_hand, sum(s.reserved) as reserved,
    case when i.cost is null then null else round(sum(s.on_hand) * i.cost, 2) end as value
  from items i
  join units u on u.id = i.unit_id
  left join categories c on c.id = i.category_id
  join stock_levels s on s.item_id = i.id
  join locations l on l.id = s.location_id and l.archived_at is null
  where i.archived_at is null
  group by i.id, u.symbol, c.name
  having sum(s.on_hand) <> 0`;

type StockRow = {
  item_id: string;
  sku: string;
  name: string;
  symbol: string;
  cost: string | null;
  category_name: string | null;
  on_hand: string;
  reserved: string;
  value: string | null;
};

/** Reportes operativos: se calculan al consultar sobre existencias y movimientos. */
@Injectable()
export class ReportsService {
  constructor(@Inject(DbService) private readonly dbs: DbService) {}

  valuation(ctx: OrgContext): Promise<ValuationReport> {
    return this.dbs.tenant(ctx, async (tx) => {
      const res = await tx.execute<StockRow>(sql`
        select * from (${stockByItem}) t
        order by t.value desc nulls last, t.sku`);
      const rows = res.rows.map((r) => ({
        itemId: r.item_id,
        sku: r.sku,
        itemName: r.name,
        categoryName: r.category_name,
        unitSymbol: r.symbol,
        onHand: num0(r.on_hand),
        reserved: num0(r.reserved),
        unitCost: num(r.cost),
        value: num(r.value),
      }));
      const groups = new Map<string | null, ValuationCategory>();
      let total = 0;
      let missingCost = 0;
      for (const r of rows) {
        const g = groups.get(r.categoryName) ?? {
          categoryName: r.categoryName,
          itemCount: 0,
          value: 0,
          missingCost: 0,
        };
        g.itemCount++;
        g.value += cents(r.value);
        if (r.value == null) {
          g.missingCost++;
          missingCost++;
        }
        total += cents(r.value);
        groups.set(r.categoryName, g);
      }
      const byCategory = [...groups.values()]
        .map((g) => ({ ...g, value: g.value / 100 }))
        .sort(
          (a, b) =>
            b.value - a.value || (a.categoryName ?? '￿').localeCompare(b.categoryName ?? '￿', 'es'),
        );
      return { rows, byCategory, totalValue: total / 100, missingCost };
    });
  }

  movements(ctx: OrgContext, q: MovementQuery): Promise<MovementReport> {
    return this.dbs.tenant(ctx, async (tx) => {
      const res = await tx.execute<{
        item_id: string;
        sku: string;
        name: string;
        symbol: string;
        received: string;
        issued: string;
        adjusted: string;
        transferred: string;
        net: string;
        movements: number;
        last_at: Date | string;
      }>(sql`
        select i.id as item_id, i.sku, i.name, u.symbol,
          coalesce(sum(m.delta) filter (where m.kind = 'receipt'), 0) as received,
          coalesce(-sum(m.delta) filter (where m.kind in ('issue', 'consumption')), 0) as issued,
          coalesce(sum(m.delta) filter (where m.kind = 'adjustment'), 0) as adjusted,
          coalesce(sum(m.delta) filter (where m.kind = 'transfer' and m.delta > 0), 0)
            as transferred,
          coalesce(sum(m.delta) filter (where m.kind <> 'transfer'), 0) as net,
          (count(*) filter (where not (m.kind = 'transfer' and m.delta < 0)))::int as movements,
          max(m.occurred_at) as last_at
        from stock_movements m
        join items i on i.id = m.item_id
        join units u on u.id = i.unit_id
        where m.occurred_at >= (${q.from}::date)::timestamp at time zone ${q.tz}
          and m.occurred_at < (${q.to}::date + 1)::timestamp at time zone ${q.tz}
        group by i.id, u.symbol
        order by i.sku`);
      const totals = { received: 0, issued: 0, adjusted: 0, movements: 0 };
      const rows = res.rows.map((r) => {
        const row = {
          itemId: r.item_id,
          sku: r.sku,
          itemName: r.name,
          unitSymbol: r.symbol,
          received: num0(r.received),
          issued: num0(r.issued),
          adjusted: num0(r.adjusted),
          transferred: num0(r.transferred),
          net: num0(r.net),
          movements: r.movements,
          lastAt: iso(r.last_at),
        };
        totals.received += toScaled(row.received);
        totals.issued += toScaled(row.issued);
        totals.adjusted += toScaled(row.adjusted);
        totals.movements += row.movements;
        return row;
      });
      return {
        from: q.from,
        to: q.to,
        rows,
        totals: {
          received: fromScaled(totals.received),
          issued: fromScaled(totals.issued),
          adjusted: fromScaled(totals.adjusted),
          movements: totals.movements,
        },
      };
    });
  }

  stale(ctx: OrgContext, days: number): Promise<StaleReport> {
    return this.dbs.tenant(ctx, async (tx) => {
      const res = await tx.execute<StockRow & { last_at: Date | string | null }>(sql`
        select t.*, lm.last_at from (${stockByItem}) t
        left join lateral (
          select max(m.occurred_at) as last_at from stock_movements m where m.item_id = t.item_id
        ) lm on true
        where t.on_hand > 0
          and coalesce(lm.last_at, '-infinity') < now() - make_interval(days => ${days}::int)
        order by lm.last_at nulls first, t.sku`);
      let total = 0;
      const rows = res.rows.map((r) => {
        total += cents(num(r.value));
        return {
          itemId: r.item_id,
          sku: r.sku,
          itemName: r.name,
          unitSymbol: r.symbol,
          onHand: num0(r.on_hand),
          value: num(r.value),
          lastMovementAt: r.last_at == null ? null : iso(r.last_at),
        };
      });
      return { days, rows, totalValue: total / 100 };
    });
  }
}
