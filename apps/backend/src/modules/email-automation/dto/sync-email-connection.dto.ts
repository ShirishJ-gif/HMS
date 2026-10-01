import { IsInt, IsOptional, IsString, MaxLength, Max, Min } from 'class-validator';

export class SyncEmailConnectionDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24 * 30)
  backfill_hours?: number;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  from_email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  subject?: string;
}
