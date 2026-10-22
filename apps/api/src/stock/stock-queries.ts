import type { LocationStockEntry } from '@silopro/contracts';
import { isLowStock } from '@silopro/domain';
import { type SQL, sql } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';
import { num, num0 } from '../db/mappers.js';

/**
 * Artículos con existencias en las ubicaciones que cumplan `where` (sobre el
 * alias `d` de locations), con el aviso de stock bajo del artículo.
 */
export async function locationStock(tx: Tx, where: SQL): Promise<LocationStockEntry[]> {
  const res = await tx.execute<{
    location_id: string;
    item_id: string;
    sku: string;
    name: string;
    on_hand: string;
    symbol: string;
    min_stock: string | null;
    available: string;
  }>(sql`
    select sl.location_id, i.id as item_id, i.sku, i.name, sl.on_hand, u.symbol, i.min_stock,
      (select coalesce(sum(s2.on_hand - s2.reserved), 0) from stock_levels s2
        where s2.item_id = i.id) as available
    from stock_levels sl
    join locations d on d.id = sl.location_id
    join items i on i.id = sl.item_id
    join units u on u.id = i.unit_id
    where ${where} and d.archived_at is null
      and i.archived_at is null and sl.on_hand <> 0
    order by d.code, i.name`);
  return res.rows.map((r) => ({
    locationId: r.location_id,
    itemId: r.item_id,
    sku: r.sku,
    itemName: r.name,
    onHand: num0(r.on_hand),
    unitSymbol: r.symbol,
    lowStock: isLowStock(num0(r.available), num(r.min_stock)),
  }));
}
