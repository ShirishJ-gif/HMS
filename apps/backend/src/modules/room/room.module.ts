import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { BackgroundJobModule } from '../background-job/background-job.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PhysicalRoomAliasController } from './physical-room-alias.controller';
import { RoomController } from './room.controller';
import { RoomService } from './room.service';

@Module({
  imports: [AuditLogModule, BackgroundJobModule, InventoryModule],
  controllers: [RoomController, PhysicalRoomAliasController],
  providers: [RoomService],
  exports: [RoomService],
})
export class RoomModule {}
