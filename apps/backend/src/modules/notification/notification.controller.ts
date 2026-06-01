import { Controller, Get, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { NotificationFeedService } from './notification-feed.service';

@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationFeedService: NotificationFeedService) {}

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query('limit') limit?: string) {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    return this.notificationFeedService.findAll(user, Number.isFinite(parsedLimit) ? parsedLimit : undefined);
  }
}
