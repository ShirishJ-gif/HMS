import { Module } from '@nestjs/common';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { MetricsModule } from '../metrics/metrics.module';
import { PaymentController } from './payment.controller';
import { PaymentProviderService } from './payment-provider.service';
import { PaymentService } from './payment.service';

@Module({
  imports: [AuditLogModule, MetricsModule],
  controllers: [PaymentController],
  providers: [IdempotencyService, PaymentService, PaymentProviderService],
  exports: [PaymentService],
})
export class PaymentModule {}
