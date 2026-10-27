import { IsOptional, IsString } from 'class-validator';

export class GetFinanceOverviewDto {
  @IsOptional()
  @IsString()
  property_id?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}
