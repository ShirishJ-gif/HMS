import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { paginatedResponse, paginationParams } from '../../common/pagination/paginated-response';
import { AuthenticatedUser } from '../auth/auth.guard';
import { assertCanAccessProperty, propertyIdFilter } from '../auth/property-scope';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ExpenseQueryDto } from './dto/expense-query.dto';

const EXPENSE_CATEGORY_LABELS: Record<string, string> = {
  PROPERTY_EXPENSE: 'Property expense',
  BOOKING_EXPENSE: 'Booking expense',
};

@Injectable()
export class ExpenseService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateExpenseDto, user?: AuthenticatedUser) {
    assertCanAccessProperty(user, dto.property_id);
    const expenseDate = this.parseDateOnly(dto.expense_date, 'expense_date');
    const amount = new Prisma.Decimal(dto.amount);
    if (amount.lte(0)) throw new BadRequestException('amount must be greater than zero');

    const expense = await this.prisma.expense.create({
      data: {
        propertyId: dto.property_id,
        expenseDate,
        category: dto.category.trim(),
        vendor: dto.vendor?.trim() || null,
        vendorContact: dto.vendor_contact?.trim() || null,
        description: dto.description.trim(),
        amount,
        currency: dto.currency?.trim().toUpperCase() || 'INR',
        paymentMode: dto.payment_mode?.trim() || null,
        createdByUserId: user?.sub ?? null,
      },
      include: { property: { select: { id: true, name: true, code: true } } },
    });

    return this.toResponse(expense);
  }

  async findAll(query: ExpenseQueryDto, user?: AuthenticatedUser) {
    const { page, limit, skip, take } = paginationParams(query);
    const where = this.buildWhere(query, user);
    const [rows, total, sum] = await this.prisma.$transaction([
      this.prisma.expense.findMany({
        where,
        include: { property: { select: { id: true, name: true, code: true } } },
        orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
      }),
      this.prisma.expense.count({ where }),
      this.prisma.expense.aggregate({ where, _sum: { amount: true } }),
    ]);

    return {
      ...paginatedResponse(rows.map((row) => this.toResponse(row)), total, page, limit),
      summary: { total_amount: sum._sum.amount == null ? 0 : Number(sum._sum.amount) },
    };
  }

  async exportCsv(query: ExpenseQueryDto, user?: AuthenticatedUser) {
    const rows = await this.prisma.expense.findMany({
      where: this.buildWhere(query, user),
      include: { property: { select: { name: true, code: true } } },
      orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
    });
    const header = ['Date', 'Property', 'Category', 'Vendor', 'Vendor contact', 'Description', 'Amount', 'Currency', 'Payment mode'];
    const body = rows.map((row) => [
      row.expenseDate.toISOString().slice(0, 10),
      `${row.property.name} (${row.property.code})`,
      EXPENSE_CATEGORY_LABELS[row.category] ?? row.category,
      row.vendor ?? '',
      row.vendorContact ?? '',
      row.description,
      row.amount.toFixed(2),
      row.currency,
      row.paymentMode ?? '',
    ]);
    return [header, ...body].map((line) => line.map((value) => this.csvCell(value)).join(',')).join('\n');
  }

  private buildWhere(query: ExpenseQueryDto, user?: AuthenticatedUser): Prisma.ExpenseWhereInput {
    const scopedPropertyId = propertyIdFilter(user);
    const propertyId = scopedPropertyId ?? query.property_id;
    if (query.property_id) assertCanAccessProperty(user, query.property_id);
    return {
      ...(propertyId ? { propertyId } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...((query.date_from || query.date_to)
        ? {
            expenseDate: {
              ...(query.date_from ? { gte: this.parseDateOnly(query.date_from, 'date_from') } : {}),
              ...(query.date_to ? { lte: this.parseDateOnly(query.date_to, 'date_to') } : {}),
            },
          }
        : {}),
    };
  }

  private parseDateOnly(value: string, field: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException(`${field} must use YYYY-MM-DD format`);
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      throw new BadRequestException(`${field} must be a valid date`);
    }
    return date;
  }

  private csvCell(value: string) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  private toResponse(expense: {
    id: string;
    propertyId: string;
    expenseDate: Date;
    category: string;
    vendor: string | null;
    vendorContact: string | null;
    description: string;
    amount: Prisma.Decimal;
    currency: string;
    paymentMode: string | null;
    createdAt: Date;
    updatedAt: Date;
    property: { id: string; name: string; code: string };
  }) {
    return {
      id: expense.id,
      property_id: expense.propertyId,
      expense_date: expense.expenseDate.toISOString().slice(0, 10),
      category: expense.category,
      vendor: expense.vendor,
      vendor_contact: expense.vendorContact,
      description: expense.description,
      amount: Number(expense.amount),
      currency: expense.currency,
      payment_mode: expense.paymentMode,
      property: expense.property,
      created_at: expense.createdAt.toISOString(),
      updated_at: expense.updatedAt.toISOString(),
    };
  }
}
