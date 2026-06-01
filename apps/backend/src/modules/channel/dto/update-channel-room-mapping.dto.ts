import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateChannelRoomMappingDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  external_room_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  external_room_name?: string;
}
