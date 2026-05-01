import {
  IsBoolean,
  IsDateString,
  IsDecimal,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PricingRuleType } from '@prisma/client';

export class CreatePricingRuleDto {
  @IsUUID()
  property_id: string;

  @IsUUID()
  rate_plan_id: string;

  @IsString()
  @MaxLength(120)
  name: string;

  @IsEnum(PricingRuleType)
  type: PricingRuleType;

  @IsDecimal({ decimal_digits: '0,2' })
  adjustment_percent: string;

  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsDateString()
  end_date?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  occupancy_threshold?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
