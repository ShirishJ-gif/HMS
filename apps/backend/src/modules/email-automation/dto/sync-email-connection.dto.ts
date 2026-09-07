import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class SyncEmailConnectionDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24 * 30)
  backfill_hours?: number;
}
