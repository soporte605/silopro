import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { auditQuerySchema } from '@silopro/contracts';
import type { z } from 'zod';
import { Org, OrgGuard, RequirePermission, SessionGuard } from '../auth/guards.js';
import type { OrgContext } from '../auth/request-context.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AuditService } from './audit.service.js';

@Controller('orgs/:orgId/audit')
@UseGuards(SessionGuard, OrgGuard)
@RequirePermission('members.manage')
export class AuditController {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  @Get()
  list(
    @Org() ctx: OrgContext,
    @Query(new ZodValidationPipe(auditQuerySchema)) q: z.output<typeof auditQuerySchema>,
  ) {
    return this.audit.list(ctx, q);
  }
}
