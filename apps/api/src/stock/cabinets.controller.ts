import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  cabinetInputSchema,
  cabinetLayoutUpdateSchema,
  compartmentIdSchema,
  compartmentUpdateSchema,
} from '@silopro/contracts';
import type { z } from 'zod';
import { Org, OrgGuard, RequirePermission, SessionGuard } from '../auth/guards.js';
import type { OrgContext } from '../auth/request-context.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CabinetsService } from './cabinets.service.js';

const uuid = new ParseUUIDPipe({ version: '7' });

@Controller('orgs/:orgId/cabinets')
@UseGuards(SessionGuard, OrgGuard)
@RequirePermission('catalog.read')
export class CabinetsController {
  constructor(@Inject(CabinetsService) private readonly svc: CabinetsService) {}

  @Get()
  list(@Org() ctx: OrgContext) {
    return this.svc.list(ctx);
  }

  @Post()
  @RequirePermission('catalog.write')
  create(
    @Org() ctx: OrgContext,
    @Body(new ZodValidationPipe(cabinetInputSchema)) body: z.output<typeof cabinetInputSchema>,
  ) {
    return this.svc.create(ctx, body);
  }

  @Get(':id')
  get(@Org() ctx: OrgContext, @Param('id', uuid) id: string) {
    return this.svc.get(ctx, id);
  }

  @Get(':id/stock')
  stock(@Org() ctx: OrgContext, @Param('id', uuid) id: string) {
    return this.svc.stock(ctx, id);
  }

  @Put(':id/layout')
  @RequirePermission('catalog.write')
  updateLayout(
    @Org() ctx: OrgContext,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(cabinetLayoutUpdateSchema))
    body: z.output<typeof cabinetLayoutUpdateSchema>,
  ) {
    return this.svc.updateLayout(ctx, id, body);
  }

  @Patch(':id/compartments/:compartmentId')
  @RequirePermission('catalog.write')
  updateCompartment(
    @Org() ctx: OrgContext,
    @Param('id', uuid) id: string,
    @Param('compartmentId', new ZodValidationPipe(compartmentIdSchema)) compartment: string,
    @Body(new ZodValidationPipe(compartmentUpdateSchema))
    body: z.output<typeof compartmentUpdateSchema>,
  ) {
    return this.svc.updateCompartment(ctx, id, compartment, body);
  }
}
