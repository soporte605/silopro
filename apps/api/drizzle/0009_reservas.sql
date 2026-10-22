CREATE TYPE "public"."reservation_status" AS ENUM('active', 'released', 'consumed');--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"consumed" numeric(18, 3) DEFAULT '0' NOT NULL,
	"status" "reservation_status" DEFAULT 'active' NOT NULL,
	"purpose" text NOT NULL,
	"created_by" uuid NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservations_quantities_valid" CHECK ("reservations"."quantity" > 0 and "reservations"."consumed" >= 0 and "reservations"."consumed" <= "reservations"."quantity")
);
--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "reservation_id" uuid;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reservations_item_idx" ON "reservations" USING btree ("item_id","status");--> statement-breakpoint
CREATE INDEX "reservations_status_idx" ON "reservations" USING btree ("status","created_at");--> statement-breakpoint
-- Aislamiento: mismas garantías que la migración 0001.
ALTER TABLE reservations ADD CONSTRAINT reservations_item_org_fk
  FOREIGN KEY (organization_id, item_id) REFERENCES items (organization_id, id);
--> statement-breakpoint
ALTER TABLE reservations ADD CONSTRAINT reservations_location_org_fk
  FOREIGN KEY (organization_id, location_id) REFERENCES locations (organization_id, id);
--> statement-breakpoint
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE reservations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY reservations_isolation ON reservations
  USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());
