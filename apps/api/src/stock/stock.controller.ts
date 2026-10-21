import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { locationInputSchema, movementInputSchema } from '@silopro/contracts';
import type { z } from 'zod';
import { Org, OrgGuard, RequirePermission, SessionGuard } from '../auth/guards.js';
import type { OrgContext } from '../auth/request-context.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { LocationsService } from './locations.service.js';
import { MovementsService } from './movements.service.js';

const uuid = new ParseUUIDPipe({ version: '7' });

@Controller('orgs/:orgId')
@UseGuards(SessionGuard, OrgGuard)
@RequirePermission('catalog.read')
export class StockController {
  constructor(
    @Inject(LocationsService) private readonly locationsSvc: LocationsService,
    @Inject(MovementsService) private readonly movementsSvc: MovementsService,
  ) {}

  @Get('locations')
  listLocations(@Org() ctx: OrgContext) {
    return this.locationsSvc.list(ctx);
  }

  @Post('locations')
  @RequirePermission('catalog.write')
  createLocation(
    @Org() ctx: OrgContext,
    @Body(new ZodValidationPipe(locationInputSchema)) body: z.output<typeof locationInputSchema>,
  ) {
    return this.locationsSvc.create(ctx, body);
  }

  @Post('movements')
  @RequirePermission('stock.move')
  recordMovement(
    @Org() ctx: OrgContext,
    @Body(new ZodValidationPipe(movementInputSchema)) body: z.output<typeof movementInputSchema>,
  ) {
    return this.movementsSvc.record(ctx, body);
  }

  @Get('items/:id/movements')
  itemMovements(@Org() ctx: OrgContext, @Param('id', uuid) id: string) {
    return this.movementsSvc.history(ctx, id);
  }

  @Get('items/:id/stock')
  itemStock(@Org() ctx: OrgContext, @Param('id', uuid) id: string) {
    return this.movementsSvc.byLocation(ctx, id);
  }
}
