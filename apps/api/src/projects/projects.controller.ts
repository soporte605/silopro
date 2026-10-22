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
  bomLineInputSchema,
  bomLineUpdateSchema,
  PROJECT_STATUS_VALUES,
  projectInputSchema,
  type ProjectStatus,
} from '@silopro/contracts';
import { z } from 'zod';
import { Org, OrgGuard, RequirePermission, SessionGuard } from '../auth/guards.js';
import type { OrgContext } from '../auth/request-context.js';
import { invalid } from '../common/http.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ProjectsService } from './projects.service.js';

const uuid = new ParseUUIDPipe({ version: '7' });
const projectUpdateSchema = projectInputSchema.extend({
  version: z.coerce.number().int().min(1),
});

/**
 * Proyectos y su lista de materiales. Quien puede mover existencias puede
 * planear proyectos y apartar material para ellos.
 */
@Controller('orgs/:orgId/projects')
@UseGuards(SessionGuard, OrgGuard)
@RequirePermission('catalog.read')
export class ProjectsController {
  constructor(@Inject(ProjectsService) private readonly svc: ProjectsService) {}

  @Get()
  list(@Org() ctx: OrgContext, @Query('status') status?: string) {
    if (status !== undefined && !(PROJECT_STATUS_VALUES as readonly string[]).includes(status)) {
      throw invalid('Estado inválido');
    }
    return this.svc.list(ctx, { status: status as ProjectStatus | undefined });
  }

  @Post()
  @RequirePermission('stock.move')
  create(
    @Org() ctx: OrgContext,
    @Body(new ZodValidationPipe(projectInputSchema)) body: z.output<typeof projectInputSchema>,
  ) {
    return this.svc.create(ctx, body);
  }

  @Get(':id')
  get(@Org() ctx: OrgContext, @Param('id', uuid) id: string) {
    return this.svc.get(ctx, id);
  }

  @Patch(':id')
  @RequirePermission('stock.move')
  update(
    @Org() ctx: OrgContext,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(projectUpdateSchema)) body: z.output<typeof projectUpdateSchema>,
  ) {
    return this.svc.update(ctx, id, body);
  }

  @Post(':id/lines')
  @RequirePermission('stock.move')
  addLine(
    @Org() ctx: OrgContext,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(bomLineInputSchema)) body: z.output<typeof bomLineInputSchema>,
  ) {
    return this.svc.addLine(ctx, id, body);
  }

  @Patch(':id/lines/:lineId')
  @RequirePermission('stock.move')
  updateLine(
    @Org() ctx: OrgContext,
    @Param('id', uuid) id: string,
    @Param('lineId', uuid) lineId: string,
    @Body(new ZodValidationPipe(bomLineUpdateSchema)) body: z.output<typeof bomLineUpdateSchema>,
  ) {
    return this.svc.updateLine(ctx, id, lineId, body);
  }

  @Delete(':id/lines/:lineId')
  @RequirePermission('stock.move')
  removeLine(
    @Org() ctx: OrgContext,
    @Param('id', uuid) id: string,
    @Param('lineId', uuid) lineId: string,
  ) {
    return this.svc.removeLine(ctx, id, lineId);
  }

  @Post(':id/reserve-all')
  @HttpCode(200)
  @RequirePermission('stock.move')
  reserveAll(@Org() ctx: OrgContext, @Param('id', uuid) id: string) {
    return this.svc.reserveAll(ctx, id);
  }

  @Post(':id/release-all')
  @HttpCode(200)
  @RequirePermission('stock.move')
  releaseAll(@Org() ctx: OrgContext, @Param('id', uuid) id: string) {
    return this.svc.releaseAll(ctx, id);
  }
}
