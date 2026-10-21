/**
 * Esquema de base de datos (Drizzle ORM). Ver docs/DATA_MODEL.md.
 *
 * Convenciones: UUIDv7 generados en la aplicación, `organization_id` en toda
 * tabla de negocio (aislada con RLS, ver migración 0001), `version` para
 * bloqueo optimista y cantidades NUMERIC(18,3).
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { v7 as uuidv7 } from 'uuid';

const id = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7());
const orgId = () =>
  uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' });
const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};
const qty = (name: string) => numeric(name, { precision: 18, scale: 3 });
const money = (name: string) => numeric(name, { precision: 14, scale: 4 });

export const roleEnum = pgEnum('member_role', ['owner', 'admin', 'operator', 'viewer']);
export const locationKindEnum = pgEnum('location_kind', [
  'warehouse',
  'zone',
  'room',
  'shelving',
  'shelf',
  'cabinet',
  'drawer',
  'compartment',
  'box',
  'bin',
  'other',
]);
export const movementKindEnum = pgEnum('movement_kind', [
  'receipt',
  'issue',
  'adjustment',
  'transfer',
  'consumption',
]);

// ── Identidad (sin RLS: se consultan antes de conocer la organización) ──────
export const users = pgTable(
  'users',
  {
    id: id(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex('users_email_key').on(sql`lower(${t.email})`)],
);

export const sessions = pgTable(
  'sessions',
  {
    /** SHA-256 del token; el token en claro solo vive en la cookie. */
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    userAgent: text('user_agent'),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

// ── Organizaciones ─────────────────────────────────────────────────────────
export const organizations = pgTable('organizations', {
  id: id(),
  name: text('name').notNull(),
  plan: text('plan').notNull().default('free'),
  ...timestamps,
});

export const memberships = pgTable(
  'memberships',
  {
    organizationId: orgId(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.userId] }),
    index('memberships_user_idx').on(t.userId),
  ],
);

/**
 * Invitaciones a una organización. El enlace lleva el id de la organización y
 * un token aleatorio; en la BD solo se guarda su hash SHA-256.
 */
export const invitations = pgTable(
  'invitations',
  {
    id: id(),
    organizationId: orgId(),
    email: text('email').notNull(),
    role: roleEnum('role').notNull(),
    tokenHash: text('token_hash').notNull(),
    invitedBy: uuid('invited_by')
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptedBy: uuid('accepted_by').references(() => users.id),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('invitations_token_key').on(t.tokenHash),
    index('invitations_org_idx').on(t.organizationId),
  ],
);

// ── Catálogo ───────────────────────────────────────────────────────────────
export const units = pgTable(
  'units',
  {
    id: id(),
    organizationId: orgId(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    symbol: text('symbol').notNull(),
    decimals: smallint('decimals').notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex('units_org_code_key').on(t.organizationId, t.code)],
);

export const categories = pgTable(
  'categories',
  {
    id: id(),
    organizationId: orgId(),
    parentId: uuid('parent_id'),
    name: text('name').notNull(),
    description: text('description'),
    attributes: jsonb('attributes')
      .notNull()
      .default(sql`'[]'::jsonb`),
    version: integer('version').notNull().default(1),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('categories_org_parent_idx').on(t.organizationId, t.parentId),
    uniqueIndex('categories_org_parent_name_key')
      .on(
        t.organizationId,
        sql`coalesce(${t.parentId}, '00000000-0000-0000-0000-000000000000')`,
        sql`lower(${t.name})`,
      )
      .where(sql`${t.archivedAt} is null`),
  ],
);

export const suppliers = pgTable(
  'suppliers',
  {
    id: id(),
    organizationId: orgId(),
    name: text('name').notNull(),
    contactName: text('contact_name'),
    email: text('email'),
    phone: text('phone'),
    website: text('website'),
    notes: text('notes'),
    version: integer('version').notNull().default(1),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index('suppliers_org_idx').on(t.organizationId)],
);

export const items = pgTable(
  'items',
  {
    id: id(),
    organizationId: orgId(),
    sku: text('sku').notNull(),
    internalCode: text('internal_code'),
    name: text('name').notNull(),
    description: text('description'),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    unitId: uuid('unit_id')
      .notNull()
      .references(() => units.id),
    manufacturer: text('manufacturer'),
    model: text('model'),
    cost: money('cost'),
    price: money('price'),
    minStock: qty('min_stock'),
    attributes: jsonb('attributes')
      .notNull()
      .default(sql`'{}'::jsonb`),
    qrCode: text('qr_code').notNull(),
    version: integer('version').notNull().default(1),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('items_org_sku_key').on(t.organizationId, sql`lower(${t.sku})`),
    uniqueIndex('items_qr_code_key').on(t.qrCode),
    index('items_org_category_idx').on(t.organizationId, t.categoryId),
  ],
);

export const itemSuppliers = pgTable(
  'item_suppliers',
  {
    organizationId: orgId(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.supplierId] })],
);

/** Fotografías re-codificadas (WebP, sin metadatos) guardadas en UPLOADS_DIR. */
export const itemPhotos = pgTable(
  'item_photos',
  {
    id: id(),
    organizationId: orgId(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    bytes: integer('bytes').notNull(),
    position: smallint('position').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('item_photos_item_idx').on(t.itemId, t.position)],
);

// ── Ubicaciones y existencias ──────────────────────────────────────────────
export const locations = pgTable(
  'locations',
  {
    id: id(),
    organizationId: orgId(),
    parentId: uuid('parent_id'),
    kind: locationKindEnum('kind').notNull(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    /** Ruta legible materializada, p. ej. "ALM-1 / GAB-1 / C4". */
    path: text('path').notNull(),
    depth: smallint('depth').notNull(),
    qrCode: text('qr_code').notNull(),
    version: integer('version').notNull().default(1),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('locations_org_parent_code_key').on(
      t.organizationId,
      sql`coalesce(${t.parentId}, '00000000-0000-0000-0000-000000000000')`,
      sql`lower(${t.code})`,
    ),
    uniqueIndex('locations_qr_code_key').on(t.qrCode),
  ],
);

export const stockLevels = pgTable(
  'stock_levels',
  {
    organizationId: orgId(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id),
    onHand: qty('on_hand').notNull().default('0'),
    reserved: qty('reserved').notNull().default('0'),
    allowNegative: boolean('allow_negative').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.itemId, t.locationId] }),
    index('stock_levels_location_idx').on(t.locationId),
    check(
      'stock_reserved_valid',
      sql`${t.reserved} >= 0 and ${t.reserved} <= greatest(${t.onHand}, 0)`,
    ),
    check('stock_non_negative', sql`${t.allowNegative} or ${t.onHand} >= 0`),
  ],
);

/** Registro inmutable de movimientos: fuente de verdad de las existencias (ADR-0006). */
export const stockMovements = pgTable(
  'stock_movements',
  {
    id: id(),
    organizationId: orgId(),
    kind: movementKindEnum('kind').notNull(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id),
    delta: qty('delta').notNull(),
    reason: text('reason'),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('stock_movements_item_idx').on(t.itemId, t.occurredAt)],
);
