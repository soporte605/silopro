import { Module } from '@nestjs/common';
import { StockModule } from '../stock/stock.module.js';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';
import { ShoppingController } from './shopping.controller.js';
import { ShoppingService } from './shopping.service.js';

@Module({
  imports: [StockModule],
  controllers: [ProjectsController, ShoppingController],
  providers: [ProjectsService, ShoppingService],
  exports: [ProjectsService, ShoppingService],
})
export class ProjectsModule {}
