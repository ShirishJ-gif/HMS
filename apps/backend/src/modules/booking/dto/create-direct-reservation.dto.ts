import {
  IsEmail,
  IsInt,
  IsNotEmptyObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class DirectReservationGuestDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsString()
  @MaxLength(30)
  phone: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @IsString()
  @MaxLength(120)
  id_proof: string;

  @IsString()
  @MaxLength(1000)
  address: string;
}

export class CreateDirectReservationDto {
  @IsUUID()
  property_id: string;

  @IsOptional()
  @IsUUID()
  guest_id?: string;

  @ValidateIf((value) => !value.guest_id)
  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => DirectReservationGuestDto)
  guest?: DirectReservationGuestDto;

  @IsUUID()
  room_category_id: string;

  @IsUUID()
  rate_plan_id: string;

  @IsString()
  check_in_date: string;

  @IsString()
  check_out_date: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  room_count?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remarks?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  source?: string;
}
