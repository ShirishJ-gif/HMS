import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { ChannelProviderService } from '../channel/channel-provider.service';
import { MetricsModule } from '../metrics/metrics.module';
import { NotificationModule } from '../notification/notification.module';
import { BackgroundJobController } from './background-job.controller';
import { BackgroundJobService } from './background-job.service';

@Module({
  imports: [AuditLogModule, MetricsModule, NotificationModule],
  controllers: [BackgroundJobController],
  providers: [BackgroundJobService, ChannelProviderService],
  exports: [BackgroundJobService],
})
export class BackgroundJobModule {}
