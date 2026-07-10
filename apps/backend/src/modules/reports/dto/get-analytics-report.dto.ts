import { IsDateString, IsOptional, IsString } from 'class-validator';

export class GetAnalyticsReportDto {
  @IsOptional()
  @IsString()
  property_id?: string;

  @IsDateString()
  from: string;

  @IsDateString()
  to: string;
}
