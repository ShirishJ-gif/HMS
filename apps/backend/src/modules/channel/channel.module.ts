import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { BackgroundJobModule } from '../background-job/background-job.module';
import { InventoryModule } from '../inventory/inventory.module';
import { MetricsModule } from '../metrics/metrics.module';
import { PricingModule } from '../pricing/pricing.module';
import { RoomOutOfServiceModule } from '../room-out-of-service/room-out-of-service.module';
import { ChannelProviderService } from './channel-provider.service';
import { ChannelController } from './channel.controller';
import { ChannelService } from './channel.service';
import { InventorySyncPayloadService } from './inventory-sync-payload.service';
import { RateSyncPayloadService } from './rate-sync-payload.service';
import { ZodomusAliasController } from './zodomus-alias.controller';
import { ZodomusReservationImportService } from './zodomus-reservation-import.service';

@Module({
  imports: [
    AuditLogModule,
    PrismaModule,
    BackgroundJobModule,
    InventoryModule,
    MetricsModule,
    PricingModule,
    RoomOutOfServiceModule,
  ],
  controllers: [ChannelController, ZodomusAliasController],
  providers: [
    IdempotencyService,
    ChannelService,
    ChannelProviderService,
    InventorySyncPayloadService,
    RateSyncPayloadService,
    ZodomusReservationImportService,
  ],
  exports: [ChannelService],
})
export class ChannelModule {}
