import { Module } from '@nestjs/common';
import { ICalCalendarController } from './ical-calendar.controller';
import { ICalCalendarService } from './ical-calendar.service';

@Module({
  controllers: [ICalCalendarController],
  providers: [ICalCalendarService],
})
export class ICalCalendarModule {}
