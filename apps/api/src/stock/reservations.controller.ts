import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  RESERVATION_STATUS_VALUES,
  reservationConsumeSchema,
  reservationInputSchema,
  type ReservationStatus,
} from '@silopro/contracts';
import type { z } from 'zod';
import { Org, OrgGuard, RequirePermission, SessionGuard } from '../auth/guards.js';
import type { OrgContext } from '../auth/request-context.js';
import { invalid } from '../common/http.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ReservationsService } from './reservations.service.js';

const uuid = new ParseUUIDPipe({ version: '7' });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('orgs/:orgId/reservations')
@UseGuards(SessionGuard, OrgGuard)
@RequirePermission('catalog.read')
export class ReservationsController {
  constructor(@Inject(ReservationsService) private readonly svc: ReservationsService) {}

  @Get()
  list(@Org() ctx: OrgContext, @Query('status') status?: string, @Query('itemId') itemId?: string) {
    if (
      status !== undefined &&
      !(RESERVATION_STATUS_VALUES as readonly string[]).includes(status)
    ) {
      throw invalid('Estado inválido');
    }
    if (itemId !== undefined && !UUID_RE.test(itemId)) throw invalid('itemId inválido');
    return this.svc.list(ctx, { status: status as ReservationStatus | undefined, itemId });
  }

  @Post()
  @RequirePermission('stock.move')
  create(
    @Org() ctx: OrgContext,
    @Body(new ZodValidationPipe(reservationInputSchema))
    body: z.output<typeof reservationInputSchema>,
  ) {
    return this.svc.create(ctx, body);
  }

  @Post(':id/release')
  @HttpCode(200)
  @RequirePermission('stock.move')
  release(@Org() ctx: OrgContext, @Param('id', uuid) id: string) {
    return this.svc.release(ctx, id);
  }

  @Post(':id/consume')
  @HttpCode(200)
  @RequirePermission('stock.move')
  consume(
    @Org() ctx: OrgContext,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(reservationConsumeSchema))
    body: z.output<typeof reservationConsumeSchema>,
  ) {
    return this.svc.consume(ctx, id, body);
  }
}
