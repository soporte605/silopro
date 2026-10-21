-- Fotografías e invitaciones: mismas garantías que la migración 0001.

ALTER TABLE item_photos ADD CONSTRAINT item_photos_item_org_fk
  FOREIGN KEY (organization_id, item_id) REFERENCES items (organization_id, id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE item_photos ADD CONSTRAINT item_photos_position_valid CHECK (position >= 0);
--> statement-breakpoint
ALTER TABLE invitations ADD CONSTRAINT invitations_email_lower CHECK (email = lower(email));
--> statement-breakpoint

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['item_photos','invitations'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org())',
      t || '_isolation', t);
  END LOOP;
END $$;
