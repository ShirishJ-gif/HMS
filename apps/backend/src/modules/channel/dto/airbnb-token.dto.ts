import { IsString, MaxLength, MinLength } from 'class-validator';

export class AirbnbTokenDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  token!: string;
}
