import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { BookingService } from './booking.service';
import { CreateBookingDto } from './dto/create-booking.dto';

@Controller('bookings')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() createBookingDto: CreateBookingDto) {
    return this.bookingService.create(createBookingDto, user);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.bookingService.findAll(query, user);
  }

  @Put(':id/checkin')
  checkIn(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookingService.checkIn(id, user);
  }

  @Put(':id/checkout')
  checkOut(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookingService.checkOut(id, user);
  }

  @Post(':id/checkin-reminder')
  sendCheckInReminder(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookingService.sendCheckInReminder(id, user);
  }
}
