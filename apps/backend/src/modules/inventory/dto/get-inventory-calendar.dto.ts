import { IsString, IsUUID } from 'class-validator';

export class GetInventoryCalendarDto {
  @IsUUID()
  property_id: string;

  @IsString()
  from: string;

  @IsString()
  to: string;
}
