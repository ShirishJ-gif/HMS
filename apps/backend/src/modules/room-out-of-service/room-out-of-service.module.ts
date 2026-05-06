import { Module } from '@nestjs/common';
import { RoomOutOfServiceCalendarService } from './room-out-of-service-calendar.service';

@Module({
  providers: [RoomOutOfServiceCalendarService],
  exports: [RoomOutOfServiceCalendarService],
})
export class RoomOutOfServiceModule {}
