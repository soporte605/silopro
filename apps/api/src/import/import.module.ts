import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module.js';
import { StockModule } from '../stock/stock.module.js';
import { ImportController } from './import.controller.js';
import { ImportService } from './import.service.js';

@Module({
  imports: [CatalogModule, StockModule],
  controllers: [ImportController],
  providers: [ImportService],
})
export class ImportModule {}
