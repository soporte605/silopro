import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import {
  loginSchema,
  type LoginInput,
  type Me,
  registerSchema,
  type RegisterInput,
} from '@silopro/contracts';
import type { Response } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AuthService } from './auth.service.js';
import { CurrentUser, SessionGuard } from './guards.js';
import { type AppRequest, type AuthUser, SESSION_COOKIE } from './request-context.js';

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('register')
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Me> {
    const { token, me } = await this.auth.register(body, req.get('user-agent'));
    res.cookie(SESSION_COOKIE, token, this.auth.cookieOptions());
    return me;
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: AppRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Me> {
    const { token, me } = await this.auth.login(body, req.ip ?? '', req.get('user-agent'));
    res.cookie(SESSION_COOKIE, token, this.auth.cookieOptions());
    return me;
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(SessionGuard)
  async logout(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(user.sessionId);
    const { httpOnly, secure, sameSite, path } = this.auth.cookieOptions();
    res.clearCookie(SESSION_COOKIE, { httpOnly, secure, sameSite, path });
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@CurrentUser() user: AuthUser): Promise<Me> {
    return this.auth.me(user);
  }
}
