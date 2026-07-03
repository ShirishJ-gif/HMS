import { IsOptional, IsUUID } from 'class-validator';

export class CheckInReservationRoomDto {
  @IsOptional()
  @IsUUID()
  room_id?: string;
}
