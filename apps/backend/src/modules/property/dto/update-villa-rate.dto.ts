import { IsNumber, IsOptional, IsInt, Max, Min } from 'class-validator';

export class UpdateVillaRateDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(99999999.99)
  nightly_rate: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(99999999.99)
  whole_villa_rate?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(99999999.99)
  per_room_rate?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  total_rooms?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  min_rooms?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  max_rooms?: number;
}
