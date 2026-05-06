import { IsIn, IsInt } from 'class-validator';

export class ActivateChannelPropertyDto {
  @IsInt()
  @IsIn([1, 2, 3, 4])
  price_model_id: number;
}
