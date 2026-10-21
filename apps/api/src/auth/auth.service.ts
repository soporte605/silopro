import {
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { LoginInput, Me, RegisterInput } from '@silopro/contracts';
import { and, eq, gt, sql } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { v7 as uuidv7 } from 'uuid';
import { ENV, type Env } from '../config/env.js';
import { DbService, type Tx } from '../db/db.service.js';
import { memberships, organizations, sessions, units, users } from '../db/schema.js';
import { isUniqueViolation } from '../common/pg-errors.js';
import { dummyHash, hashPassword, verifyPassword } from './password.js';
import { RateLimiter } from './rate-limiter.js';
import type { AuthUser } from './request-context.js';

/** Unidades con las que nace cada organización. */
const DEFAULT_UNITS = [
  { code: 'pza', name: 'Pieza', symbol: 'pza', decimals: 0 },
  { code: 'm', name: 'Metro', symbol: 'm', decimals: 2 },
  { code: 'kg', name: 'Kilogramo', symbol: 'kg', decimals: 3 },
  { code: 'l', name: 'Litro', symbol: 'L', decimals: 3 },
  { code: 'par', name: 'Par', symbol: 'par', decimals: 0 },
  { code: 'caja', name: 'Caja', symbol: 'caja', decimals: 0 },
];

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly loginLimiter = new RateLimiter(10, 15 * 60_000);

  constructor(
    @Inject(DbService) private readonly dbs: DbService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async register(input: RegisterInput, userAgent?: string): Promise<{ token: string; me: Me }> {
    const passwordHash = await hashPassword(input.password);
    const db = this.dbs.db;
    try {
      return await db.transaction(async (tx) => {
        const [user] = await tx
          .insert(users)
          .values({ email: input.email, name: input.name, passwordHash })
          .returning();
        if (!user) throw new Error('No se creó el usuario');
        const orgId = await this.createOrganization(tx, user.id, input.organizationName);
        const token = await this.createSession(tx, user.id, userAgent);
        return {
          token,
          me: {
            user: { id: user.id, email: user.email, name: user.name },
            memberships: [
              { organizationId: orgId, organizationName: input.organizationName, role: 'owner' },
            ],
          },
        };
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictException({
          code: 'EMAIL_TAKEN',
          message: 'Ya existe una cuenta con ese correo',
        });
      }
      throw e;
    }
  }

  /** Crea la organización con su propietario y unidades por defecto (bajo RLS). */
  private async createOrganization(tx: Tx, userId: string, name: string): Promise<string> {
    const orgId = uuidv7();
    await tx.execute(
      sql`select set_config('app.user_id', ${userId}, true), set_config('app.organization_id', ${orgId}, true)`,
    );
    await tx.insert(organizations).values({ id: orgId, name });
    await tx.insert(memberships).values({ organizationId: orgId, userId, role: 'owner' });
    await tx.insert(units).values(DEFAULT_UNITS.map((u) => ({ ...u, organizationId: orgId })));
    return orgId;
  }

  async login(
    input: LoginInput,
    ip: string,
    userAgent?: string,
  ): Promise<{ token: string; me: Me }> {
    const key = `${ip}|${input.email}`;
    if (!this.loginLimiter.hit(key)) {
      throw new HttpException(
        {
          code: 'TOO_MANY_ATTEMPTS',
          message: 'Demasiados intentos. Intente de nuevo en unos minutos.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const [user] = await this.dbs.db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${input.email}`)
      .limit(1);
    const ok = user
      ? await verifyPassword(user.passwordHash, input.password)
      : (await verifyPassword(await dummyHash(), input.password), false);
    if (!user || !ok) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Correo o contraseña incorrectos',
      });
    }
    this.loginLimiter.reset(key);
    const token = await this.createSession(this.dbs.db, user.id, userAgent);
    return { token, me: await this.me(user) };
  }

  async logout(sessionId: string): Promise<void> {
    await this.dbs.db.delete(sessions).where(eq(sessions.id, sessionId));
  }

  /** Resuelve el token de la cookie a un usuario, si la sesión es válida. */
  async resolveSession(token: string): Promise<AuthUser | null> {
    if (!token || token.length > 100) return null;
    const id = hashToken(token);
    const [row] = await this.dbs.db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())))
      .limit(1);
    return row ? { ...row, sessionId: id } : null;
  }

  async me(user: { id: string; email: string; name: string }): Promise<Me> {
    const rows = await this.dbs.tenant({ userId: user.id, organizationId: null }, (tx) =>
      tx
        .select({
          organizationId: memberships.organizationId,
          organizationName: organizations.name,
          role: memberships.role,
        })
        .from(memberships)
        .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
        .where(eq(memberships.userId, user.id))
        .orderBy(organizations.name),
    );
    return { user: { id: user.id, email: user.email, name: user.name }, memberships: rows };
  }

  private async createSession(
    db: Pick<Tx, 'insert'>,
    userId: string,
    userAgent?: string,
  ): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.env.SESSION_TTL_DAYS * 86_400_000);
    await db.insert(sessions).values({
      id: hashToken(token),
      userId,
      expiresAt,
      userAgent: userAgent?.slice(0, 300) ?? null,
    });
    return token;
  }

  cookieOptions() {
    const secure =
      this.env.COOKIE_SECURE !== undefined
        ? this.env.COOKIE_SECURE === 'true'
        : this.env.NODE_ENV === 'production';
    return {
      httpOnly: true,
      secure,
      sameSite: 'lax' as const,
      path: '/',
      maxAge: this.env.SESSION_TTL_DAYS * 86_400_000,
    };
  }
}
