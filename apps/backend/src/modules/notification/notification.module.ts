import { Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationFeedService } from './notification-feed.service';
import { ReservationNotificationService } from './reservation-notification.service';

@Module({
  controllers: [NotificationController],
  providers: [NotificationFeedService, ReservationNotificationService],
  exports: [ReservationNotificationService],
})
export class NotificationModule {}
