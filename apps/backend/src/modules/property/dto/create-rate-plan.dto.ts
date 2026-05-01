import { IsBoolean, IsDecimal, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateRatePlanDto {
  @IsUUID()
  property_id: string;

  @IsUUID()
  room_category_id: string;

  @IsString()
  @MaxLength(100)
  name: string;

  @IsString()
  @MaxLength(40)
  code: string;

  @IsDecimal({ decimal_digits: '0,2' })
  base_rate: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
