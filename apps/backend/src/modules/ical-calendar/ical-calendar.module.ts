import { Module } from '@nestjs/common';
import { ICalCalendarController } from './ical-calendar.controller';
import { ICalCalendarService } from './ical-calendar.service';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [InventoryModule],
  controllers: [ICalCalendarController],
  providers: [ICalCalendarService],
})
export class ICalCalendarModule {}
