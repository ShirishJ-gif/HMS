import { BillingModule } from './modules/billing/billing.module';
import { Module } from '@nestjs/common';
import { IdempotencyService } from './common/idempotency/idempotency.service';
import { AuthModule } from './modules/auth/auth.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { AvailabilityModule } from './modules/availability/availability.module';
import { BackgroundJobModule } from './modules/background-job/background-job.module';
import { BookingModule } from './modules/booking/booking.module';
import { ChannelModule } from './modules/channel/channel.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { GuestModule } from './modules/guest/guest.module';
import { HealthModule } from './modules/health/health.module';
import { HousekeepingModule } from './modules/housekeeping/housekeeping.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { NotificationModule } from './modules/notification/notification.module';
import { PaymentModule } from './modules/payment/payment.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { PropertyModule } from './modules/property/property.module';
import { RoomModule } from './modules/room/room.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    AuditLogModule,
    BackgroundJobModule,
    RoomModule,
    GuestModule,
    NotificationModule,
    BookingModule,
    ChannelModule,
    BillingModule,
    DashboardModule,
    InventoryModule,
    PropertyModule,
    AuthModule,
    HealthModule,
    AvailabilityModule,
    HousekeepingModule,
    MetricsModule,
    PaymentModule,
    PricingModule,
    WebhookModule,
  ],
  providers: [IdempotencyService],
  exports: [IdempotencyService],
})
export class AppModule {}
