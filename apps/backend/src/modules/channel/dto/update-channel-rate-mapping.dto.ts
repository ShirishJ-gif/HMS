import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateChannelRateMappingDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  external_room_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  external_rate_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  external_rate_name?: string;

  @IsOptional()
  @IsObject()
  pricing_config?: Record<string, unknown>;
}
