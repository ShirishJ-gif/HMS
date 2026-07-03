import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class SignupPropertyDto {
  @IsString()
  @MaxLength(160)
  property_name: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  property_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  property_email?: string;

  @IsString()
  @MaxLength(1000)
  address: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @IsString()
  @MaxLength(120)
  admin_name: string;

  @IsEmail()
  @MaxLength(160)
  admin_email: string;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password: string;
}
