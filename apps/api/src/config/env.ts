import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:4200')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }).optional(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Valida las variables de entorno al arrancar. Falla rápido con un mensaje
 * claro en lugar de descubrir la configuración incorrecta en tiempo de ejecución.
 * Los valores nunca se imprimen, solo los nombres de las variables inválidas.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Configuración inválida en: ${fields}`);
  }
  return parsed.data;
}

export const ENV = Symbol('ENV');
