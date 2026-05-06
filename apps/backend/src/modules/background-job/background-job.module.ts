import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { ChannelProviderService } from '../channel/channel-provider.service';
import { InventorySyncPayloadService } from '../channel/inventory-sync-payload.service';
import { ZodomusReservationImportService } from '../channel/zodomus-reservation-import.service';
import { InventoryModule } from '../inventory/inventory.module';
import { MetricsModule } from '../metrics/metrics.module';
import { NotificationModule } from '../notification/notification.module';
import { PricingModule } from '../pricing/pricing.module';
import { RoomOutOfServiceModule } from '../room-out-of-service/room-out-of-service.module';
import { BackgroundJobController } from './background-job.controller';
import { BackgroundJobService } from './background-job.service';

@Module({
  imports: [
    AuditLogModule,
    InventoryModule,
    MetricsModule,
    NotificationModule,
    PricingModule,
    RoomOutOfServiceModule,
  ],
  controllers: [BackgroundJobController],
  providers: [BackgroundJobService, ChannelProviderService, InventorySyncPayloadService, ZodomusReservationImportService],
  exports: [BackgroundJobService],
})
export class BackgroundJobModule {}
