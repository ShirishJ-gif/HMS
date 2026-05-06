import { Module } from '@nestjs/common';
import { RoomOutOfServiceModule } from '../room-out-of-service/room-out-of-service.module';
import { PricingService } from './pricing.service';

@Module({
  imports: [RoomOutOfServiceModule],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
