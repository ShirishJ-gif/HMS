import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class BootstrapUserDto {
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
}
