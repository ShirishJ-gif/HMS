import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class UpdateProfileDto {
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() || null : value)
  @IsString()
  @MaxLength(30)
  @Matches(/^(?=(?:\D*\d){6})\+?[0-9\s().-]{6,30}$/, { message: 'Enter a valid phone number.' })
  phone?: string | null;

  @IsOptional()
  @IsUUID()
  default_property_id?: string | null;
}
