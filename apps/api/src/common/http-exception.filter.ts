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
    } else {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
      body = { status: 500, code: 'INTERNAL_ERROR', message: 'Error interno del servidor' };
    }

    res.status(body.status).json(body);
  }
}
