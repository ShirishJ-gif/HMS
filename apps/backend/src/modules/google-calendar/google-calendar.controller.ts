import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, Res } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateGoogleCalendarBlockDto } from './dto/create-google-calendar-block.dto';
import { GoogleCalendarService } from './google-calendar.service';

@Controller('google-calendar')
export class GoogleCalendarController {
  constructor(private readonly googleCalendarService: GoogleCalendarService) {}

  @Get('status')
  status() {
    return this.googleCalendarService.getReadiness();
  }

  @Get('properties/:propertyId/connections')
  listConnections(@CurrentUser() user: AuthenticatedUser, @Param('propertyId', ParseUUIDPipe) propertyId: string) {
    return this.googleCalendarService.listConnections(propertyId, user);
  }

  @Post('properties/:propertyId/connect/start')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  startConnection(@CurrentUser() user: AuthenticatedUser, @Param('propertyId', ParseUUIDPipe) propertyId: string) {
    return this.googleCalendarService.startConnection(propertyId, user);
  }

  @Public()
  @Get('callback')
  async callback(@Query('code') code: string, @Query('state') state: string, @Res() response: Response) {
    const result = await this.googleCalendarService.completeConnection(code, state);
    return response.redirect(`${result.redirect_url}?googleCalendar=connected&propertyId=${result.property_id}`);
  }

  @Get('properties/:propertyId/connections/:connectionId/calendars')
  listCalendars(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
  ) {
    return this.googleCalendarService.listWritableCalendars(propertyId, connectionId, user);
  }

  @Put('properties/:propertyId/connections/:connectionId/calendar')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  selectCalendar(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
    @Body() body: { calendar_id: string },
  ) {
    return this.googleCalendarService.selectCalendar(propertyId, connectionId, body.calendar_id, user);
  }

  @Delete('properties/:propertyId/connections/:connectionId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  disconnect(
    @CurrentUser() user: AuthenticatedUser,
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Param('connectionId', ParseUUIDPipe) connectionId: string,
  ) {
    return this.googleCalendarService.disconnect(propertyId, connectionId, user);
  }

  @Post('blocks')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  createBusyBlock(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateGoogleCalendarBlockDto) {
    return this.googleCalendarService.createBusyBlock(dto, user);
  }
}
