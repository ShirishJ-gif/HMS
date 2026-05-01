import { PaymentStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdatePaymentStatusDto {
  @IsEnum(PaymentStatus)
  payment_status: PaymentStatus;
}
