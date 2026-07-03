import { Controller, Delete, Get, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../../modules/auth/decorators/roles.decorator';
import { ApiCallTraceKind, ApiCallTraceService } from './api-call-trace.service';

@Controller('api-call-traces')
@Roles(UserRole.PLATFORM_OWNER, UserRole.SUPER_ADMIN, UserRole.ADMIN)
export class ApiCallTraceController {
  constructor(private readonly apiCallTraceService: ApiCallTraceService) {}

  @Get()
  findAll(
    @Query('trace_id') traceId?: string,
    @Query('kind') kind?: ApiCallTraceKind,
    @Query('limit') limit?: string,
  ) {
    return {
      data: this.apiCallTraceService.list({
        traceId: traceId?.trim() || undefined,
        kind: kind === 'SYSTEM' || kind === 'ZODOMUS' ? kind : undefined,
        limit: limit ? Number(limit) : undefined,
      }),
    };
  }

  @Delete()
  clear() {
    this.apiCallTraceService.clear();
    return { cleared: true };
  }
}
