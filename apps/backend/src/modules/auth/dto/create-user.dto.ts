import { UserRole } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsOptional()
  @IsUUID()
  property_id?: string;

  @IsString()
  @MaxLength(120)
  name: string;

  @IsEmail()
  @MaxLength(160)
  email: string;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  password: string;

  @IsEnum(UserRole)
  role: UserRole;
}
