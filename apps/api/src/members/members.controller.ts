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
  UseGuards,
} from '@nestjs/common';
import { invitationInputSchema, memberRoleUpdateSchema } from '@silopro/contracts';
import type { z } from 'zod';
import { CurrentUser, Org, OrgGuard, RequirePermission, SessionGuard } from '../auth/guards.js';
import type { AuthUser, OrgContext } from '../auth/request-context.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { MembersService } from './members.service.js';

const uuid = new ParseUUIDPipe({ version: '7' });

@Controller('orgs/:orgId')
@UseGuards(SessionGuard, OrgGuard)
@RequirePermission('catalog.read')
export class MembersController {
  constructor(@Inject(MembersService) private readonly members: MembersService) {}

  @Get('members')
  list(@Org() ctx: OrgContext) {
    return this.members.list(ctx);
  }

  // Las reglas finas (propietarios, último propietario) se validan en el servicio.
  @Patch('members/:userId')
  @RequirePermission('members.manage')
  updateRole(
    @Org() ctx: OrgContext,
    @Param('userId', uuid) userId: string,
    @Body(new ZodValidationPipe(memberRoleUpdateSchema))
    body: z.output<typeof memberRoleUpdateSchema>,
  ) {
    return this.members.updateRole(ctx, userId, body.role);
  }

  /** Quitar a un miembro (`members.manage`) o abandonar la organización (uno mismo). */
  @Delete('members/:userId')
  @HttpCode(204)
  remove(@Org() ctx: OrgContext, @Param('userId', uuid) userId: string) {
    return this.members.remove(ctx, userId);
  }

  @Get('invitations')
  @RequirePermission('members.manage')
  listInvitations(@Org() ctx: OrgContext) {
    return this.members.listInvitations(ctx);
  }

  @Post('invitations')
  @RequirePermission('members.manage')
  createInvitation(
    @Org() ctx: OrgContext,
    @Body(new ZodValidationPipe(invitationInputSchema))
    body: z.output<typeof invitationInputSchema>,
  ) {
    return this.members.createInvitation(ctx, body);
  }

  @Delete('invitations/:id')
  @HttpCode(204)
  @RequirePermission('members.manage')
  revoke(@Org() ctx: OrgContext, @Param('id', uuid) id: string) {
    return this.members.revokeInvitation(ctx, id);
  }
}

/** Enlace de invitación: vista previa pública y aceptación con sesión. */
@Controller('invitations/:orgId/:token')
export class InvitationLinkController {
  constructor(@Inject(MembersService) private readonly members: MembersService) {}

  @Get()
  preview(@Param('orgId', uuid) orgId: string, @Param('token') token: string) {
    return this.members.preview(orgId, token);
  }

  @Post('accept')
  @HttpCode(200)
  @UseGuards(SessionGuard)
  accept(
    @CurrentUser() user: AuthUser,
    @Param('orgId', uuid) orgId: string,
    @Param('token') token: string,
  ) {
    return this.members.accept(user, orgId, token);
  }
}
