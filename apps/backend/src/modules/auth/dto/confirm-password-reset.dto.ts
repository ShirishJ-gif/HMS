import { IsString, MinLength } from 'class-validator';

export class ConfirmPasswordResetDto {
  @IsString()
  @MinLength(32)
  token!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
