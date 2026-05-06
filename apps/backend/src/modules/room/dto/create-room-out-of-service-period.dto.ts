import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateRoomOutOfServicePeriodDto {
  @IsDateString()
  from_date: string;

  @IsDateString()
  to_date: string;

  @IsString()
  @MaxLength(180)
  reason: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
