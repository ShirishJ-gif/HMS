import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { BackgroundJobModule } from '../background-job/background-job.module';
import { MetricsModule } from '../metrics/metrics.module';
import { ChannelProviderService } from './channel-provider.service';
import { ChannelController } from './channel.controller';
import { ChannelService } from './channel.service';

@Module({
  imports: [AuditLogModule, PrismaModule, BackgroundJobModule, MetricsModule],
  controllers: [ChannelController],
  providers: [IdempotencyService, ChannelService, ChannelProviderService],
  exports: [ChannelService],
})
export class ChannelModule {}
