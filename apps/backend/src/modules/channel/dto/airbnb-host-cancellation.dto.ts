import { IsString, MaxLength } from 'class-validator';

export class AirbnbHostCancellationDto {
  @IsString()
  @MaxLength(160)
  token: string;
}
