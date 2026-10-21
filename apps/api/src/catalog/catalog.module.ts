import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller.js';
import { CategoriesService } from './categories.service.js';
import { ItemsService } from './items.service.js';
import { SuppliersService } from './suppliers.service.js';
import { UnitsService } from './units.service.js';

@Module({
  controllers: [CatalogController],
  providers: [UnitsService, CategoriesService, SuppliersService, ItemsService],
})
export class CatalogModule {}
