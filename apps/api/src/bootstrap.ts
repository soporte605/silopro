import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { HttpExceptionFilter } from './common/http-exception.filter.js';
import type { Env } from './config/env.js';

/** Configuración común de la aplicación, compartida por main.ts y las pruebas. */
export function configureApp(app: INestApplication, env: Env): void {
  const express = app as NestExpressApplication;
  // Detrás de nginx (Docker): confía en el primer proxy para obtener la IP real.
  express.set('trust proxy', 1);
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: true });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();
}
