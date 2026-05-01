import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { BackgroundJobModule } from '../background-job/background-job.module';
import { MetricsModule } from '../metrics/metrics.module';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';

@Module({
  imports: [AuditLogModule, BackgroundJobModule, MetricsModule],
  controllers: [WebhookController],
  providers: [WebhookService],
})
export class WebhookModule {}
