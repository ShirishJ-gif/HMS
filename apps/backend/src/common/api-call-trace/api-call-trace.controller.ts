import { Controller, Delete, Get, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../../modules/auth/auth.guard';
import { CurrentUser } from '../../modules/auth/decorators/current-user.decorator';
import { Roles } from '../../modules/auth/decorators/roles.decorator';
import { ApiCallTraceKind, ApiCallTraceService } from './api-call-trace.service';

@Controller('api-call-traces')
@Roles(UserRole.PLATFORM_OWNER, UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class ApiCallTraceController {
  constructor(private readonly apiCallTraceService: ApiCallTraceService) {}

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query('trace_id') traceId?: string,
    @Query('kind') kind?: ApiCallTraceKind,
    @Query('limit') limit?: string,
  ) {
    return {
      data: this.apiCallTraceService.list({
        traceId: traceId?.trim() || undefined,
        kind: kind === 'SYSTEM' || kind === 'ZODOMUS' ? kind : undefined,
        limit: limit ? Number(limit) : undefined,
        propertyIds: this.tracePropertyIds(user),
      }),
    };
  }

  @Delete()
  clear(@CurrentUser() user: AuthenticatedUser) {
    const clearedCount = this.apiCallTraceService.clear(this.tracePropertyIds(user));
    return { cleared: true, cleared_count: clearedCount };
  }

  private tracePropertyIds(user: AuthenticatedUser) {
    if (user.role === UserRole.PLATFORM_OWNER) {
      return null;
    }

    if (user.role === UserRole.ORG_OWNER) {
      return user.property_ids ?? [];
    }

    return user.property_id ? [user.property_id] : [];
  }
}
