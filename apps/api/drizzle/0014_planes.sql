ALTER TABLE "organizations" ALTER COLUMN "plan" SET DEFAULT 'trial';--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "trial_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_customer_id" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "stripe_subscription_id" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "subscription_status" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "billing_interval" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "current_period_end" timestamp with time zone;--> statement-breakpoint
-- Organizaciones existentes: prueba de 30 días desde hoy. RLS se suspende solo
-- para esta actualización (la migración la ejecuta el dueño de la tabla).
ALTER TABLE "organizations" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
UPDATE "organizations" SET "plan" = 'trial', "trial_ends_at" = now() + interval '30 days' WHERE "plan" = 'free';--> statement-breakpoint
ALTER TABLE "organizations" FORCE ROW LEVEL SECURITY;
