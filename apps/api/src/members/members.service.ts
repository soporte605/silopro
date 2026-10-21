import { randomBytes } from 'node:crypto';
import { ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import {
  INVITATION_TTL_DAYS,
  type Invitation,
  type InvitationCreated,
  type invitationInputSchema,
  type InvitationPreview,
  type InvitationStatus,
  type Member,
} from '@silopro/contracts';
import { checkMembershipChange, type MembershipViolation, type Role } from '@silopro/domain';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { z } from 'zod';
import { hashToken } from '../auth/auth.service.js';
import type { AuthUser, OrgContext } from '../auth/request-context.js';
import { invalid, notFound } from '../common/http.js';
import { ENV, type Env } from '../config/env.js';
import { DbService, type Tx } from '../db/db.service.js';
import { invitations, memberships, organizations, users } from '../db/schema.js';

const VIOLATIONS: Record<MembershipViolation, string> = {
  FORBIDDEN: 'Su rol no permite administrar miembros',
  OWNER_ONLY: 'Solo un propietario puede asignar o modificar propietarios',
  LAST_OWNER: 'La organización debe conservar al menos un propietario',
};

function reject(v: MembershipViolation): never {
  if (v === 'LAST_OWNER') throw new ConflictException({ code: v, message: VIOLATIONS[v] });
  throw new ForbiddenException({ code: v, message: VIOLATIONS[v] });
}

/** Token del enlace: 32 bytes aleatorios; en la BD solo se guarda su hash. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

@Injectable()
export class MembersService {
  constructor(
    @Inject(DbService) private readonly dbs: DbService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  list(ctx: OrgContext): Promise<Member[]> {
    return this.dbs.tenant(ctx, async (tx) => {
      const rows = await tx
        .select({
          userId: memberships.userId,
          name: users.name,
          email: users.email,
          role: memberships.role,
          joinedAt: memberships.createdAt,
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(eq(memberships.organizationId, ctx.organizationId))
        .orderBy(asc(users.name));
      return rows.map((r) => ({ ...r, joinedAt: r.joinedAt.toISOString() }));
    });
  }

  updateRole(ctx: OrgContext, userId: string, role: Role): Promise<Member[]> {
    return this.dbs
      .tenant(ctx, async (tx) => {
        const current = await this.lockMember(tx, ctx, userId);
        const v = checkMembershipChange({
          actor: ctx.role,
          current,
          next: role,
          ownerCount: await this.ownerCount(tx, ctx),
          self: userId === ctx.userId,
        });
        if (v) reject(v);
        await tx
          .update(memberships)
          .set({ role })
          .where(
            and(eq(memberships.organizationId, ctx.organizationId), eq(memberships.userId, userId)),
          );
      })
      .then(() => this.list(ctx));
  }

  async remove(ctx: OrgContext, userId: string): Promise<void> {
    await this.dbs.tenant(ctx, async (tx) => {
      const current = await this.lockMember(tx, ctx, userId);
      const v = checkMembershipChange({
        actor: ctx.role,
        current,
        next: null,
        ownerCount: await this.ownerCount(tx, ctx),
        self: userId === ctx.userId,
      });
      if (v) reject(v);
      await tx
        .delete(memberships)
        .where(
          and(eq(memberships.organizationId, ctx.organizationId), eq(memberships.userId, userId)),
        );
    });
  }

  // ── Invitaciones ─────────────────────────────────────────────────────────

  listInvitations(ctx: OrgContext): Promise<Invitation[]> {
    return this.dbs.tenant(ctx, async (tx) => {
      const rows = await this.invitationQuery(tx)
        .where(eq(invitations.organizationId, ctx.organizationId))
        .orderBy(desc(invitations.createdAt))
        .limit(100);
      return rows.map(toInvitation);
    });
  }

  createInvitation(
    ctx: OrgContext,
    input: z.output<typeof invitationInputSchema>,
  ): Promise<InvitationCreated> {
    return this.dbs.tenant(ctx, async (tx) => {
      const v = checkMembershipChange({
        actor: ctx.role,
        current: null,
        next: input.role,
        ownerCount: await this.ownerCount(tx, ctx),
      });
      if (v) reject(v);

      const [already] = await tx
        .select({ userId: memberships.userId })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(
          and(eq(memberships.organizationId, ctx.organizationId), eq(users.email, input.email)),
        );
      if (already) {
        throw new ConflictException({
          code: 'ALREADY_MEMBER',
          message: 'Esa persona ya es miembro de la organización',
        });
      }

      const token = randomBytes(32).toString('base64url');
      const [row] = await tx
        .insert(invitations)
        .values({
          organizationId: ctx.organizationId,
          email: input.email,
          role: input.role,
          tokenHash: hashToken(token),
          invitedBy: ctx.userId,
          expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000),
        })
        .returning({ id: invitations.id });
      const [full] = await this.invitationQuery(tx).where(eq(invitations.id, row!.id));
      const base = this.env.PUBLIC_WEB_URL.replace(/\/+$/, '');
      return {
        ...toInvitation(full!),
        url: `${base}/invitacion/${ctx.organizationId}/${token}`,
      };
    });
  }

  async revokeInvitation(ctx: OrgContext, id: string): Promise<void> {
    await this.dbs.tenant(ctx, async (tx) => {
      const [inv] = await tx
        .select({ role: invitations.role, acceptedAt: invitations.acceptedAt })
        .from(invitations)
        .where(eq(invitations.id, id));
      if (!inv) throw notFound('Invitación');
      if (inv.role === 'owner' && ctx.role !== 'owner') reject('OWNER_ONLY');
      if (inv.acceptedAt) throw invalid('La invitación ya fue aceptada');
      await tx.update(invitations).set({ revokedAt: new Date() }).where(eq(invitations.id, id));
    });
  }

  /**
   * Vista previa de un enlace. No requiere sesión: quien conoce el enlace ya
   * tiene el secreto. Se ejecuta con el contexto RLS de esa organización.
   */
  async preview(orgId: string, token: string): Promise<InvitationPreview> {
    if (!TOKEN.test(token)) throw notFound('Invitación');
    return this.dbs.tenant({ userId: '', organizationId: orgId }, async (tx) => {
      const [row] = await this.invitationQuery(tx).where(
        eq(invitations.tokenHash, hashToken(token)),
      );
      if (!row) throw notFound('Invitación');
      const [org] = await tx
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, orgId));
      const inv = toInvitation(row);
      return {
        organizationName: org!.name,
        email: inv.email,
        role: inv.role,
        invitedByName: inv.invitedByName,
        status: inv.status,
        expiresAt: inv.expiresAt,
      };
    });
  }

  /** Acepta la invitación con la cuenta en sesión (su correo debe coincidir). */
  async accept(user: AuthUser, orgId: string, token: string): Promise<{ organizationId: string }> {
    if (!TOKEN.test(token)) throw notFound('Invitación');
    return this.dbs.tenant({ userId: user.id, organizationId: orgId }, async (tx) => {
      const [inv] = await tx
        .select()
        .from(invitations)
        .where(eq(invitations.tokenHash, hashToken(token)))
        .for('update');
      if (!inv) throw notFound('Invitación');
      const status = statusOf(inv);
      if (status !== 'pending') {
        throw new ConflictException({
          code: `INVITATION_${status.toUpperCase()}`,
          message:
            status === 'expired'
              ? 'La invitación venció; pida una nueva'
              : status === 'revoked'
                ? 'La invitación fue cancelada'
                : 'La invitación ya fue usada',
        });
      }
      if (inv.email !== user.email.toLowerCase()) {
        throw new ForbiddenException({
          code: 'INVITATION_EMAIL_MISMATCH',
          message: `Esta invitación es para ${inv.email}. Inicie sesión con esa cuenta.`,
        });
      }
      const [existing] = await tx
        .select({ role: memberships.role })
        .from(memberships)
        .where(and(eq(memberships.organizationId, orgId), eq(memberships.userId, user.id)));
      if (existing) {
        throw new ConflictException({
          code: 'ALREADY_MEMBER',
          message: 'Ya es miembro de esta organización',
        });
      }
      await tx
        .insert(memberships)
        .values({ organizationId: orgId, userId: user.id, role: inv.role });
      await tx
        .update(invitations)
        .set({ acceptedAt: new Date(), acceptedBy: user.id })
        .where(eq(invitations.id, inv.id));
      return { organizationId: orgId };
    });
  }

  // ── auxiliares ───────────────────────────────────────────────────────────

  private async lockMember(tx: Tx, ctx: OrgContext, userId: string): Promise<Role> {
    const [m] = await tx
      .select({ role: memberships.role })
      .from(memberships)
      .where(
        and(eq(memberships.organizationId, ctx.organizationId), eq(memberships.userId, userId)),
      )
      .for('update');
    if (!m) throw notFound('Miembro');
    return m.role;
  }

  private async ownerCount(tx: Tx, ctx: OrgContext): Promise<number> {
    // Bloquea las filas de propietarios: dos degradaciones simultáneas no pueden
    // dejar la organización sin propietario.
    const owners = await tx
      .select({ userId: memberships.userId })
      .from(memberships)
      .where(and(eq(memberships.organizationId, ctx.organizationId), eq(memberships.role, 'owner')))
      .for('update');
    return owners.length;
  }

  private invitationQuery(tx: Tx) {
    return tx
      .select({ inv: invitations, invitedByName: users.name })
      .from(invitations)
      .innerJoin(users, eq(users.id, invitations.invitedBy))
      .$dynamic();
  }
}

function statusOf(inv: typeof invitations.$inferSelect): InvitationStatus {
  if (inv.acceptedAt) return 'accepted';
  if (inv.revokedAt) return 'revoked';
  if (inv.expiresAt.getTime() <= Date.now()) return 'expired';
  return 'pending';
}

function toInvitation(r: {
  inv: typeof invitations.$inferSelect;
  invitedByName: string;
}): Invitation {
  return {
    id: r.inv.id,
    email: r.inv.email,
    role: r.inv.role,
    invitedByName: r.invitedByName,
    status: statusOf(r.inv),
    expiresAt: r.inv.expiresAt.toISOString(),
    createdAt: r.inv.createdAt.toISOString(),
  };
}
