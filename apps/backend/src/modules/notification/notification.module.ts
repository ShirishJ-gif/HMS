import { Module } from '@nestjs/common';
import { WhatsAppNotificationService } from './whatsapp-notification.service';

@Module({
  providers: [WhatsAppNotificationService],
  exports: [WhatsAppNotificationService],
})
export class NotificationModule {}
