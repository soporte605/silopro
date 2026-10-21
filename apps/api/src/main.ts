import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './bootstrap.js';
import { loadEnv } from './config/env.js';
import { DbService } from './db/db.service.js';
import { runMigrations } from './db/migrate.js';

async function main(): Promise<void> {
  const env = loadEnv();
  if (env.MIGRATE_ON_START) {
    await runMigrations(env.DATABASE_URL);
    Logger.log('Migraciones aplicadas', 'Bootstrap');
  }
  const app = await NestFactory.create(AppModule.forRoot(env));
  configureApp(app, env);
  await app.get(DbService).assertRlsEnforced();
  await app.listen(env.PORT);
  Logger.log(`SiloPro API escuchando en http://localhost:${env.PORT}/api`, 'Bootstrap');
}

void main();
