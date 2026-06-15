import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsString, MaxLength, ValidateNested } from 'class-validator';

class CancelChannelRoomDto {
  @IsString()
  @MaxLength(80)
  roomId: string;
}

export class CancelChannelRoomsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CancelChannelRoomDto)
  rooms: CancelChannelRoomDto[];
}
