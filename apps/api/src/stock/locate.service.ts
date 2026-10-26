import { Inject, Injectable } from '@nestjs/common';
import type { LocateHit, LocatePlace, LocateResult, locateQuerySchema } from '@silopro/contracts';
import { matchesSearch, searchTerms } from '@silopro/domain';
import { sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { OrgContext } from '../auth/request-context.js';
import { DbService } from '../db/db.service.js';
import { num0 } from '../db/mappers.js';

/**
 * Texto de búsqueda del artículo en SQL, compactado igual que
 * `compactSearchText` de `@silopro/domain`: minúsculas, sin acentos y solo
 * letras y dígitos.
 */
const HAYSTACK = sql.raw(`regexp_replace(
  translate(
    lower(concat_ws(' ', i.sku, i.name, i.internal_code, i.manufacturer, i.model,
      array_to_string(i.aliases, ' '))),
    'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc'),
  '[^a-z0-9]+', '', 'g')`);

/** «¿Dónde está?»: artículos que coinciden y en qué cajones hay existencias. */
@Injectable()
export class LocateService {
  constructor(@Inject(DbService) private readonly dbs: DbService) {}

  async locate(ctx: OrgContext, q: z.output<typeof locateQuerySchema>): Promise<LocateResult> {
    const terms = searchTerms(q.q);
    if (!terms.length) return { query: q.q, hits: [] };
    // Los términos ya son solo [a-z0-9]: no hay comodines que escapar.
    const where = sql.join(
      terms.map((t) => sql`${HAYSTACK} like ${`%${t}%`}`),
      sql` and `,
    );
    const whole = terms.join('');
    return this.dbs.tenant(ctx, async (tx) => {
      const found = await tx.execute<{
        id: string;
        sku: string;
        name: string;
        manufacturer: string | null;
        model: string | null;
        aliases: string[];
        symbol: string;
        on_hand: string | null;
      }>(sql`
        select i.id, i.sku, i.name, i.manufacturer, i.model, i.aliases, u.symbol,
          (select sum(s.on_hand) from stock_levels s where s.item_id = i.id) as on_hand
        from items i
        join units u on u.id = i.unit_id
        where i.archived_at is null and ${where}
        order by
          (regexp_replace(lower(i.sku), '[^a-z0-9]+', '', 'g') = ${whole}) desc,
          (coalesce((select sum(s.on_hand) from stock_levels s where s.item_id = i.id), 0) > 0) desc,
          i.name, i.id
        limit ${q.limit}`);
      const ids = found.rows.map((r) => r.id);
      const places = new Map<string, LocatePlace[]>();
      if (ids.length) {
        const res = await tx.execute<{
          item_id: string;
          location_id: string;
          path: string;
          code: string;
          on_hand: string;
          cabinet_id: string | null;
          cabinet_code: string | null;
          shelf_id: string | null;
        }>(sql`
          select sl.item_id, d.id as location_id, d.path, d.code, sl.on_hand,
            c.id as cabinet_id, cab.code as cabinet_code,
            case when c.id is not null then cab.parent_id end as shelf_id
          from stock_levels sl
          join locations d on d.id = sl.location_id and d.archived_at is null
          left join locations cab on cab.id = d.parent_id and cab.kind = 'cabinet'
            and cab.archived_at is null
          left join cabinets c on c.location_id = cab.id
          where sl.item_id in (${sql.join(
            ids.map((id) => sql`${id}::uuid`),
            sql`, `,
          )}) and sl.on_hand > 0
          order by sl.on_hand desc, d.path`);
        for (const r of res.rows) {
          const list = places.get(r.item_id) ?? [];
          list.push({
            locationId: r.location_id,
            path: r.path,
            code: r.code,
            onHand: num0(r.on_hand),
            cabinetId: r.cabinet_id,
            cabinetCode: r.cabinet_code,
            shelfId: r.shelf_id,
          });
          places.set(r.item_id, list);
        }
      }
      const hits = found.rows.map((r): LocateHit => {
        const direct = [r.sku, r.name, r.manufacturer, r.model].filter(Boolean).join(' ');
        return {
          itemId: r.id,
          sku: r.sku,
          name: r.name,
          manufacturer: r.manufacturer,
          model: r.model,
          unitSymbol: r.symbol,
          matchedAlias: matchesSearch(direct, terms)
            ? null
            : (r.aliases.find((a) => terms.some((t) => matchesSearch(a, [t]))) ?? null),
          onHand: num0(r.on_hand),
          places: places.get(r.id) ?? [],
        };
      });
      return { query: q.q, hits };
    });
  }
}
