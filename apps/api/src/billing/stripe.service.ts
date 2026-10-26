import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { CheckoutInput } from '@silopro/contracts';
import { planFromLookupKey, PRICE_LOOKUP } from '@silopro/domain';
import { eq } from 'drizzle-orm';
import Stripe from 'stripe';
import type { OrgContext } from '../auth/request-context.js';
import { ENV, type Env } from '../config/env.js';
import { DbService } from '../db/db.service.js';
import { organizations } from '../db/schema.js';

/**
 * Suscripciones con Stripe Checkout y el portal de clientes. La organización
 * viaja en `metadata.organizationId` de la suscripción: el webhook la usa para
 * actualizar el plan bajo RLS sin buscar entre organizaciones.
 */
@Injectable()
export class StripeService {
  private readonly log = new Logger('Stripe');
  private readonly stripe: Stripe | null;

  constructor(
    @Inject(DbService) private readonly dbs: DbService,
    @Inject(ENV) private readonly env: Env,
  ) {
    this.stripe = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null;
  }

  private client(): Stripe {
    if (!this.stripe) {
      throw new ServiceUnavailableException({
        code: 'BILLING_UNAVAILABLE',
        message: 'Los pagos en línea aún no están disponibles. Escríbanos para contratar.',
      });
    }
    return this.stripe;
  }

  private priceCache: { at: number; ids: Map<string, string> } | null = null;

  /** Id del precio vigente de cada `lookup_key` (los crea `scripts/stripe-setup.mjs`). */
  private async priceIds(): Promise<Map<string, string>> {
    if (this.priceCache && Date.now() - this.priceCache.at < 10 * 60_000) {
      return this.priceCache.ids;
    }
    const list = await this.client().prices.list({
      lookup_keys: Object.values(PRICE_LOOKUP),
      active: true,
      limit: 10,
    });
    const ids = new Map(list.data.map((p) => [p.lookup_key ?? '', p.id]));
    this.priceCache = { at: Date.now(), ids };
    return ids;
  }

  private base(): string {
    return this.env.PUBLIC_WEB_URL.replace(/\/+$/, '');
  }

  /** URL de Stripe Checkout para contratar `plan` con pago `interval`. */
  async checkout(ctx: OrgContext, email: string, input: CheckoutInput): Promise<{ url: string }> {
    const stripe = this.client();
    const org = await this.org(ctx);
    // Un segundo checkout crearía otra suscripción y un doble cobro.
    if (
      org.stripeSubscriptionId &&
      ['active', 'trialing', 'past_due'].includes(org.subscriptionStatus ?? '')
    ) {
      throw new BadRequestException({
        code: 'ALREADY_SUBSCRIBED',
        message: 'Ya tiene un plan pagado; cámbielo desde «Administrar suscripción».',
      });
    }
    const price = (await this.priceIds()).get(PRICE_LOOKUP[`${input.plan}_${input.interval}`]);
    if (!price) {
      throw new BadRequestException({
        code: 'PRICE_NOT_CONFIGURED',
        message: 'Ese plan aún no se puede contratar en línea.',
      });
    }
    let customer = org.stripeCustomerId;
    if (!customer) {
      customer = (
        await stripe.customers.create({
          email,
          name: org.name,
          metadata: { organizationId: ctx.organizationId },
          preferred_locales: ['es'],
        })
      ).id;
      await this.dbs.tenant(ctx, (tx) =>
        tx
          .update(organizations)
          .set({ stripeCustomerId: customer })
          .where(eq(organizations.id, ctx.organizationId)),
      );
    }
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer,
      client_reference_id: ctx.organizationId,
      line_items: [{ price, quantity: 1 }],
      subscription_data: { metadata: { organizationId: ctx.organizationId } },
      allow_promotion_codes: true,
      locale: 'es',
      success_url: `${this.base()}/plan?pago=ok`,
      cancel_url: `${this.base()}/plan`,
    });
    return { url: session.url! };
  }

  /** Portal de Stripe: cambiar tarjeta, plan, ver facturas o cancelar. */
  async portal(ctx: OrgContext): Promise<{ url: string }> {
    const stripe = this.client();
    const org = await this.org(ctx);
    if (!org.stripeCustomerId) {
      throw new BadRequestException({
        code: 'NO_SUBSCRIPTION',
        message: 'Aún no tiene una suscripción.',
      });
    }
    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripeCustomerId,
      // Cuenta de Stripe posiblemente compartida: el portal propio de SiloPro.
      ...(this.env.STRIPE_PORTAL_CONFIGURATION
        ? { configuration: this.env.STRIPE_PORTAL_CONFIGURATION }
        : {}),
      return_url: `${this.base()}/plan`,
      locale: 'es',
    });
    return { url: session.url };
  }

  /** Verifica la firma del webhook y aplica los cambios de suscripción. */
  async webhook(raw: Buffer | undefined, signature: string | undefined): Promise<void> {
    if (!this.env.STRIPE_WEBHOOK_SECRET) throw new ServiceUnavailableException();
    let event: Stripe.Event;
    try {
      event = Stripe.webhooks.constructEvent(
        raw ?? Buffer.alloc(0),
        signature ?? '',
        this.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch {
      throw new BadRequestException({ code: 'BAD_SIGNATURE', message: 'Firma inválida' });
    }
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.applySubscription(event.data.object);
        break;
      default:
        break;
    }
  }

  private async applySubscription(sub: Stripe.Subscription): Promise<void> {
    const organizationId = sub.metadata?.['organizationId'];
    if (!organizationId) {
      this.log.warn(`Suscripción ${sub.id} sin organizationId en metadata`);
      return;
    }
    const item = sub.items.data[0];
    const mapped = planFromLookupKey(item?.price.lookup_key);
    const ended = sub.status === 'canceled' || sub.status === 'incomplete_expired';
    await this.dbs.tenant({ userId: '', organizationId }, (tx) =>
      tx
        .update(organizations)
        .set({
          ...(mapped && !ended ? { plan: mapped.plan, billingInterval: mapped.interval } : {}),
          stripeCustomerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
          stripeSubscriptionId: sub.id,
          subscriptionStatus: sub.status,
          currentPeriodEnd: item ? new Date(item.current_period_end * 1000) : null,
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, organizationId)),
    );
    if (item && !mapped) this.log.warn(`Precio ${item.price.id} sin lookup_key de SiloPro`);
  }

  private async org(ctx: OrgContext) {
    const [org] = await this.dbs.tenant(ctx, (tx) =>
      tx.select().from(organizations).where(eq(organizations.id, ctx.organizationId)),
    );
    return org!;
  }
}
