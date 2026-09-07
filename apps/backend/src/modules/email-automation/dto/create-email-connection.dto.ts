import { EmailProviderType } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateEmailConnectionDto {
  @IsEnum(EmailProviderType)
  provider: EmailProviderType = EmailProviderType.MANUAL;

  @IsEmail()
  @MaxLength(160)
  email_address: string;

  @IsOptional()
  @IsString()
  @MaxLength(190)
  provider_account_id?: string;
}
