/**
 * Esquema de base de datos (Drizzle ORM). Ver docs/DATA_MODEL.md.
 *
 * Convenciones: UUIDv7 generados en la aplicación, `organization_id` en toda
 * tabla de negocio (aislada con RLS, ver migración 0001), `version` para
 * bloqueo optimista y cantidades NUMERIC(18,3).
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  real,
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
export const reservationStatusEnum = pgEnum('reservation_status', [
  'active',
  'released',
  'consumed',
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
    /** Cuándo confirmó su correo con el enlace enviado; `null` si aún no. */
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex('users_email_key').on(sql`lower(${t.email})`)],
);

export const authTokenPurposeEnum = pgEnum('auth_token_purpose', [
  'verify_email',
  'reset_password',
]);

/**
 * Enlaces de un solo uso enviados por correo (confirmar correo, restablecer
 * contraseña). Solo se guarda el hash SHA-256 del token.
 */
export const authTokens = pgTable(
  'auth_tokens',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: authTokenPurposeEnum('purpose').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('auth_tokens_token_key').on(t.tokenHash),
    index('auth_tokens_user_idx').on(t.userId, t.purpose),
  ],
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
/** Organización: el plan y la suscripción viven aquí (ver `@silopro/domain/plans`). */
export const organizations = pgTable('organizations', {
  id: id(),
  name: text('name').notNull(),
  /** `trial`, `basic`, `pro` o `enterprise`. */
  plan: text('plan').notNull().default('trial'),
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  stripeCustomerId: text('stripe_customer_id'),
  stripeSubscriptionId: text('stripe_subscription_id'),
  /** Estado de la suscripción en Stripe (`active`, `past_due`, `canceled`…). */
  subscriptionStatus: text('subscription_status'),
  billingInterval: text('billing_interval'),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
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
    /** Nombres alternos para buscarlo («placa wifi» para un ESP32). */
    aliases: text('aliases')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
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
    /** Capacidad en artículos distintos (`null` = sin límite). */
    maxItems: smallint('max_items'),
    version: integer('version').notNull().default(1),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('locations_org_parent_code_key')
      .on(
        t.organizationId,
        sql`coalesce(${t.parentId}, '00000000-0000-0000-0000-000000000000')`,
        sql`lower(${t.code})`,
      )
      .where(sql`${t.archivedAt} is null`),
    uniqueIndex('locations_qr_code_key').on(t.qrCode),
  ],
);

/**
 * Diseño de un gabinete en cuadrícula (`@silopro/cabinet-engine`). El gabinete
 * es una ubicación de tipo `cabinet`; cada compartimento es una ubicación hija
 * de tipo `drawer` cuyo código es la dirección (A1, B3…).
 */
