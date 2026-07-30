import { IsUrl, MaxLength } from 'class-validator';

export class FetchICalCalendarDto {
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(2048)
  url: string;
}
