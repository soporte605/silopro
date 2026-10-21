import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { OrgGuard, SessionGuard } from './guards.js';

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionGuard, OrgGuard],
  exports: [AuthService, SessionGuard, OrgGuard],
})
export class AuthModule {}
