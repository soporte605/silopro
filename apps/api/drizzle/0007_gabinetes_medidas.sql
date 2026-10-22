ALTER TABLE "cabinets" ADD COLUMN "cell_width" real DEFAULT 40 NOT NULL;--> statement-breakpoint
ALTER TABLE "cabinets" ADD COLUMN "cell_height" real DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "cabinets" ADD COLUMN "depth" real DEFAULT 120 NOT NULL;--> statement-breakpoint
ALTER TABLE "cabinets" ADD COLUMN "wall_thickness" real DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "cabinets" ADD CONSTRAINT "cabinets_physical_valid" CHECK ("cabinets"."cell_width" between 5 and 500 and "cabinets"."cell_height" between 5 and 500 and "cabinets"."depth" between 10 and 1000 and "cabinets"."wall_thickness" between 0.4 and 20);