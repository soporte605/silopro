import { HttpException, HttpStatus } from '@nestjs/common';
import type { PlanUsage } from '@silopro/contracts';
import { type LimitKind, PLANS, planState, type PlanState, withinLimit } from '@silopro/domain';
import { sql } from 'drizzle-orm';
import type { Tx } from '../db/db.service.js';

type OrgRow = {
  plan: string;
  trial_ends_at: Date | string | null;
  subscription_status: string | null;
};

/** Plan efectivo de la organización activa (bajo RLS); con `lock`, bloquea su fila. */
export async function orgPlan(tx: Tx, organizationId: string, lock = false): Promise<PlanState> {
  const res = await tx.execute<OrgRow>(sql`
    select plan, trial_ends_at, subscription_status from organizations
    where id = ${organizationId} ${lock ? sql`for update` : sql``}`);
  const r = res.rows[0];
  return planState({
    plan: r?.plan ?? 'trial',
    trialEndsAt: r?.trial_ends_at ? new Date(r.trial_ends_at) : null,
    subscriptionStatus: r?.subscription_status ?? null,
  });
}

/** Lo que usa la organización de cada límite. */
export async function orgUsage(tx: Tx, organizationId: string): Promise<PlanUsage> {
  const res = await tx.execute<{ members: number; items: number; photo_bytes: string }>(sql`
    select
      (select count(*) from memberships where organization_id = ${organizationId})::int
      + (select count(*) from invitations where organization_id = ${organizationId}
          and accepted_at is null and revoked_at is null and expires_at > now())::int as members,
      (select count(*) from items where organization_id = ${organizationId}
          and archived_at is null)::int as items,
      (select coalesce(sum(bytes), 0) from item_photos
          where organization_id = ${organizationId})::bigint as photo_bytes`);
  const r = res.rows[0]!;
  return { members: r.members, items: r.items, photoBytes: Number(r.photo_bytes) };
}

const WHAT: Record<LimitKind, (n: number) => string> = {
  members: (n) => `hasta ${n.toLocaleString('es-MX')} usuarios (contando invitaciones pendientes)`,
  items: (n) => `hasta ${n.toLocaleString('es-MX')} artículos`,
  photoBytes: (n) => `hasta ${Math.round(n / 1024 ** 3)} GB de fotografías`,
};

/**
 * Lanza `402 PLAN_LIMIT` si agregar `adding` supera el límite del plan.
 * Bloquea la fila de la organización: dos altas simultáneas no lo rebasan.
 */
export async function assertWithinPlan(
  tx: Tx,
  organizationId: string,
  kind: LimitKind,
  adding = 1,
): Promise<void> {
  const state = await orgPlan(tx, organizationId, true);
  const limit = state.limits[kind];
  if (limit === null) return;
  const used = (await orgUsage(tx, organizationId))[kind];
  if (withinLimit(limit, used, adding)) return;
  throw new HttpException(
    {
      code: 'PLAN_LIMIT',
      message: `Su plan ${PLANS[state.plan].name} permite ${WHAT[kind](limit)}. Cambie de plan en «Plan y facturación» para agregar más.`,
      details: { kind, limit, used },
    },
    HttpStatus.PAYMENT_REQUIRED,
  );
}
