import { Body, Controller, Get, Header, Post, Query, Put, Param, ParseUUIDPipe, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { ExpenseActionDto, UpdateExpenseDto } from './dto/update-expense.dto';
import { AuthenticatedUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ExpenseQueryDto } from './dto/expense-query.dto';
import { ExpenseService } from './expense.service';

@Controller('expenses')
export class ExpenseController {
  constructor(private readonly expenseService: ExpenseService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.STAFF)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateExpenseDto) {
    return this.expenseService.create(dto, user);
  }

  @Put(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.STAFF)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExpenseDto, @CurrentUser() user: AuthenticatedUser) {
    return this.expenseService.update(id, dto, user);
  }

  @Post(':id/approve')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  approve(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ExpenseActionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.expenseService.changeStatus(id, dto, 'APPROVED', user);
  }

  @Post(':id/void')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  voidExpense(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ExpenseActionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.expenseService.changeStatus(id, dto, 'VOID', user);
  }

  @Get(':id/history')
  history(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.expenseService.history(id, user);
  }

  @Post(':id/receipts')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.STAFF)
  @UseInterceptors(FileInterceptor('receipt', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  attachReceipt(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined, @CurrentUser() user: AuthenticatedUser) {
    return this.expenseService.attachReceipt(id, file, user);
  }

  @Get(':id/receipts/:receiptId')
  async downloadReceipt(@Param('id', ParseUUIDPipe) id: string, @Param('receiptId', ParseUUIDPipe) receiptId: string, @CurrentUser() user: AuthenticatedUser, @Res() response: Response) {
    const receipt = await this.expenseService.receipt(id, receiptId, user);
    response.setHeader('Content-Type', receipt.mimeType);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(receipt.name)}`);
    response.send(receipt.content);
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
