import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { from, mergeMap, type Observable } from 'rxjs';
import type { AppRequest } from '../auth/request-context.js';
import { AuditService, sanitizeDetails } from './audit.service.js';

const ORG_PREFIX = /^\/?(?:api\/)?orgs\/:orgId\/?/;

/** Primer texto legible de la respuesta o de lo enviado (SKU, código, nombre…). */
function labelOf(...sources: unknown[]): string | null {
  for (const s of sources) {
    if (!s || typeof s !== 'object') continue;
    const o = s as Record<string, unknown>;
    for (const key of ['sku', 'path', 'code', 'name', 'email', 'purpose']) {
      if (typeof o[key] === 'string' && o[key]) {
        return key === 'sku' && typeof o['name'] === 'string'
          ? `${o[key]} · ${o['name']}`
          : (o[key] as string);
      }
    }
  }
  return null;
}

/**
 * Registra en la bitácora cada cambio aceptado (POST, PUT, PATCH, DELETE) dentro
 * de una organización. Se escribe después de la operación; si la bitácora
 * fallara, la operación ya hecha no se revierte, pero queda en el registro de
 * errores del servidor.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Auditoría');

  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AppRequest>();
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      return next.handle();
    }
    return next.handle().pipe(
      mergeMap((result) => {
        const ctx = req.org;
        const routePath = (req.route as { path?: string } | undefined)?.path;
        if (!ctx || !routePath || !ORG_PREFIX.test(routePath)) return from([result]);
        const params = req.params as Record<string, string>;
        const body = req.body as unknown;
        const res = result as Record<string, unknown> | undefined;
        const entityId =
          params['id'] ??
          params['userId'] ??
          params['photoId'] ??
          (typeof res?.['id'] === 'string' ? (res['id'] as string) : null) ??
          params['itemId'] ??
          null;
        const write = this.audit
          .record(ctx, {
            action: `${req.method} ${routePath.replace(ORG_PREFIX, '')}`,
            entityId: params['compartmentId'] ? `${entityId}/${params['compartmentId']}` : entityId,
            label: labelOf(res, body),
            details: sanitizeDetails(body),
            ip: req.ip ?? null,
          })
          .catch((e: unknown) => this.logger.error(`No se pudo registrar: ${String(e)}`));
        return from(write.then(() => result));
      }),
    );
  }
}
