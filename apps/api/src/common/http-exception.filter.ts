import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ApiError } from '@silopro/contracts';
import type { Response } from 'express';
import { pgCode } from './pg-errors.js';

/** Violaciones de restricciones de PostgreSQL que son errores del cliente. */
const PG_ERRORS: Record<string, ApiError> = {
  '23505': {
    status: 409,
    code: 'DUPLICATE',
    message: 'Ya existe un registro con ese identificador',
  },
  '23503': {
    status: 422,
    code: 'INVALID_REFERENCE',
    message: 'Referencia a un registro inexistente',
  },
  '23514': {
    status: 409,
    code: 'CONSTRAINT',
    message: 'La operación viola una regla de consistencia',
  },
  '40001': {
    status: 409,
    code: 'CONCURRENT_UPDATE',
    message: 'Conflicto de concurrencia; reintente',
  },
  '22P02': { status: 400, code: 'INVALID_INPUT', message: 'Formato de dato inválido' },
};

/**
 * Normaliza todas las respuestas de error al formato `ApiError`.
 * Los errores no controlados se registran en el servidor y se responden con
 * un mensaje genérico para no filtrar detalles internos.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    let body: ApiError;

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const obj =
        typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
      body = {
        status,
        code: typeof obj['code'] === 'string' ? obj['code'] : (HttpStatus[status] ?? 'ERROR'),
        message: typeof obj['message'] === 'string' ? obj['message'] : exception.message,
        ...(obj['details'] !== undefined ? { details: obj['details'] } : {}),
      };
    } else if (pgCode(exception) && PG_ERRORS[pgCode(exception)!]) {
      body = PG_ERRORS[pgCode(exception)!]!;
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
      body = { status: 500, code: 'INTERNAL_ERROR', message: 'Error interno del servidor' };
    }

    res.status(body.status).json(body);
  }
}
