import { IsDateString, IsUUID } from 'class-validator';

export class GetAvailabilityDto {
  @IsUUID()
  property_id: string;

  @IsDateString()
  from: string;

  @IsDateString()
  to: string;
}
