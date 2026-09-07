import { IsDecimal, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export const EXPENSE_CATEGORIES = ['PROPERTY_EXPENSE', 'BOOKING_EXPENSE'] as const;

export class CreateExpenseDto {
  @IsUUID()
  property_id: string;

  @IsString()
  expense_date: string;

  @IsString()
  @IsIn(EXPENSE_CATEGORIES)
  @MaxLength(80)
  category: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  vendor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  vendor_contact?: string;

  @IsString()
  @MaxLength(300)
  description: string;

  @IsDecimal({ decimal_digits: '0,2' })
  amount: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  payment_mode?: string;
}
