import { Body, Controller, Get, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import { assistantChatSchema } from '@silopro/contracts';
import type { z } from 'zod';
import { Org, OrgGuard, RequirePermission, SessionGuard } from '../auth/guards.js';
import type { OrgContext } from '../auth/request-context.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AssistantService } from './assistant.service.js';

@Controller('orgs/:orgId/assistant')
@UseGuards(SessionGuard, OrgGuard)
@RequirePermission('catalog.read')
export class AssistantController {
  constructor(@Inject(AssistantService) private readonly svc: AssistantService) {}

  @Get()
  status(@Org() ctx: OrgContext) {
    return this.svc.status(ctx);
  }

  @Post('chat')
  @HttpCode(200)
  chat(
    @Org() ctx: OrgContext,
    @Body(new ZodValidationPipe(assistantChatSchema)) body: z.output<typeof assistantChatSchema>,
  ) {
    return this.svc.chat(ctx, body);
  }
}
