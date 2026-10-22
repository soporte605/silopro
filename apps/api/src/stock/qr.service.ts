import { Inject, Injectable } from '@nestjs/common';
import { isCabinetCell, type QrReference, type QrTarget } from '@silopro/contracts';
import { and, eq, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { OrgContext } from '../auth/request-context.js';
import { notFound } from '../common/http.js';
import { DbService } from '../db/db.service.js';
import { cabinets, items, locations } from '../db/schema.js';

/**
 * Resuelve el código corto de una etiqueta. Con RLS, un código de otra
 * organización simplemente no existe para quien escanea (404).
 */
@Injectable()
export class QrService {
  constructor(@Inject(DbService) private readonly dbs: DbService) {}

  resolve(ctx: OrgContext, ref: QrReference): Promise<QrTarget> {
    return this.dbs.tenant(ctx, async (tx) => {
      if (ref.type === 'item') {
        const [item] = await tx
          .select({ id: items.id, name: items.name, sku: items.sku })
          .from(items)
          .where(and(eq(items.qrCode, ref.code), isNull(items.archivedAt)));
        if (!item) throw notFound('Código');
        return {
          type: 'item',
          id: item.id,
          name: item.name,
          label: item.sku,
          cabinetId: null,
          locationKind: null,
        };
      }
      const own = alias(cabinets, 'own');
      const parent = alias(cabinets, 'parent');
      const [loc] = await tx
        .select({
          id: locations.id,
          name: locations.name,
          path: locations.path,
          kind: locations.kind,
          ownCabinet: own.id,
          parentCabinet: parent.id,
          parentStyle: parent.style,
        })
        .from(locations)
        .leftJoin(own, eq(own.locationId, locations.id))
        .leftJoin(parent, eq(parent.locationId, locations.parentId))
        .where(and(eq(locations.qrCode, ref.code), isNull(locations.archivedAt)));
      if (!loc) throw notFound('Código');
      return {
        type: 'location',
        id: loc.id,
        name: loc.name,
        label: loc.path,
        cabinetId:
          loc.ownCabinet ??
          (loc.parentStyle && isCabinetCell({ style: loc.parentStyle }, loc.kind)
            ? loc.parentCabinet
            : null),
        locationKind: loc.kind,
      };
    });
  }
}
