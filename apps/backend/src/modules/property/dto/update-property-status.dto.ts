import { IsBoolean } from 'class-validator';

export class UpdatePropertyStatusDto {
  @IsBoolean()
  is_active: boolean;
}
