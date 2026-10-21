import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

export const CSRF_HEADER = 'x-silopro-request';
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Protección CSRF: las peticiones que modifican datos deben incluir la
 * cabecera `X-SiloPro-Request: 1`. Un formulario o enlace de otro sitio no
 * puede añadirla, y un `fetch` entre orígenes con cabeceras personalizadas
 * exige una verificación CORS que solo superan los orígenes permitidos.
 * Complementa a la cookie `SameSite=Lax`.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE.has(req.method) || req.get(CSRF_HEADER) === '1') return true;
    throw new ForbiddenException({
      code: 'CSRF',
      message: 'Falta la cabecera de seguridad de la petición',
    });
  }
}
