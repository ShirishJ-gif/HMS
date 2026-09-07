import { Body, Controller, Get, Header, Post, Query } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ExpenseQueryDto } from './dto/expense-query.dto';
import { ExpenseService } from './expense.service';

@Controller('expenses')
export class ExpenseController {
  constructor(private readonly expenseService: ExpenseService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateExpenseDto) {
    return this.expenseService.create(dto, user);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Query() query: ExpenseQueryDto) {
    return this.expenseService.findAll(query, user);
  }

  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="expenses.csv"')
  exportCsv(@CurrentUser() user: AuthenticatedUser, @Query() query: ExpenseQueryDto) {
    return this.expenseService.exportCsv(query, user);
  }
}
