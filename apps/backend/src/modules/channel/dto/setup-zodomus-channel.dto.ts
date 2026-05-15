import { IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { ZodomusOtaKey } from '../providers/zodomus.types';

export class SetupZodomusChannelDto {
  @IsUUID()
  property_id: string;

  @IsIn(['BOOKING_COM', 'EXPEDIA', 'AIRBNB'])
  ota_key: ZodomusOtaKey;

  @IsString()
  @MaxLength(120)
  external_hotel_id: string;

  @IsOptional()
  @IsInt()
  @IsIn([1, 2, 3, 4, 5])
  price_model_id?: number;
}
