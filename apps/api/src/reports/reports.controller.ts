import { Controller, Get, Inject, Query, Res, UseGuards } from '@nestjs/common';
import { movementReportQuerySchema, staleReportQuerySchema } from '@silopro/contracts';
import type { Response } from 'express';
import type { z } from 'zod';
import { Org, OrgGuard, RequirePermission, SessionGuard } from '../auth/guards.js';
import type { OrgContext } from '../auth/request-context.js';
import { csvTable } from '../common/csv.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ReportsService } from './reports.service.js';

const sendCsv = (res: Response, name: string, csv: string) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(csv);
};

@Controller('orgs/:orgId/reports')
@UseGuards(SessionGuard, OrgGuard)
@RequirePermission('catalog.read')
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly svc: ReportsService) {}

  @Get('valuation')
  valuation(@Org() ctx: OrgContext) {
    return this.svc.valuation(ctx);
  }

  @Get('valuation/export')
  async valuationCsv(@Org() ctx: OrgContext, @Res() res: Response) {
    const { rows } = await this.svc.valuation(ctx);
    sendCsv(
      res,
      'valor-del-inventario.csv',
      csvTable(
        [
          'SKU',
          'Artículo',
          'Categoría',
          'Existencia',
          'Unidad',
          'Apartado',
          'Costo unitario',
          'Valor',
        ],
        rows.map((r) => [
          r.sku,
          r.itemName,
          r.categoryName,
          r.onHand,
          r.unitSymbol,
          r.reserved,
          r.unitCost,
          r.value,
        ]),
      ),
    );
  }

  @Get('movements')
  movements(
    @Org() ctx: OrgContext,
    @Query(new ZodValidationPipe(movementReportQuerySchema))
    q: z.output<typeof movementReportQuerySchema>,
  ) {
    return this.svc.movements(ctx, q);
  }

  @Get('movements/export')
  async movementsCsv(
    @Org() ctx: OrgContext,
    @Query(new ZodValidationPipe(movementReportQuerySchema))
    q: z.output<typeof movementReportQuerySchema>,
    @Res() res: Response,
  ) {
    const { rows } = await this.svc.movements(ctx, q);
    sendCsv(
      res,
      `movimientos-${q.from}-a-${q.to}.csv`,
      csvTable(
        [
          'SKU',
          'Artículo',
          'Unidad',
          'Entradas',
          'Salidas',
          'Ajustes',
          'Neto',
          'Transferido',
          'Movimientos',
          'Último',
        ],
        rows.map((r) => [
          r.sku,
          r.itemName,
          r.unitSymbol,
          r.received,
          r.issued,
          r.adjusted,
          r.net,
          r.transferred,
          r.movements,
          r.lastAt,
        ]),
      ),
    );
  }

  @Get('stale')
  stale(
    @Org() ctx: OrgContext,
    @Query(new ZodValidationPipe(staleReportQuerySchema))
    q: z.output<typeof staleReportQuerySchema>,
  ) {
    return this.svc.stale(ctx, q.days);
  }

  @Get('stale/export')
  async staleCsv(
    @Org() ctx: OrgContext,
    @Query(new ZodValidationPipe(staleReportQuerySchema))
    q: z.output<typeof staleReportQuerySchema>,
    @Res() res: Response,
  ) {
    const { rows } = await this.svc.stale(ctx, q.days);
    sendCsv(
      res,
      `sin-movimiento-${q.days}-dias.csv`,
      csvTable(
        ['SKU', 'Artículo', 'Existencia', 'Unidad', 'Valor', 'Último movimiento'],
        rows.map((r) => [r.sku, r.itemName, r.onHand, r.unitSymbol, r.value, r.lastMovementAt]),
      ),
    );
  }
}
