import { IsDateString, IsOptional } from 'class-validator';

export class GetProviderAvailabilityQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
