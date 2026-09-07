import { AutomationDecision } from '@prisma/client';
import { IsDateString, IsEmail, IsEnum, IsInt, IsObject, IsOptional, IsString, Max, Min } from 'class-validator';

export class ReviewEmailCorrectionsDto {
  @IsOptional()
  @IsString()
  guest_name?: string;

  @IsOptional()
  @IsEmail()
  guest_email?: string;

  @IsOptional()
  @IsString()
  guest_phone?: string;

  @IsOptional()
  @IsDateString()
  check_in?: string;

  @IsOptional()
  @IsDateString()
  check_out?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  adults?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  children?: number;
}

export class ReviewEmailDto {
  @IsEnum(AutomationDecision)
  action: AutomationDecision;

  @IsOptional()
  @IsObject()
  corrections?: ReviewEmailCorrectionsDto;
}
