import { PropertyType } from '@prisma/client';
import { IsEmail, IsEnum, IsNumber, Min, Max, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreatePropertyDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(99999999.99)
  nightly_rate?: number;

  @IsOptional()
  @IsEnum(PropertyType)
  property_type?: PropertyType;

  @IsString()
  @MaxLength(160)
  name: string;

  @IsString()
  @MaxLength(40)
  code: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @IsString()
  @MaxLength(1000)
  address: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  default_check_in_time?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  default_check_out_time?: string;
}
