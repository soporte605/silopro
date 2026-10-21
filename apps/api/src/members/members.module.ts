import { Module } from '@nestjs/common';
import { InvitationLinkController, MembersController } from './members.controller.js';
import { MembersService } from './members.service.js';

@Module({
  controllers: [MembersController, InvitationLinkController],
  providers: [MembersService],
})
export class MembersModule {}
