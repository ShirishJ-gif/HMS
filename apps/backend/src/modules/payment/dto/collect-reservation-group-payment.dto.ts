import { PaymentProvider } from '@prisma/client';
import { IsDecimal, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CollectReservationGroupPaymentDto {
  @IsUUID()
  reservation_group_id: string;

  @IsDecimal({ decimal_digits: '0,2' })
  amount: string;

  @IsOptional()
  @IsEnum(PaymentProvider)
  provider?: PaymentProvider;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  provider_reference?: string;
}
