import { IsString, IsUUID, MaxLength } from 'class-validator';

export class MapZodomusPropertyDto {
  @IsUUID()
  connection_id: string;

  @IsString()
  @MaxLength(120)
  external_hotel_id: string;
}
