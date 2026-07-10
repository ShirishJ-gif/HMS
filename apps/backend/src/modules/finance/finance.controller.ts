import { Controller, Get, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { GetFinanceOverviewDto } from './dto/get-finance-overview.dto';
import { FinanceService } from './finance.service';

@Controller('finance')
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('overview')
  getOverview(@CurrentUser() user: AuthenticatedUser, @Query() query: GetFinanceOverviewDto) {
    return this.financeService.getOverview(query, user);
  }
}
