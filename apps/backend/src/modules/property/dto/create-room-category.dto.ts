import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateRoomCategoryDto {
  @IsUUID()
  property_id: string;

  @IsString()
  @MaxLength(80)
  name: string;

  @IsString()
  @MaxLength(40)
  code: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsInt()
  @Min(1)
  @Max(20)
  max_occupancy: number;
}
