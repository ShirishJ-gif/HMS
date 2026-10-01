import { IsDecimal, IsIn, IsOptional, IsString, IsUUID, MaxLength, Matches } from 'class-validator';

export const EXPENSE_CATEGORIES = ['PROPERTY_EXPENSE', 'BOOKING_EXPENSE', 'UTILITIES', 'HOUSEKEEPING', 'MAINTENANCE', 'SUPPLIES', 'SALARIES', 'COMMISSIONS', 'FOOD_BEVERAGE', 'TRANSPORT', 'OTHER'] as const;
export const PAYMENT_MODES = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'OTHER'] as const;

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
  @Matches(/\S/, { message: 'description cannot be blank' })
  @MaxLength(300)
  description: string;

  @IsDecimal({ decimal_digits: '0,2' })
  amount: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a three-letter uppercase currency code' })
  currency?: string;

  @IsOptional()
  @IsString()
  @IsIn(PAYMENT_MODES)
  @MaxLength(40)
  payment_mode?: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  amount_paid?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  invoice_number?: string;

  @IsOptional()
  @IsUUID()
  reservation_group_id?: string | null;
}
