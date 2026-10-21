import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  uptimeSeconds: z.number().nonnegative(),
  checks: z.record(z.string(), z.enum(['up', 'down', 'skipped'])),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
