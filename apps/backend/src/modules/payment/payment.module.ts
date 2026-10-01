import { Module } from '@nestjs/common';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import { MetricsModule } from '../metrics/metrics.module';
import { PaymentController } from './payment.controller';
import { PaymentProviderService } from './payment-provider.service';
import { PaymentService } from './payment.service';

@Module({
  imports: [MetricsModule],
  controllers: [PaymentController],
  providers: [IdempotencyService, PaymentService, PaymentProviderService],
  exports: [PaymentService, PaymentProviderService],
})
export class PaymentModule {}
