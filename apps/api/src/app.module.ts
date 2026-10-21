import { type DynamicModule, Global, Module } from '@nestjs/common';
import { ENV, type Env } from './config/env.js';
import { HealthModule } from './health/health.module.js';

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
    return { module: AppModule, imports: [EnvModule.forRoot(env), HealthModule] };
  }
}
