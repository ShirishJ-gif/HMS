import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class SyncICalCalendarDto {
  @IsUUID()
  property_id: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  feed_key: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @IsString()
  @MaxLength(2000000)
  content: string;
}
