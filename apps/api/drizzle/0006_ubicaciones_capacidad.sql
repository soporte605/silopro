DROP INDEX "locations_org_parent_code_key";--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "max_items" smallint;--> statement-breakpoint
CREATE UNIQUE INDEX "locations_org_parent_code_key" ON "locations" USING btree ("organization_id",coalesce("parent_id", '00000000-0000-0000-0000-000000000000'),lower("code")) WHERE "locations"."archived_at" is null;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_max_items_valid" CHECK ("max_items" IS NULL OR "max_items" BETWEEN 1 AND 999);
