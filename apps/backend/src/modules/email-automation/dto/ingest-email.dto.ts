import { IsArray, IsDateString, IsEmail, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class IngestEmailAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsEmail()
  email: string;
}

class IngestEmailAttachmentDto {
  @IsOptional()
  @IsString()
  @MaxLength(190)
  provider_attachment_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  file_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  mime_type?: string;
}

export class IngestEmailDto {
  @IsString()
  @MaxLength(190)
  provider_message_id: string;

  @IsOptional()
  @IsString()
  @MaxLength(190)
  provider_thread_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(190)
  internet_message_id?: string;

  @ValidateNested()
  @Type(() => IngestEmailAddressDto)
  from: IngestEmailAddressDto;

  @IsString()
  @MaxLength(300)
  subject: string;

  @IsOptional()
  @IsDateString()
  received_at?: string;

  @IsOptional()
  @IsDateString()
  sent_at?: string;

  @IsOptional()
  @IsString()
  plain_text?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IngestEmailAttachmentDto)
  attachments?: IngestEmailAttachmentDto[];
}
