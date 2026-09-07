import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { GoogleCalendarModule } from '../google-calendar/google-calendar.module';
import { RoomOutOfServiceModule } from '../room-out-of-service/room-out-of-service.module';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [AuditLogModule, GoogleCalendarModule, RoomOutOfServiceModule],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
