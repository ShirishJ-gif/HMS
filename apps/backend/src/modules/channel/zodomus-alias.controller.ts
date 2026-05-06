import { Body, Controller, Headers, Post } from '@nestjs/common';
import { ChannelSyncType } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { MapZodomusPropertyDto } from './dto/map-zodomus-property.dto';
import { MapZodomusRateDto } from './dto/map-zodomus-rate.dto';
import { MapZodomusRoomDto } from './dto/map-zodomus-room.dto';
import { ZodomusSyncAliasDto } from './dto/zodomus-sync-alias.dto';
import { ChannelService } from './channel.service';

@Controller('zodomus')
export class ZodomusAliasController {
  constructor(private readonly channelService: ChannelService) {}

  @Post('mapping/property')
  mapProperty(@CurrentUser() user: AuthenticatedUser, @Body() dto: MapZodomusPropertyDto) {
    return this.channelService.mapExternalProperty(dto.connection_id, dto.external_hotel_id, user);
  }

  @Post('mapping/room')
  mapRoom(@CurrentUser() user: AuthenticatedUser, @Body() dto: MapZodomusRoomDto) {
    return this.channelService.createRoomMapping(
      dto.connection_id,
      {
        room_category_id: dto.room_category_id,
        external_room_id: dto.external_room_id,
        external_room_name: dto.external_room_name,
      },
      user,
    );
  }

  @Post('mapping/rate')
  mapRate(@CurrentUser() user: AuthenticatedUser, @Body() dto: MapZodomusRateDto) {
    return this.channelService.createRateMapping(
      dto.connection_id,
      {
        rate_plan_id: dto.rate_plan_id,
        external_room_id: dto.external_room_id,
        external_rate_id: dto.external_rate_id,
        external_rate_name: dto.external_rate_name,
      },
      user,
    );
  }

  @Post('sync/availability')
  syncAvailability(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ZodomusSyncAliasDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.channelService.sync(
      dto.connection_id,
      {
        sync_type: ChannelSyncType.INVENTORY,
        from: dto.from,
        to: dto.to,
      },
      user,
      idempotencyKey,
    );
  }

  @Post('sync/rates')
  syncRates(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ZodomusSyncAliasDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.channelService.sync(
      dto.connection_id,
      {
        sync_type: ChannelSyncType.RATES,
        from: dto.from,
        to: dto.to,
      },
      user,
      idempotencyKey,
    );
  }
}
