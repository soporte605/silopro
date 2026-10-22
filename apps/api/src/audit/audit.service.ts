import { Inject, Injectable } from '@nestjs/common';
import type { AuditEntry, AuditPage, auditQuerySchema } from '@silopro/contracts';
import { and, desc, eq, gte, lt, type SQL, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { OrgContext } from '../auth/request-context.js';
import { DbService } from '../db/db.service.js';
import { iso } from '../db/mappers.js';
import { auditLog, users } from '../db/schema.js';

export interface AuditRecord {
  action: string;
  entityId: string | null;
  label: string | null;
  details: unknown;
  ip: string | null;
}

/** Datos que nunca se guardan en la bitácora. */
const SECRET_KEY = /pass|token|secret/i;
/** Más que esto (JSON) y solo se guardan los nombres de los campos. */
const MAX_DETAILS = 4000;

/** Quita secretos y recorta lo grande (p. ej. el diseño completo de un gabinete). */
export function sanitizeDetails(body: unknown): unknown {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
  const clean = Object.fromEntries(
    Object.entries(body as Record<string, unknown>).filter(([k]) => !SECRET_KEY.test(k)),
  );
  if (!Object.keys(clean).length) return null;
  return JSON.stringify(clean).length > MAX_DETAILS
    ? { recortado: true, campos: Object.keys(clean) }
    : clean;
}

@Injectable()
export class AuditService {
  constructor(@Inject(DbService) private readonly dbs: DbService) {}

  record(ctx: OrgContext, r: AuditRecord): Promise<void> {
    return this.dbs.tenant(ctx, async (tx) => {
      await tx.insert(auditLog).values({
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: r.action,
        entityId: r.entityId,
        label: r.label?.slice(0, 200) ?? null,
        details: r.details ?? null,
        ip: r.ip,
      });
    });
  }

  list(ctx: OrgContext, q: z.output<typeof auditQuerySchema>): Promise<AuditPage> {
    return this.dbs.tenant(ctx, async (tx) => {
      const where: SQL[] = [];
      if (q.actorId) where.push(eq(auditLog.actorId, q.actorId));
      if (q.entityId) where.push(eq(auditLog.entityId, q.entityId));
      if (q.from) where.push(gte(auditLog.occurredAt, new Date(`${q.from}T00:00:00Z`)));
      if (q.to) where.push(sql`${auditLog.occurredAt} < (${q.to}::date + 1)`);
      if (q.before) where.push(lt(auditLog.id, q.before));
      const rows = await tx
        .select({ a: auditLog, actorName: users.name })
        .from(auditLog)
        .innerJoin(users, eq(users.id, auditLog.actorId))
        .where(and(...where))
        .orderBy(desc(auditLog.id))
        .limit(q.limit + 1);
      const entries: AuditEntry[] = rows.slice(0, q.limit).map(({ a, actorName }) => ({
        id: a.id,
        action: a.action,
        entityId: a.entityId,
        label: a.label,
        details: a.details,
        actorId: a.actorId,
        actorName,
        occurredAt: iso(a.occurredAt),
      }));
      return {
        entries,
        nextCursor: rows.length > q.limit ? entries[entries.length - 1]!.id : null,
      };
    });
  }
}
