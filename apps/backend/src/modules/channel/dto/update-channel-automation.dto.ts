import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateChannelAutomationDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  inventory_interval_minutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  rates_interval_minutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bookings_interval_minutes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sync_window_days?: number;
}
