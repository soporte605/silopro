import { z } from 'zod';

/** Identificadores públicos: UUID v7 (ordenables en el tiempo, seguros para sincronización). */
export const idSchema = z.uuid({ version: 'v7' });

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(200).optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Formato de error uniforme de la API (inspirado en RFC 9457). */
export const apiErrorSchema = z.object({
  status: z.number().int(),
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
