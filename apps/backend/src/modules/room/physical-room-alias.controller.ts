import { Body, Controller, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateRoomDto } from './dto/create-room.dto';
import { RoomService } from './room.service';

@Controller()
export class PhysicalRoomAliasController {
  constructor(private readonly roomService: RoomService) {}

  @Post('physical-rooms')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  createPhysicalRoom(@CurrentUser() user: AuthenticatedUser, @Body() createRoomDto: CreateRoomDto) {
    return this.roomService.create(createRoomDto, user);
  }
}
