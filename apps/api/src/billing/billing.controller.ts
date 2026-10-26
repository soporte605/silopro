import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { type CheckoutInput, checkoutInputSchema } from '@silopro/contracts';
import {
  AllowReadOnly,
  CurrentUser,
  Org,
  OrgGuard,
  RequirePermission,
  SessionGuard,
} from '../auth/guards.js';
import type { AppRequest, AuthUser, OrgContext } from '../auth/request-context.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { BillingService } from './billing.service.js';
import { StripeService } from './stripe.service.js';

@Controller('orgs/:orgId/billing')
@UseGuards(SessionGuard, OrgGuard)
export class BillingController {
  constructor(
    @Inject(BillingService) private readonly billing: BillingService,
    @Inject(StripeService) private readonly stripe: StripeService,
  ) {}

  /** Cualquier miembro ve el plan y el uso (para entender un límite). */
  @Get()
  summary(@Org() ctx: OrgContext) {
    return this.billing.summary(ctx);
  }

  /** Solo propietarios contratan; funciona también en solo lectura. */
  @Post('checkout')
  @HttpCode(200)
  @AllowReadOnly()
  @RequirePermission('organization.manage')
  checkout(
    @Org() ctx: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(checkoutInputSchema)) body: CheckoutInput,
  ) {
    return this.stripe.checkout(ctx, user.email, body);
  }

  @Post('portal')
  @HttpCode(200)
  @AllowReadOnly()
  @RequirePermission('organization.manage')
  portal(@Org() ctx: OrgContext) {
    return this.stripe.portal(ctx);
  }
}

/** Avisos de Stripe; se autentican con la firma, no con sesión. */
@Controller('billing')
export class StripeWebhookController {
  constructor(@Inject(StripeService) private readonly stripe: StripeService) {}

  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Req() req: AppRequest & { rawBody?: Buffer },
    @Headers('stripe-signature') signature?: string,
  ) {
    await this.stripe.webhook(req.rawBody, signature);
    return { received: true };
  }
}
