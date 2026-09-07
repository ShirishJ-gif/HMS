import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateEmailConnectionFiltersDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  trusted_from_email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  trusted_subject?: string;
}
