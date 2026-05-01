import { Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { BackgroundJobService } from './background-job.service';

@Controller('background-jobs')
export class BackgroundJobController {
  constructor(private readonly backgroundJobService: BackgroundJobService) {}

  @Get()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.backgroundJobService.findAll(query, user);
  }

  @Post(':id/retry')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  retry(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.backgroundJobService.retry(id, user);
  }
}
