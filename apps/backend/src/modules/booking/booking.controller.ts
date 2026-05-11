import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateDirectReservationDto } from './dto/create-direct-reservation.dto';
import { FindReservationFeedQueryDto } from './dto/find-reservation-feed-query.dto';
import { BookingService } from './booking.service';

@Controller()
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Post('reservations/direct')
  createDirectReservation(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDirectReservationDto) {
    return this.bookingService.createDirectReservation(dto, user);
  }

  @Get('bookings/groups')
  findReservationGroups(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.bookingService.findReservationGroups(query, user);
  }

  @Get('bookings/feed')
  findReservationFeed(@CurrentUser() user: AuthenticatedUser, @Query() query: FindReservationFeedQueryDto) {
    return this.bookingService.findReservationFeed(query, user);
  }

  @Put('bookings/groups/rooms/:id/checkin')
  checkInReservationRoom(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookingService.checkInReservationRoom(id, user);
  }

  @Put('bookings/groups/rooms/:id/checkout')
  checkOutReservationRoom(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookingService.checkOutReservationRoom(id, user);
  }

  @Post('bookings/groups/rooms/:id/checkin-reminder')
  sendReservationRoomCheckInReminder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.bookingService.sendReservationRoomCheckInReminder(id, user);
  }
}
