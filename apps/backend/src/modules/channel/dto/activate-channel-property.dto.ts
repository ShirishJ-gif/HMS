import { IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class ActivateChannelPropertyDto {
  @IsInt()
  @IsIn([1, 2, 3, 4, 5])
  price_model_id: number;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  token?: string;
}
