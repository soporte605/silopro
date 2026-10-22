import { Module } from '@nestjs/common';
import { CabinetsController } from './cabinets.controller.js';
import { CabinetsService } from './cabinets.service.js';
import { LocationsService } from './locations.service.js';
import { MovementsService } from './movements.service.js';
import { QrService } from './qr.service.js';
import { ReservationsController } from './reservations.controller.js';
import { ReservationsService } from './reservations.service.js';
import { StockController } from './stock.controller.js';

@Module({
  controllers: [StockController, CabinetsController, ReservationsController],
  providers: [LocationsService, MovementsService, CabinetsService, QrService, ReservationsService],
  exports: [MovementsService, ReservationsService],
})
export class StockModule {}
