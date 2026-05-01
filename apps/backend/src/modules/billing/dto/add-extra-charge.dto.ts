import { IsDecimal, IsString, MaxLength } from 'class-validator';

export class AddExtraChargeDto {
  @IsString()
  @MaxLength(180)
  description: string;

  @IsDecimal({ decimal_digits: '0,2' })
  amount: string;
}
