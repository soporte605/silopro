import { Controller, Get, Inject, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { Org, OrgGuard, RequirePermission, SessionGuard } from '../auth/guards.js';
import type { OrgContext } from '../auth/request-context.js';
import { csvTable } from '../common/csv.js';
import { ShoppingService } from './shopping.service.js';

@Controller('orgs/:orgId')
@UseGuards(SessionGuard, OrgGuard)
@RequirePermission('catalog.read')
export class ShoppingController {
  constructor(@Inject(ShoppingService) private readonly svc: ShoppingService) {}

  @Get('shopping-list')
  list(@Org() ctx: OrgContext) {
    return this.svc.list(ctx);
  }

  /** La lista en CSV para Excel o para enviarla al proveedor. */
  @Get('shopping-list/export')
  async export(@Org() ctx: OrgContext, @Res() res: Response) {
    const { lines } = await this.svc.list(ctx);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="lista-de-compras.csv"');
    res.send(
      csvTable(
        [
          'Proveedor',
          'SKU',
          'Artículo',
          'Comprar',
          'Unidad',
          'Disponible',
          'Mínimo',
          'Para proyectos',
          'Costo unitario',
          'Motivo',
        ],
        lines.map((l) => [
          l.supplierName,
          l.sku,
          l.itemName,
          l.toBuy,
          l.unitSymbol,
          l.available,
          l.minStock,
          l.projectPending,
          l.unitCost,
          l.reasons
            .map((r) => (r.kind === 'project' ? `Proyecto ${r.projectCode}` : 'Stock mínimo'))
            .join(' · '),
        ]),
      ),
    );
  }

  @Get('alerts')
  alerts(@Org() ctx: OrgContext) {
    return this.svc.summary(ctx);
  }
}
