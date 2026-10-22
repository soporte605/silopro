CREATE TYPE "public"."project_status" AS ENUM('draft', 'active', 'done', 'cancelled');--> statement-breakpoint
CREATE TABLE "bom_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" numeric(18, 3) NOT NULL,
	"notes" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bom_lines_quantity_positive" CHECK ("bom_lines"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "project_status" DEFAULT 'active' NOT NULL,
	"due_date" date,
	"created_by" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "bom_lines" ADD CONSTRAINT "bom_lines_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_lines" ADD CONSTRAINT "bom_lines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_lines" ADD CONSTRAINT "bom_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bom_lines_project_item_key" ON "bom_lines" USING btree ("project_id","item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_org_code_key" ON "projects" USING btree ("organization_id","code");--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reservations_project_idx" ON "reservations" USING btree ("project_id");--> statement-breakpoint
-- Aislamiento: mismas garantías que la migración 0001.
ALTER TABLE projects ADD CONSTRAINT projects_org_id_key UNIQUE (organization_id, id);
--> statement-breakpoint
ALTER TABLE bom_lines ADD CONSTRAINT bom_lines_project_org_fk
  FOREIGN KEY (organization_id, project_id) REFERENCES projects (organization_id, id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE bom_lines ADD CONSTRAINT bom_lines_item_org_fk
  FOREIGN KEY (organization_id, item_id) REFERENCES items (organization_id, id);
--> statement-breakpoint
ALTER TABLE reservations ADD CONSTRAINT reservations_project_org_fk
  FOREIGN KEY (organization_id, project_id) REFERENCES projects (organization_id, id);
--> statement-breakpoint
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE projects FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY projects_isolation ON projects
  USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());
--> statement-breakpoint
ALTER TABLE bom_lines ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE bom_lines FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY bom_lines_isolation ON bom_lines
  USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());
