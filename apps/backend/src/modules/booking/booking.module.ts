import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { BackgroundJobModule } from '../background-job/background-job.module';
import { PricingModule } from '../pricing/pricing.module';
import { BookingController } from './booking.controller';
import { BookingService } from './booking.service';

@Module({
  imports: [AuditLogModule, BackgroundJobModule, PricingModule],
  controllers: [BookingController],
  providers: [BookingService],
  exports: [BookingService],
})
export class BookingModule {}
