import { Inject, Injectable } from '@nestjs/common';
import type { BillingSummary } from '@silopro/contracts';
import { eq } from 'drizzle-orm';
import type { OrgContext } from '../auth/request-context.js';
import { ENV, type Env } from '../config/env.js';
import { DbService } from '../db/db.service.js';
import { iso } from '../db/mappers.js';
import { organizations } from '../db/schema.js';
import { orgPlan, orgUsage } from './plan-limits.js';

/** Plan, uso y suscripción de la organización. */
@Injectable()
export class BillingService {
  constructor(
    @Inject(DbService) private readonly dbs: DbService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  summary(ctx: OrgContext): Promise<BillingSummary> {
    return this.dbs.tenant(ctx, async (tx) => {
      const [org] = await tx
        .select()
        .from(organizations)
        .where(eq(organizations.id, ctx.organizationId));
      const state = await orgPlan(tx, ctx.organizationId);
      return {
        plan: state.plan,
        readOnly: state.readOnly,
        trialEndsAt: org?.trialEndsAt ? iso(org.trialEndsAt) : null,
        trialDaysLeft: state.trialDaysLeft,
        subscriptionStatus: org?.subscriptionStatus ?? null,
        billingInterval: (org?.billingInterval as 'month' | 'year' | null) ?? null,
        currentPeriodEnd: org?.currentPeriodEnd ? iso(org.currentPeriodEnd) : null,
        limits: state.limits,
        usage: await orgUsage(tx, ctx.organizationId),
        checkoutAvailable: !!this.env.STRIPE_SECRET_KEY,
      };
    });
  }
}
