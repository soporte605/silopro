import { Module } from '@nestjs/common';
import { ENV } from '../config/env.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { StockModule } from '../stock/stock.module.js';
import { ASSISTANT_LLM, assistantLlmFactory } from './assistant-llm.js';
import { AssistantController } from './assistant.controller.js';
import { AssistantService } from './assistant.service.js';

@Module({
  imports: [StockModule, ProjectsModule],
  controllers: [AssistantController],
  providers: [
    AssistantService,
    { provide: ASSISTANT_LLM, useFactory: assistantLlmFactory, inject: [ENV] },
  ],
})
export class AssistantModule {}
