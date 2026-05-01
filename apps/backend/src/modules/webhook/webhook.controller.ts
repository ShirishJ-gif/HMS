import { Body, Controller, Get, Headers, Param, Post, Query, Req, Res } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Request, Response } from 'express';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AuthenticatedUser } from '../auth/auth.guard';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { WebhookService } from './webhook.service';

@Controller()
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Public()
  @Post('webhooks/:domain/:provider')
  async ingest(
    @Param('domain') domain: string,
    @Param('provider') provider: string,
    @Body() body: Record<string, unknown>,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() request: Request & { rawBody?: Buffer },
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.webhookService.ingest(domain, provider, body, headers, request.rawBody);
    response.status(result.duplicate ? 200 : 201);
    return result;
  }

  @Get('webhook-events')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.webhookService.findAll(query, user);
  }
}
