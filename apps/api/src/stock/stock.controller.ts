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
  UseGuards,
} from '@nestjs/common';
import {
  locationInputSchema,
  locationUpdateSchema,
  movementInputSchema,
  qrReferenceSchema,
  transferInputSchema,
} from '@silopro/contracts';
import type { z } from 'zod';
import { Org, OrgGuard, RequirePermission, SessionGuard } from '../auth/guards.js';
import type { OrgContext } from '../auth/request-context.js';
import { invalid, notFound } from '../common/http.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { LocationsService } from './locations.service.js';
import { MovementsService } from './movements.service.js';
import { QrService } from './qr.service.js';

const uuid = new ParseUUIDPipe({ version: '7' });

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
