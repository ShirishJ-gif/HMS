import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AirbnbOauthTestDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  token?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  client_id?: string;
}
