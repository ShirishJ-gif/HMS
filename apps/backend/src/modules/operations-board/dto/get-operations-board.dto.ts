import { IsDateString, IsOptional, IsString } from 'class-validator';

export class GetOperationsBoardDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  property_id?: string;
}
