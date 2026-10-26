import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  SetMetadata,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { can, type Permission, planState, type Role } from '@silopro/domain';
import { and, eq } from 'drizzle-orm';
import { DbService } from '../db/db.service.js';
import { memberships, organizations } from '../db/schema.js';
import { AuthService } from './auth.service.js';
import {
  type AppRequest,
  type AuthUser,
  type OrgContext,
  SESSION_COOKIE,
} from './request-context.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Exige una sesión válida y expone `req.user`. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AppRequest>();
    const token = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    const user = token ? await this.auth.resolveSession(token) : null;
    if (!user)
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Inicie sesión' });
    req.user = user;
    return true;
  }
}

export const ALLOW_READ_ONLY_KEY = 'allowReadOnly';
/** El manejador funciona aunque la organización esté en solo lectura (p. ej. pagar). */
export const AllowReadOnly = () => SetMetadata(ALLOW_READ_ONLY_KEY, true);

export const PERMISSION_KEY = 'permission';
/** Permiso requerido por el manejador (ver `@silopro/domain/permissions`). */
export const RequirePermission = (p: Permission) => SetMetadata(PERMISSION_KEY, p);

/**
 * Resuelve la organización de la ruta (`/orgs/:orgId/...`), comprueba la
 * membresía del usuario y el permiso requerido. Una organización ajena
 * responde 404 para no revelar su existencia.
 */
@Injectable()
export class OrgGuard implements CanActivate {
  constructor(
    @Inject(DbService) private readonly dbs: DbService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AppRequest>();
    const user = req.user;
    if (!user)
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Inicie sesión' });
    const orgId = String(req.params['orgId'] ?? '');
    const notFound = new NotFoundException({
      code: 'NOT_FOUND',
      message: 'Organización no encontrada',
    });
    if (!UUID.test(orgId)) throw notFound;

    const [m] = await this.dbs.tenant({ userId: user.id, organizationId: orgId }, (tx) =>
      tx
        .select({
          role: memberships.role,
          plan: organizations.plan,
          trialEndsAt: organizations.trialEndsAt,
          subscriptionStatus: organizations.subscriptionStatus,
        })
        .from(memberships)
        .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
        .where(and(eq(memberships.organizationId, orgId), eq(memberships.userId, user.id)))
        .limit(1),
    );
    if (!m) throw notFound;

    const permission = this.reflector.getAllAndOverride<Permission | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (permission && !can(m.role as Role, permission)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Su rol no permite esta acción' });
    }
    const write = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (
      write &&
      planState(m).readOnly &&
      !this.reflector.getAllAndOverride<boolean>(ALLOW_READ_ONLY_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      throw new HttpException(
        {
          code: 'READ_ONLY',
          message:
            'La prueba gratis terminó o la suscripción no está activa: puede consultar todo, pero para hacer cambios elija un plan en «Plan y facturación».',
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    req.org = { userId: user.id, organizationId: orgId, role: m.role as Role };
    return true;
  }
}

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest<AppRequest>().user!,
);

export const Org = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): OrgContext =>
    ctx.switchToHttp().getRequest<AppRequest>().org!,
);
