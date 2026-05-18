import { IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class MapZodomusRateDto {
  @IsUUID()
  connection_id: string;

  @IsUUID()
  rate_plan_id: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  external_room_id?: string;

  @IsString()
  @MaxLength(120)
  external_rate_id: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  external_rate_name?: string;

  @IsOptional()
  @IsObject()
  pricing_config?: Record<string, unknown>;
}
