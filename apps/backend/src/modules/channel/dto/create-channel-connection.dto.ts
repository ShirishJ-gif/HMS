import { ChannelConnectionStatus, ChannelProvider } from '@prisma/client';
import { IsEnum, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateChannelConnectionDto {
  @IsUUID()
  property_id: string;

  @IsEnum(ChannelProvider)
  provider: ChannelProvider;

  @IsString()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsEnum(ChannelConnectionStatus)
  status?: ChannelConnectionStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  external_hotel_id?: string;

  @IsOptional()
  @IsObject()
  credentials?: Record<string, unknown>;
}
