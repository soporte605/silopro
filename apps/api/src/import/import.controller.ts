import { Body, Controller, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import { importRequestSchema } from '@silopro/contracts';
import type { z } from 'zod';
import { Org, OrgGuard, RequirePermission, SessionGuard } from '../auth/guards.js';
import type { OrgContext } from '../auth/request-context.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ImportService } from './import.service.js';

@Controller('orgs/:orgId/import')
@UseGuards(SessionGuard, OrgGuard)
@RequirePermission('catalog.write')
export class ImportController {
  constructor(@Inject(ImportService) private readonly svc: ImportService) {}

  /** `dryRun: true` valida y dice qué haría; `false` importa todo o nada. */
  @Post('items')
  @HttpCode(200)
  items(
    @Org() ctx: OrgContext,
    @Body(new ZodValidationPipe(importRequestSchema)) body: z.output<typeof importRequestSchema>,
  ) {
    return this.svc.items(ctx, body);
  }
}
