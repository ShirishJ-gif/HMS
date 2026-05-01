import { Controller, Get, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AvailabilityService } from './availability.service';
import { GetAvailabilityDto } from './dto/get-availability.dto';

@Controller('availability')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Get()
  getAvailability(@CurrentUser() user: AuthenticatedUser, @Query() query: GetAvailabilityDto) {
    return this.availabilityService.getAvailability(query, user);
  }
}
