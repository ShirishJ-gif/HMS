import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateGoogleCalendarBlockDto {
  @IsUUID()
  property_id: string;

  @IsOptional()
  @IsUUID()
  room_category_id?: string;

  @IsString()
  from_date: string;

  @IsString()
  to_date: string;

  @IsString()
  @MaxLength(180)
  summary: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