export const cabinets = pgTable(
  'cabinets',
  {
    id: id(),
    organizationId: orgId(),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id),
    /** `drawers` (gabinete de cajones) o `shelves` (anaquel con charolas). */
    style: text('style').notNull().default('drawers'),
    rows: smallint('rows').notNull(),
    columns: smallint('columns').notNull(),
    addressing: text('addressing').notNull(),
    rowOrigin: text('row_origin').notNull(),
    /** Compartimentos del motor: [{ id, row, column, rowSpan, columnSpan, address }]. */
    compartments: jsonb('compartments').notNull(),
    /** Medidas físicas en mm (`CabinetPhysicalSpec`): vista 3D y, más adelante, CAD. */
    cellWidth: real('cell_width').notNull().default(40),
    cellHeight: real('cell_height').notNull().default(30),
    depth: real('depth').notNull().default(120),
    wallThickness: real('wall_thickness').notNull().default(2),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('cabinets_location_key').on(t.locationId),
    check(
      'cabinets_physical_valid',
      sql`${t.cellWidth} between 5 and 500 and ${t.cellHeight} between 5 and 500 and ${t.depth} between 10 and 1000 and ${t.wallThickness} between 0.4 and 20`,
    ),
    check('cabinets_style_valid', sql`${t.style} in ('drawers', 'shelves')`),
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

/**
 * Reserva de existencias para un uso (proyecto, pedido…). Mientras está activa,
 * `quantity - consumed` cuenta en `stock_levels.reserved` de su ubicación.
 */
export const reservations = pgTable(
  'reservations',
  {
    id: id(),
    organizationId: orgId(),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id),
    quantity: qty('quantity').notNull(),
    consumed: qty('consumed').notNull().default('0'),
    status: reservationStatusEnum('status').notNull().default('active'),
    purpose: text('purpose').notNull(),
    /** Proyecto para el que se apartó, si viene de su lista de materiales. */
    projectId: uuid('project_id').references(() => projects.id),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('reservations_item_idx').on(t.itemId, t.status),
    index('reservations_status_idx').on(t.status, t.createdAt),
    index('reservations_project_idx').on(t.projectId),
    check(
      'reservations_quantities_valid',
      sql`${t.quantity} > 0 and ${t.consumed} >= 0 and ${t.consumed} <= ${t.quantity}`,
    ),
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
    /** Une la salida y la entrada de una transferencia entre ubicaciones. */
    transferId: uuid('transfer_id'),
    /** Reserva que originó un consumo. */
    reservationId: uuid('reservation_id'),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('stock_movements_item_idx').on(t.itemId, t.occurredAt),
    index('stock_movements_transfer_idx').on(t.transferId),
  ],
);

/**
 * Bitácora de auditoría: quién hizo qué y cuándo, por cada cambio aceptado por
 * la API. Inmutable (un trigger impide UPDATE y DELETE) y aislada por RLS.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    organizationId: orgId(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id),
    /** Método y ruta sin el prefijo de la organización: `POST items`, `PATCH items/:id`. */
    action: text('action').notNull(),
    /** Id del registro afectado (artículo, ubicación, miembro, cajón…). */
    entityId: text('entity_id'),
    /** Nombre legible del registro (SKU, código, nombre) al momento del cambio. */
    label: text('label'),
    /** Datos enviados, sin contraseñas ni tokens y recortados si son grandes. */
    details: jsonb('details'),
    ip: text('ip'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_log_org_time_idx').on(t.organizationId, t.occurredAt),
    index('audit_log_entity_idx').on(t.entityId),
  ],
);

export const projectStatusEnum = pgEnum('project_status', ['draft', 'active', 'done', 'cancelled']);

/** Proyectos (o pedidos, órdenes de trabajo) con su lista de materiales. */
export const projects = pgTable(
  'projects',
  {
    id: id(),
    organizationId: orgId(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    status: projectStatusEnum('status').notNull().default('active'),
    dueDate: date('due_date'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => [uniqueIndex('projects_org_code_key').on(t.organizationId, t.code)],
);

/** Líneas de la lista de materiales: cuánto de cada artículo necesita el proyecto. */
export const bomLines = pgTable(
  'bom_lines',
  {
    id: id(),
    organizationId: orgId(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => items.id),
    quantity: qty('quantity').notNull(),
    notes: text('notes'),
    position: integer('position').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('bom_lines_project_item_key').on(t.projectId, t.itemId),
    check('bom_lines_quantity_positive', sql`${t.quantity} > 0`),
  ],
);

/** Preguntas al asistente con IA por organización y mes (cupo del plan y consumo de tokens). */
export const assistantUsage = pgTable(
  'assistant_usage',
  {
    organizationId: orgId(),
    /** Mes calendario UTC, `AAAA-MM`. */
    period: text('period').notNull(),
    questions: integer('questions').notNull().default(0),
    inputTokens: bigint('input_tokens', { mode: 'number' }).notNull().default(0),
    outputTokens: bigint('output_tokens', { mode: 'number' }).notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.period] })],
);
