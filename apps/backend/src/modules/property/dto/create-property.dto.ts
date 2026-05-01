import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

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
}
