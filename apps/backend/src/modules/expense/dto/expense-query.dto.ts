import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { EXPENSE_CATEGORIES } from './create-expense.dto';

export class ExpenseQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(['date', 'amount', 'vendor'])
  sort_by?: 'date' | 'amount' | 'vendor';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sort_direction?: 'asc' | 'desc';

  @IsOptional()
  @IsIn(['ACTIVE', 'PENDING', 'APPROVED', 'VOID', 'ALL'])
  status?: string;

  @IsOptional()
  @IsIn(['UNPAID', 'PARTIAL', 'PAID', 'UNKNOWN'])
  payment_status?: string;
  @IsOptional()
  @IsUUID()
  property_id?: string;

  @IsOptional()
  @IsString()
  date_from?: string;

  @IsOptional()
  @IsString()
  date_to?: string;

  @IsOptional()
  @IsString()
  @IsIn(EXPENSE_CATEGORIES)
  category?: string;
}
