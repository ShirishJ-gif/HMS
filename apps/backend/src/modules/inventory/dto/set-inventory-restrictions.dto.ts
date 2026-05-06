import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class SetInventoryRestrictionsDto {
  @IsUUID()
  property_id: string;

  @IsUUID()
  room_category_id: string;

  @IsString()
  from_date: string;

  @IsString()
  to_date: string;

  @IsOptional()
  @IsBoolean()
  stop_sell?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  min_stay?: number | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  max_stay?: number | null;
}
