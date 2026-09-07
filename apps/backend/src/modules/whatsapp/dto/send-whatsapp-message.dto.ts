import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class SendWhatsAppMessageDto {
  @IsIn(['TEXT'])
  type!: 'TEXT';

  @IsString()
  @MinLength(1)
  @MaxLength(4096)
  text!: string;
}
