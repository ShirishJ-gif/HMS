import { Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationFeedService } from './notification-feed.service';
import { WhatsAppNotificationService } from './whatsapp-notification.service';

@Module({
  controllers: [NotificationController],
  providers: [NotificationFeedService, WhatsAppNotificationService],
  exports: [WhatsAppNotificationService],
})
export class NotificationModule {}
