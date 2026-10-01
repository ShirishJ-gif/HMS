import { IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class SetupChannelProviderDto {
  @IsUUID()
  property_id: string;

  @IsString()
  @MaxLength(120)
  external_hotel_id: string;

  @IsOptional()
  @IsObject()
  options?: Record<string, unknown>;
}
