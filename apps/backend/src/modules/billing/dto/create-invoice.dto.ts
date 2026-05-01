import { IsDecimal, IsOptional, IsUUID } from 'class-validator';

export class CreateInvoiceDto {
  @IsUUID()
  booking_id: string;

  @IsOptional()
  @IsDecimal({ decimal_digits: '0,2' })
  tax?: string;
}
