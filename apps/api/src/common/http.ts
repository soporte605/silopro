import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';

export const notFound = (what: string) =>
  new NotFoundException({ code: 'NOT_FOUND', message: `${what} no encontrado` });

export const staleVersion = () =>
  new ConflictException({
    code: 'STALE_VERSION',
    message: 'El registro fue modificado por otra persona. Recargue e intente de nuevo.',
  });

export const invalid = (message: string, details?: unknown) =>
  new UnprocessableEntityException({ code: 'UNPROCESSABLE', message, details });
