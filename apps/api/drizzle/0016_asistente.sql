CREATE TABLE "assistant_usage" (
	"organization_id" uuid NOT NULL,
	"period" text NOT NULL,
	"questions" integer DEFAULT 0 NOT NULL,
	"input_tokens" bigint DEFAULT 0 NOT NULL,
	"output_tokens" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assistant_usage_organization_id_period_pk" PRIMARY KEY("organization_id","period")
);
--> statement-breakpoint
ALTER TABLE "assistant_usage" ADD CONSTRAINT "assistant_usage_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE assistant_usage ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE assistant_usage FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY assistant_usage_isolation ON assistant_usage
  USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());
