import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateChannelRateMappingDto {
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
}
