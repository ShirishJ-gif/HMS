import { ChannelSyncType } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';

export class SyncChannelDto {
  @IsEnum(ChannelSyncType)
  sync_type: ChannelSyncType;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
