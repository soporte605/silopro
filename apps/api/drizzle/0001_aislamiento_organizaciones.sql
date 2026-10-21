-- Aislamiento entre organizaciones (ADR-0011).
--
-- 1) Claves foráneas compuestas (organization_id, id): impiden referenciar
--    filas de otra organización aunque se conozca su UUID (las FK ignoran RLS).
-- 2) Row Level Security forzada: incluso el dueño de las tablas queda sujeto
--    a las políticas. La API fija app.organization_id y app.user_id con
--    set_config(..., true) al inicio de cada transacción.

CREATE OR REPLACE FUNCTION app_current_org() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.organization_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_current_user() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint

ALTER TABLE units ADD CONSTRAINT units_org_id_key UNIQUE (organization_id, id);
--> statement-breakpoint
ALTER TABLE categories ADD CONSTRAINT categories_org_id_key UNIQUE (organization_id, id);
--> statement-breakpoint
ALTER TABLE suppliers ADD CONSTRAINT suppliers_org_id_key UNIQUE (organization_id, id);
--> statement-breakpoint
ALTER TABLE items ADD CONSTRAINT items_org_id_key UNIQUE (organization_id, id);
--> statement-breakpoint
ALTER TABLE locations ADD CONSTRAINT locations_org_id_key UNIQUE (organization_id, id);
--> statement-breakpoint

ALTER TABLE categories ADD CONSTRAINT categories_parent_fk
  FOREIGN KEY (organization_id, parent_id) REFERENCES categories (organization_id, id);
--> statement-breakpoint
ALTER TABLE locations ADD CONSTRAINT locations_parent_fk
  FOREIGN KEY (organization_id, parent_id) REFERENCES locations (organization_id, id);
--> statement-breakpoint
ALTER TABLE items ADD CONSTRAINT items_category_org_fk
  FOREIGN KEY (organization_id, category_id) REFERENCES categories (organization_id, id)
  ON DELETE SET NULL (category_id);
--> statement-breakpoint
ALTER TABLE items ADD CONSTRAINT items_unit_org_fk
  FOREIGN KEY (organization_id, unit_id) REFERENCES units (organization_id, id);
--> statement-breakpoint
ALTER TABLE item_suppliers ADD CONSTRAINT item_suppliers_item_org_fk
  FOREIGN KEY (organization_id, item_id) REFERENCES items (organization_id, id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE item_suppliers ADD CONSTRAINT item_suppliers_supplier_org_fk
  FOREIGN KEY (organization_id, supplier_id) REFERENCES suppliers (organization_id, id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE stock_levels ADD CONSTRAINT stock_levels_item_org_fk
  FOREIGN KEY (organization_id, item_id) REFERENCES items (organization_id, id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE stock_levels ADD CONSTRAINT stock_levels_location_org_fk
  FOREIGN KEY (organization_id, location_id) REFERENCES locations (organization_id, id);
--> statement-breakpoint
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_item_org_fk
  FOREIGN KEY (organization_id, item_id) REFERENCES items (organization_id, id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_location_org_fk
  FOREIGN KEY (organization_id, location_id) REFERENCES locations (organization_id, id);
--> statement-breakpoint

-- Organizaciones: visibles para sus miembros; la organización activa siempre.
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE organizations FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY organizations_isolation ON organizations
  USING (id = app_current_org()
         OR id IN (SELECT organization_id FROM memberships WHERE user_id = app_current_user()))
  WITH CHECK (id = app_current_org());
--> statement-breakpoint

-- Membresías: las propias del usuario y las de la organización activa.
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY memberships_isolation ON memberships
  USING (user_id = app_current_user() OR organization_id = app_current_org())
  WITH CHECK (organization_id = app_current_org());
--> statement-breakpoint

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['units','categories','suppliers','items','item_suppliers',
                           'locations','stock_levels','stock_movements'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (organization_id = app_current_org()) WITH CHECK (organization_id = app_current_org())',
      t || '_isolation', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- Los movimientos son inmutables: solo se insertan.
CREATE OR REPLACE FUNCTION stock_movements_immutable() RETURNS trigger
  LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'stock_movements es de solo inserción'; END $$;
--> statement-breakpoint
CREATE TRIGGER stock_movements_no_update BEFORE UPDATE OR DELETE ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION stock_movements_immutable();
