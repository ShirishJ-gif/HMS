import { Body, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { EmailProviderType } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { CreateEmailConnectionDto } from './dto/create-email-connection.dto';
import { EmailActivityQueryDto } from './dto/email-activity-query.dto';
import { IngestEmailDto } from './dto/ingest-email.dto';
import { ReviewEmailDto } from './dto/review-email.dto';
import { SyncEmailConnectionDto } from './dto/sync-email-connection.dto';
import { UpdateEmailConnectionFiltersDto } from './dto/update-email-connection-filters.dto';
import { EmailAutomationService } from './email-automation.service';

@Controller()
export class EmailAutomationController {
  constructor(private readonly emailAutomationService: EmailAutomationService) {}

  @Get('email-automation/readiness')
  getReadiness() {
    return this.emailAutomationService.getReadiness();
  }

  @Get('properties/:propertyId/email-connections')
  listConnections(@CurrentUser() user: AuthenticatedUser, @Param('propertyId', ParseUUIDPipe) propertyId: string) {
    return this.emailAutomationService.listConnections(propertyId, user);
  }

  @Post('properties/:propertyId/email-connections')
  createConnection(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Body() dto: CreateEmailConnectionDto,
  ) {
    return this.emailAutomationService.createConnection(propertyId, dto, user);
  }

  @Post('properties/:propertyId/email-connections/google/start')
  startGoogle(@CurrentUser() user: AuthenticatedUser, @Param('propertyId', ParseUUIDPipe) propertyId: string) {
    return this.emailAutomationService.startOAuthConnection(propertyId, EmailProviderType.GMAIL, user);
  }

  @Public()
  @Get('integrations/email/google/callback')
  async googleCallback(@Query('code') code: string, @Query('state') state: string, @Res() response: Response) {
    const result = await this.emailAutomationService.completeOAuthConnection(EmailProviderType.GMAIL, code, state);
    return response.redirect(`${result.redirect_url}?emailAutomation=connected&provider=GMAIL`);
  }

  @Post('properties/:propertyId/email-connections/microsoft/start')
  startMicrosoft(@CurrentUser() user: AuthenticatedUser, @Param('propertyId', ParseUUIDPipe) propertyId: string) {
    return this.emailAutomationService.startOAuthConnection(propertyId, EmailProviderType.MICROSOFT, user);
  }

  @Public()
  @Get('integrations/email/microsoft/callback')
  async microsoftCallback(@Query('code') code: string, @Query('state') state: string, @Res() response: Response) {
    const result = await this.emailAutomationService.completeOAuthConnection(EmailProviderType.MICROSOFT, code, state);
    return response.redirect(`${result.redirect_url}?emailAutomation=connected&provider=MICROSOFT`);
  }

  @Delete('properties/:propertyId/email-connections/:connectionId')
  disconnect(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
  ) {
    return this.emailAutomationService.disconnect(propertyId, connectionId, user);
  }

  @Put('properties/:propertyId/email-connections/:connectionId/filters')
  updateFilters(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Body() dto: UpdateEmailConnectionFiltersDto,
  ) {
    return this.emailAutomationService.updateConnectionFilters(propertyId, connectionId, dto, user);
  }

  @Post('properties/:propertyId/email-connections/:connectionId/ingest')
  ingest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Body() dto: IngestEmailDto,
  ) {
    return this.emailAutomationService.ingest(propertyId, connectionId, dto, user);
  }

  @Post('properties/:propertyId/email-connections/:connectionId/sync')
  sync(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Body() dto: SyncEmailConnectionDto,
  ) {
    return this.emailAutomationService.listConnections(propertyId, user).then((connections) => {
      if (!connections.some((connection) => connection.id === connectionId)) {
        throw new NotFoundException('Email connection not found for property');
      }
      return this.emailAutomationService.syncConnection(connectionId, { backfillHours: dto.backfill_hours });
    });
  }

  @Post('email-automation/sync-due')
  syncDue() {
    return this.emailAutomationService.syncDueConnections();
  }

  @Get('properties/:propertyId/email-automation/summary')
  summary(@CurrentUser() user: AuthenticatedUser, @Param('propertyId', ParseUUIDPipe) propertyId: string) {
    return this.emailAutomationService.getSummary(propertyId, user);
  }

  @Get('properties/:propertyId/email-automation/activity')
  activity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Query() query: EmailActivityQueryDto,
  ) {
    return this.emailAutomationService.listActivity(propertyId, query, user);
  }

  @Get('properties/:propertyId/email-automation/emails/:emailId')
  email(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('emailId', ParseUUIDPipe) emailId: string,
  ) {
    return this.emailAutomationService.getEmail(propertyId, emailId, user);
  }

  @Post('properties/:propertyId/email-automation/emails/:emailId/reprocess')
  reprocess(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('emailId', ParseUUIDPipe) emailId: string,
  ) {
    return this.emailAutomationService.reprocess(propertyId, emailId, user);
  }

  @Post('properties/:propertyId/email-automation/emails/:emailId/apply-payout-payment')
  applyPayoutPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('emailId', ParseUUIDPipe) emailId: string,
  ) {
    return this.emailAutomationService.applyPayoutPayment(propertyId, emailId, user);
  }

  @Post('properties/:propertyId/email-automation/emails/:emailId/review')
  review(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('emailId', ParseUUIDPipe) emailId: string,
    @Body() dto: ReviewEmailDto,
  ) {
    return this.emailAutomationService.review(propertyId, emailId, dto, user);
  }
}
