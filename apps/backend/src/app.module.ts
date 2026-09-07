import { BillingModule } from './modules/billing/billing.module';
import { Module } from '@nestjs/common';
import { ApiCallTraceModule } from './common/api-call-trace/api-call-trace.module';
import { IdempotencyService } from './common/idempotency/idempotency.service';
import { AuthModule } from './modules/auth/auth.module';
import { AuditLogModule } from './modules/audit-log/audit-log.module';
import { AvailabilityModule } from './modules/availability/availability.module';
import { BackgroundJobModule } from './modules/background-job/background-job.module';
import { BookingModule } from './modules/booking/booking.module';
import { ChannelModule } from './modules/channel/channel.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { EmailAutomationModule } from './modules/email-automation/email-automation.module';
import { ExpenseModule } from './modules/expense/expense.module';
import { FinanceModule } from './modules/finance/finance.module';
import { GuestModule } from './modules/guest/guest.module';
import { GoogleCalendarModule } from './modules/google-calendar/google-calendar.module';
import { HealthModule } from './modules/health/health.module';
import { HousekeepingModule } from './modules/housekeeping/housekeeping.module';
import { ICalCalendarModule } from './modules/ical-calendar/ical-calendar.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { NotificationModule } from './modules/notification/notification.module';
import { OperationsBoardModule } from './modules/operations-board/operations-board.module';
import { PaymentModule } from './modules/payment/payment.module';
import { PlatformAdminModule } from './modules/platform-admin/platform-admin.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { PropertyModule } from './modules/property/property.module';
import { ReportsModule } from './modules/reports/reports.module';
import { RoomModule } from './modules/room/room.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    ApiCallTraceModule,
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
    EmailAutomationModule,
    ExpenseModule,
    FinanceModule,
    InventoryModule,
    GoogleCalendarModule,
    PropertyModule,
    AuthModule,
    HealthModule,
    AvailabilityModule,
    HousekeepingModule,
    ICalCalendarModule,
    MetricsModule,
    OperationsBoardModule,
    PaymentModule,
    PlatformAdminModule,
    PricingModule,
    ReportsModule,
    WebhookModule,
    WhatsAppModule,
  ],
  providers: [IdempotencyService],
  exports: [IdempotencyService],
})
export class AppModule {}
