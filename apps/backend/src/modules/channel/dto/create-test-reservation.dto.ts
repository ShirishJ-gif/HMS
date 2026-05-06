import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTestReservationDto {
  @IsString()
  @IsIn(['new', 'modified', 'cancelled'])
  status: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  reservation_id?: string;
}
