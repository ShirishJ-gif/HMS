import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ChannelService } from './channel.service';
import { CreateChannelConnectionDto } from './dto/create-channel-connection.dto';
import { CreateChannelRateMappingDto } from './dto/create-channel-rate-mapping.dto';
import { CreateChannelRoomMappingDto } from './dto/create-channel-room-mapping.dto';
import { SyncChannelDto } from './dto/sync-channel.dto';

@Controller('channels')
export class ChannelController {
  constructor(private readonly channelService: ChannelService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  createConnection(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateChannelConnectionDto) {
    return this.channelService.createConnection(dto, user);
  }

  @Get()
  findConnections(@CurrentUser() user: AuthenticatedUser, @Query() query: PaginationQueryDto) {
    return this.channelService.findConnections(query, user);
  }

  @Post(':id/room-mappings')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  createRoomMapping(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateChannelRoomMappingDto,
  ) {
    return this.channelService.createRoomMapping(id, dto, user);
  }

  @Post(':id/rate-mappings')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  createRateMapping(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateChannelRateMappingDto,
  ) {
    return this.channelService.createRateMapping(id, dto, user);
  }

  @Post(':id/sync')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  sync(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SyncChannelDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.channelService.sync(id, dto, user, idempotencyKey);
  }

  @Get(':id/sync-logs')
  findSyncLogs(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.channelService.findSyncLogs(id, query, user);
  }
}
