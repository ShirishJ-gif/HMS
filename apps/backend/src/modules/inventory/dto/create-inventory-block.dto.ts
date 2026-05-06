import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateInventoryBlockDto {
  @IsUUID()
  property_id: string;

  @IsUUID()
  room_category_id: string;

  @IsString()
  from_date: string;

  @IsString()
  to_date: string;

  @IsInt()
  @Min(1)
  @Max(1000)
  blocked_rooms: number;

  @IsString()
  @MaxLength(180)
  reason: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  source?: string;
}
