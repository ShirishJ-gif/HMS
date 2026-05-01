import { RoomStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateRoomDto {
  @IsUUID()
  property_id: string;

  @IsUUID()
  room_category_id: string;

  @IsString()
  @MaxLength(20)
  room_number: string;

  @IsOptional()
  @IsEnum(RoomStatus)
  status?: RoomStatus;
}
