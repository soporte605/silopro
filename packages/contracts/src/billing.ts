import { z } from 'zod';

export interface PlanUsage {
  members: number;
  items: number;
  photoBytes: number;
}

/** Plan y uso de la organización para «Plan y facturación». */
export interface BillingSummary {
  plan: 'trial' | 'basic' | 'pro' | 'enterprise';
  readOnly: boolean;
  trialEndsAt: string | null;
  trialDaysLeft: number | null;
  subscriptionStatus: string | null;
  billingInterval: 'month' | 'year' | null;
  currentPeriodEnd: string | null;
  limits: { members: number | null; items: number | null; photoBytes: number | null };
  usage: PlanUsage;
  /** Stripe está configurado en el servidor (si no, no se puede pagar en línea). */
  checkoutAvailable: boolean;
}

export const checkoutInputSchema = z.object({
  plan: z.enum(['basic', 'pro']),
  interval: z.enum(['month', 'year']),
});
export type CheckoutInput = z.infer<typeof checkoutInputSchema>;
