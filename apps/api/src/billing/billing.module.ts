import { Module } from '@nestjs/common';
import { BillingController, StripeWebhookController } from './billing.controller.js';
import { BillingService } from './billing.service.js';
import { StripeService } from './stripe.service.js';

@Module({
  controllers: [BillingController, StripeWebhookController],
  providers: [BillingService, StripeService],
})
export class BillingModule {}
