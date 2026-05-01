import { IsDateString, IsUUID } from 'class-validator';

export class CreateBookingDto {
  @IsUUID()
  property_id: string;

  @IsUUID()
  guest_id: string;

  @IsUUID()
  room_category_id: string;

  @IsUUID()
  rate_plan_id: string;

  @IsDateString()
  check_in_date: string;

  @IsDateString()
  check_out_date: string;
}
