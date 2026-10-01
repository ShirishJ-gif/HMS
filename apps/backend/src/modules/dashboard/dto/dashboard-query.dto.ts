import { IsDateString, IsOptional, IsUUID, Matches } from 'class-validator';

export class DashboardQueryDto {
  @IsOptional()
  @IsUUID()
  property_id?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  date?: string;
}
