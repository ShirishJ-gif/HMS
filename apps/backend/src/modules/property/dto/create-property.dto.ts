import { IsEmail, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreatePropertyDto {
  @IsString()
  @MaxLength(160)
  name: string;

  @IsString()
  @MaxLength(40)
  code: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @IsString()
  @MaxLength(1000)
  address: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  default_check_in_time?: string;

  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  default_check_out_time?: string;
}
