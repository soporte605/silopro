import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { HttpExceptionFilter } from './common/http-exception.filter.js';
import type { Env } from './config/env.js';

/** Configuración común de la aplicación, compartida por main.ts y las pruebas. */
export function configureApp(app: INestApplication, env: Env): void {
  const express = app as NestExpressApplication;
  // Detrás de nginx (Docker y, en un servidor, el que termina HTTPS): confía en
  // esos proxies para obtener la IP real del cliente.
  express.set('trust proxy', env.TRUST_PROXY_HOPS);
  app.setGlobalPrefix('api');
  // El diseño completo de un gabinete de 60×60 ronda los 350 KB.
  express.useBodyParser('json', { limit: '1mb' });
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: true });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();
}
