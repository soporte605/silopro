-- Gabinetes: mismas garantías que la migración 0001.

ALTER TABLE cabinets ADD CONSTRAINT cabinets_location_org_fk
  FOREIGN KEY (organization_id, location_id) REFERENCES locations (organization_id, id);
--> statement-breakpoint
ALTER TABLE cabinets ADD CONSTRAINT cabinets_dimensions_valid
  CHECK (rows BETWEEN 1 AND 60 AND columns BETWEEN 1 AND 60);
--> statement-breakpoint
ALTER TABLE cabinets ADD CONSTRAINT cabinets_addressing_valid
  CHECK (addressing IN ('row-letter', 'column-letter', 'numeric') AND row_origin IN ('top', 'bottom'));
--> statement-breakpoint
ALTER TABLE cabinets ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE cabinets FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY cabinets_isolation ON cabinets
  USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org());
