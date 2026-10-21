import { Module } from '@nestjs/common';
import { CabinetsController } from './cabinets.controller.js';
import { CabinetsService } from './cabinets.service.js';
import { LocationsService } from './locations.service.js';
import { MovementsService } from './movements.service.js';
import { StockController } from './stock.controller.js';

@Module({
  controllers: [StockController, CabinetsController],
  providers: [LocationsService, MovementsService, CabinetsService],
})
export class StockModule {}
