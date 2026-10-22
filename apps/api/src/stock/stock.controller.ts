import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  type JournalMovement,
  locationInputSchema,
  locationUpdateSchema,
  movementInputSchema,
  movementQuerySchema,
  qrReferenceSchema,
  transferInputSchema,
} from '@silopro/contracts';
import type { Response } from 'express';
import type { z } from 'zod';
import { Org, OrgGuard, RequirePermission, SessionGuard } from '../auth/guards.js';
import type { OrgContext } from '../auth/request-context.js';
import { invalid, notFound } from '../common/http.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { LocationsService } from './locations.service.js';
import { MovementsService } from './movements.service.js';
import { QrService } from './qr.service.js';

const uuid = new ParseUUIDPipe({ version: '7' });

const KIND_LABELS: Record<string, string> = {
  receipt: 'Entrada',
  issue: 'Salida',
  adjustment: 'Ajuste',
  transfer: 'Transferencia',
  consumption: 'Consumo',
};

/** Campo CSV con comillas cuando hace falta; neutraliza fórmulas (=, +, -, @). */
const csvField = (v: string | number | null): string => {
  let s = v === null ? '' : String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function movementsCsv(rows: JournalMovement[]): string {
  const head = [
    'Fecha',
    'Tipo',
    'SKU',
    'Artículo',
    'Ubicación',
    'Cantidad',
    'Unidad',
    'Motivo',
    'Quién',
  ];
  const lines = rows.map((m) =>
    [
      m.occurredAt,
      KIND_LABELS[m.kind] ?? m.kind,
      m.sku,
      m.itemName,
      m.locationPath,
      m.delta,
      m.unitSymbol,
      m.reason,
      m.actorName,
    ]
      .map(csvField)
      .join(','),
  );
  return [head.join(','), ...lines].join('\r\n') + '\r\n';
}

@Controller('orgs/:orgId')
@UseGuards(SessionGuard, OrgGuard)
@RequirePermission('catalog.read')
export class StockController {
  constructor(
    @Inject(LocationsService) private readonly locationsSvc: LocationsService,
    @Inject(MovementsService) private readonly movementsSvc: MovementsService,
    @Inject(QrService) private readonly qrSvc: QrService,
  ) {}

  @Get('locations')
  listLocations(@Org() ctx: OrgContext) {
    return this.locationsSvc.list(ctx);
  }

  @Get('locations/:id')
  locationDetail(@Org() ctx: OrgContext, @Param('id', uuid) id: string) {
    return this.locationsSvc.detail(ctx, id);
  }

  @Post('locations')
  @RequirePermission('catalog.write')
  createLocation(
    @Org() ctx: OrgContext,
    @Body(new ZodValidationPipe(locationInputSchema)) body: z.output<typeof locationInputSchema>,
  ) {
    return this.locationsSvc.create(ctx, body);
  }

  @Patch('locations/:id')
  @RequirePermission('catalog.write')
  updateLocation(
    @Org() ctx: OrgContext,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(locationUpdateSchema)) body: z.output<typeof locationUpdateSchema>,
  ) {
    return this.locationsSvc.update(ctx, id, body);
  }

  @Delete('locations/:id')
  @HttpCode(204)
  @RequirePermission('catalog.write')
  async archiveLocation(@Org() ctx: OrgContext, @Param('id', uuid) id: string) {
    await this.locationsSvc.archive(ctx, id);
  }

  @Post('movements')
  @RequirePermission('stock.move')
  recordMovement(
    @Org() ctx: OrgContext,
    @Body(new ZodValidationPipe(movementInputSchema)) body: z.output<typeof movementInputSchema>,
  ) {
    return this.movementsSvc.record(ctx, body);
  }

  /** Diario de movimientos de la organización con filtros. */
  @Get('movements')
  journal(
    @Org() ctx: OrgContext,
    @Query(new ZodValidationPipe(movementQuerySchema)) q: z.output<typeof movementQuerySchema>,
  ) {
    return this.movementsSvc.journal(ctx, q);
  }

  /** El mismo diario en CSV (hasta 10 000 filas) para abrirlo en Excel. */
  @Get('movements/export')
  async exportJournal(
    @Org() ctx: OrgContext,
    @Query(new ZodValidationPipe(movementQuerySchema.omit({ limit: true, before: true })))
    q: z.output<typeof movementQuerySchema>,
    @Res() res: Response,
  ) {
    const rows = [];
    let before: string | undefined;
    do {
      const page = await this.movementsSvc.journal(ctx, { ...q, before, limit: 200 });
      rows.push(...page.movements);
      before = page.nextCursor ?? undefined;
    } while (before && rows.length < 10_000);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="movimientos.csv"');
    // BOM para que Excel reconozca UTF-8 (acentos).
    res.send('\uFEFF' + movementsCsv(rows));
  }

  @Get('transfers')
  transfers(@Org() ctx: OrgContext, @Query('itemId') itemId?: string) {
    if (itemId !== undefined && !/^[0-9a-f-]{36}$/i.test(itemId)) {
      throw invalid('itemId inválido');
    }
    return this.movementsSvc.transfers(ctx, itemId);
  }

  @Post('transfers')
  @RequirePermission('stock.move')
  transfer(
    @Org() ctx: OrgContext,
    @Body(new ZodValidationPipe(transferInputSchema)) body: z.output<typeof transferInputSchema>,
  ) {
    return this.movementsSvc.transfer(ctx, body);
  }

  @Get('items/:id/movements')
  itemMovements(@Org() ctx: OrgContext, @Param('id', uuid) id: string) {
    return this.movementsSvc.history(ctx, id);
  }

  @Get('items/:id/stock')
  itemStock(@Org() ctx: OrgContext, @Param('id', uuid) id: string) {
    return this.movementsSvc.byLocation(ctx, id);
  }

  /** Resuelve una etiqueta escaneada: `type` es `item` o `location`. */
  @Get('qr/:type/:code')
  resolveQr(@Org() ctx: OrgContext, @Param('type') type: string, @Param('code') code: string) {
    const ref = qrReferenceSchema.safeParse({ type, code: code.toUpperCase() });
    if (!ref.success) throw notFound('Código');
    return this.qrSvc.resolve(ctx, ref.data);
  }
}
