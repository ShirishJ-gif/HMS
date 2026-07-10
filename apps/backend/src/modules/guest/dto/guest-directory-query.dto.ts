import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

export class GuestDirectoryQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  property_id?: string;

  @IsOptional()
  @IsIn(['ALL', 'GUEST_REGISTRY', 'RESERVATION_FEED'])
  source?: 'ALL' | 'GUEST_REGISTRY' | 'RESERVATION_FEED';
}
