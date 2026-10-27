import { Controller, Get, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto/dashboard-query.dto';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  getSummary(@CurrentUser() user: AuthenticatedUser, @Query() query: DashboardQueryDto) {
    if (query.from !== undefined || query.to !== undefined) {
      return this.dashboardService.getSummary(new Date(), user, query.property_id, query.date, { from: query.from, to: query.to });
    }
    return this.dashboardService.getSummary(new Date(), user, query.property_id, query.date);
  }
}
