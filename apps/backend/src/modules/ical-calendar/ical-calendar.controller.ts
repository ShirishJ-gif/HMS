import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { FetchICalCalendarDto } from './dto/fetch-ical-calendar.dto';
import { ICalCalendarService } from './ical-calendar.service';

@Controller('ical-calendar')
export class ICalCalendarController {
  constructor(private readonly icalCalendarService: ICalCalendarService) {}

  @Post('fetch')
  fetchCalendar(@Body() dto: FetchICalCalendarDto) {
    return this.icalCalendarService.fetchCalendar(dto.url);
  }

  @Public()
  @Get('properties/:propertyId.ics')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  async exportPropertyCalendar(
    @Param('propertyId', ParseUUIDPipe) propertyId: string,
    @Res() response: Response,
  ) {
    response.send(await this.icalCalendarService.renderPropertyCalendar(propertyId));
  }
}
