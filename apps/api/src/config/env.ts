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
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  /** Aplica migraciones pendientes al arrancar (útil en Docker). */
  MIGRATE_ON_START: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /** Duración de la sesión en días. */
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(14),
  /** Cookie de sesión solo por HTTPS. Por defecto, activado en producción. */
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  /** Carpeta privada para fotografías (fuera de cualquier raíz web pública). */
  UPLOADS_DIR: z.string().min(1).default('./data/uploads'),
  /** Origen público de la web, para construir enlaces de invitación. */
  PUBLIC_WEB_URL: z.url().default('http://localhost:4200'),
  /**
   * Proxies de confianza delante de la API: 1 con el nginx del contenedor web;
   * 2 si además hay un nginx en el servidor que termina HTTPS.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
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
