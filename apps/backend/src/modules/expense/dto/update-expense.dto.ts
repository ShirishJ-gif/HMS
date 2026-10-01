import { IsInt, IsString, Matches, MaxLength, Min } from 'class-validator';
import { CreateExpenseDto } from './create-expense.dto';

export class ExpenseActionDto {
  @IsInt()
  @Min(1)
  version: number;

  @IsString()
  @Matches(/\S/, { message: 'A reason is required' })
  @MaxLength(300)
  reason: string;
}

export class UpdateExpenseDto extends CreateExpenseDto {
  @IsInt()
  @Min(1)
  version: number;

  @IsString()
  @Matches(/\S/, { message: 'A reason is required' })
  @MaxLength(300)
  reason: string;
}
