import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import type { Env } from './config/env.js';
import { HttpExceptionFilter } from './common/http-exception.filter.js';

/** Configuración común de la aplicación, compartida por main.ts y las pruebas. */
export function configureApp(app: INestApplication, env: Env): void {
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: true });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();
}
