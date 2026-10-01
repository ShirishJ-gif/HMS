import {
  IsDecimal,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmptyObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentProvider } from '@prisma/client';

const directReservationEmailPattern = /^[^\s@]+@[^\s@]+\.(?!cpm$|con$|comm$|coom$|ocm$)[^\s@]{2,}$/i;
export const DIRECT_GUEST_ID_PROOF_TYPES = ['Aadhaar Card', 'Driver License', 'Passport'];

class DirectReservationGuestDto {
  @IsString()
  @MaxLength(120)
  name: string;

  @IsString()
  @MaxLength(30)
  phone: string;

  @IsOptional()
  @IsEmail()
  @Matches(directReservationEmailPattern, {
    message: 'email must be valid and must not use common typo domains such as .cpm',
  })
  @MaxLength(160)
  email?: string;

  @IsString()
  @IsEnum(DIRECT_GUEST_ID_PROOF_TYPES, {
    message: 'Select Aadhaar Card, Driver License, or Passport only; do not include an ID number',
  })
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

  @IsOptional()
  @IsUUID()
  room_category_id?: string;

  @IsOptional()
  @IsUUID()
  rate_plan_id?: string;

  @IsString()
  check_in_date: string;

  @IsString()
  check_out_date: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'check_in_time must use HH:mm format',
  })
  @MaxLength(5)
  check_in_time?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'check_out_time must use HH:mm format',
  })
  @MaxLength(5)
  check_out_time?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  room_count?: number;

  @IsOptional()
  @IsEnum(['WHOLE_VILLA', 'ROOM_COUNT'])
  villa_booking_mode?: 'WHOLE_VILLA' | 'ROOM_COUNT';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  adults?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  children?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remarks?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  source?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  advance_amount?: string;

  @IsOptional()
  @IsEnum(PaymentProvider)
  advance_payment_provider?: PaymentProvider;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  advance_payment_reference?: string;
}
