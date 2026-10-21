import { type DynamicModule, Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { CsrfGuard } from './common/csrf.guard.js';
import { ENV, type Env } from './config/env.js';
import { DbModule } from './db/db.module.js';
import { HealthModule } from './health/health.module.js';
import { StockModule } from './stock/stock.module.js';

@Global()
@Module({})
class EnvModule {
  static forRoot(env: Env): DynamicModule {
    return { module: EnvModule, providers: [{ provide: ENV, useValue: env }], exports: [ENV] };
  }
}

@Module({})
export class AppModule {
  static forRoot(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [
        EnvModule.forRoot(env),
        DbModule,
        AuthModule,
        HealthModule,
        CatalogModule,
        StockModule,
      ],
      providers: [{ provide: APP_GUARD, useClass: CsrfGuard }],
    };
  }
}
