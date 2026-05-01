import { IsDecimal, IsOptional, IsString, MaxLength } from 'class-validator';

export class RefundPaymentDto {
  @IsDecimal({ decimal_digits: '0,2' })
  amount: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
