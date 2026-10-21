import { Module } from '@nestjs/common';
import { LocationsService } from './locations.service.js';
import { MovementsService } from './movements.service.js';
import { StockController } from './stock.controller.js';

@Module({ controllers: [StockController], providers: [LocationsService, MovementsService] })
export class StockModule {}
