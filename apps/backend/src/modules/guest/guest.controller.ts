import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateGuestDto } from './dto/create-guest.dto';
import { GuestDirectoryQueryDto } from './dto/guest-directory-query.dto';
import { GuestService } from './guest.service';

@Controller('guests')
export class GuestController {
  constructor(private readonly guestService: GuestService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() createGuestDto: CreateGuestDto) {
    return this.guestService.create(createGuestDto, user);
  }

  @Get('directory')
  getDirectory(@CurrentUser() user: AuthenticatedUser, @Query() query: GuestDirectoryQueryDto) {
    return this.guestService.getDirectory(query, user);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.guestService.findAll(query, user);
  }
}
