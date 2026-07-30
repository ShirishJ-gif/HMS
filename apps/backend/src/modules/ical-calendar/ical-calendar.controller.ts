import { Body, Controller, Post } from '@nestjs/common';
import { FetchICalCalendarDto } from './dto/fetch-ical-calendar.dto';
import { ICalCalendarService } from './ical-calendar.service';

@Controller('ical-calendar')
export class ICalCalendarController {
  constructor(private readonly icalCalendarService: ICalCalendarService) {}

  @Post('fetch')
  fetchCalendar(@Body() dto: FetchICalCalendarDto) {
    return this.icalCalendarService.fetchCalendar(dto.url);
  }
}
