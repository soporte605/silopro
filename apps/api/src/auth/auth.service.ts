import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { LoginInput, Me, RegisterInput, ResetPasswordInput } from '@silopro/contracts';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { v7 as uuidv7 } from 'uuid';
import { ENV, type Env } from '../config/env.js';
import { DbService, type Tx } from '../db/db.service.js';
import { authTokens, memberships, organizations, sessions, units, users } from '../db/schema.js';
import { MailService } from '../mail/mail.service.js';
import { resetPasswordMail, verifyEmailMail } from '../mail/templates.js';
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
  /** Correos de recuperación y de confirmación: pocos por hora para no usarse como spam. */
  private readonly mailLimiter = new RateLimiter(3, 60 * 60_000);

  constructor(
    @Inject(DbService) private readonly dbs: DbService,
    @Inject(ENV) private readonly env: Env,
    @Inject(MailService) private readonly mail: MailService,
  ) {}

  async register(input: RegisterInput, userAgent?: string): Promise<{ token: string; me: Me }> {
    const passwordHash = await hashPassword(input.password);
    const db = this.dbs.db;
    let created: { token: string; me: Me };
    try {
      created = await db.transaction(async (tx) => {
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
            user: { id: user.id, email: user.email, name: user.name, emailVerified: false },
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
    await this.sendVerification(created.me.user);
    return created;
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
    const [u] = await this.dbs.db
      .select({ verifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.id, user.id));
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
    return {
      user: { id: user.id, email: user.email, name: user.name, emailVerified: !!u?.verifiedAt },
      memberships: rows,
    };
  }

  // ── Enlaces por correo ────────────────────────────────────────────────────

  private link(path: string, token: string): string {
    return `${this.env.PUBLIC_WEB_URL.replace(/\/+$/, '')}${path}?token=${token}`;
  }

  /** Crea un token de un solo uso; invalida los anteriores del mismo propósito. */
  private async issueToken(
    userId: string,
    purpose: 'verify_email' | 'reset_password',
    ttlMs: number,
  ): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.dbs.db.transaction(async (tx) => {
      await tx
        .update(authTokens)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(authTokens.userId, userId),
            eq(authTokens.purpose, purpose),
            isNull(authTokens.usedAt),
          ),
        );
      await tx.insert(authTokens).values({
        userId,
        purpose,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + ttlMs),
      });
    });
    return token;
  }

  /** Marca el token como usado y devuelve su usuario, si es válido y vigente. */
  private async consumeToken(
    tx: Tx,
    token: string,
    purpose: 'verify_email' | 'reset_password',
  ): Promise<string | null> {
    const [row] = await tx
      .update(authTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(authTokens.tokenHash, hashToken(token)),
          eq(authTokens.purpose, purpose),
          isNull(authTokens.usedAt),
          gt(authTokens.expiresAt, new Date()),
        ),
      )
      .returning({ userId: authTokens.userId });
    return row?.userId ?? null;
  }

  private tooMany(): never {
    throw new HttpException(
      {
        code: 'TOO_MANY_ATTEMPTS',
        message: 'Ya enviamos varios correos. Intente de nuevo en una hora.',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private async sendVerification(user: { id: string; email: string; name: string }) {
    const token = await this.issueToken(user.id, 'verify_email', 24 * 3_600_000);
    await this.mail.send(
      verifyEmailMail(user.email, user.name, this.link('/verificar-correo', token)),
    );
  }

  /** Reenvía el enlace de confirmación al usuario con sesión. */
  async resendVerification(user: AuthUser): Promise<void> {
    if ((await this.me(user)).user.emailVerified) return;
    if (!this.mailLimiter.hit(`verify|${user.id}`)) this.tooMany();
    await this.sendVerification(user);
  }

  async verifyEmail(token: string): Promise<void> {
    await this.dbs.db.transaction(async (tx) => {
      const userId = await this.consumeToken(tx, token, 'verify_email');
      if (!userId) {
        throw new BadRequestException({
          code: 'INVALID_LINK',
          message: 'El enlace no es válido o ya venció. Pida uno nuevo desde la app.',
        });
      }
      await tx
        .update(users)
        .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(users.id, userId), isNull(users.emailVerifiedAt)));
    });
  }

  /**
   * Envía el enlace para restablecer la contraseña. Responde igual exista o no
   * la cuenta, para no revelar qué correos están registrados.
   */
  async forgotPassword(email: string, ip: string): Promise<void> {
    if (!this.mailLimiter.hit(`reset|${ip}|${email}`)) this.tooMany();
    const [user] = await this.dbs.db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);
    if (!user) return;
    const token = await this.issueToken(user.id, 'reset_password', 3_600_000);
    await this.mail.send(
      resetPasswordMail(user.email, user.name, this.link('/restablecer-contrasena', token)),
    );
  }

  /** Cambia la contraseña con el enlace y cierra todas las sesiones abiertas. */
  async resetPassword(input: ResetPasswordInput): Promise<void> {
    const passwordHash = await hashPassword(input.password);
    await this.dbs.db.transaction(async (tx) => {
      const userId = await this.consumeToken(tx, input.token, 'reset_password');
      if (!userId) {
        throw new BadRequestException({
          code: 'INVALID_LINK',
          message: 'El enlace no es válido o ya venció. Pida uno nuevo.',
        });
      }
      // Quien recibió el enlace demostró que el correo es suyo.
      await tx
        .update(users)
        .set({
          passwordHash,
          emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, now())`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
      await tx.delete(sessions).where(eq(sessions.userId, userId));
    });
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
