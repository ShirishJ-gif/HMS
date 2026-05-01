import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateChannelRoomMappingDto {
  @IsUUID()
  room_category_id: string;

  @IsString()
  @MaxLength(120)
  external_room_id: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  external_room_name?: string;
}
