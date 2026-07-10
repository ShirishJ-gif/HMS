import { Controller, Get, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { GetAnalyticsReportDto } from './dto/get-analytics-report.dto';
import { ReportsService } from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('analytics')
  getAnalytics(@CurrentUser() user: AuthenticatedUser, @Query() query: GetAnalyticsReportDto) {
    return this.reportsService.getAnalytics(query, user);
  }
}
