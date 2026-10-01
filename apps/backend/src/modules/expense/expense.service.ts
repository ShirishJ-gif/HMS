import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Expense, Prisma } from '@prisma/client';
import { paginationParams, paginatedResponse } from '../../common/pagination/paginated-response';
import { AuthenticatedUser } from '../auth/auth.guard';
import { assertCanAccessProperty, propertyIdFilter } from '../auth/property-scope';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { ExpenseQueryDto } from './dto/expense-query.dto';
import { ExpenseActionDto, UpdateExpenseDto } from './dto/update-expense.dto';

const relations = {
  property: { select: { id: true, name: true, code: true } },
  reservationGroup: { select: { id: true, externalReservationId: true } },
  receipts: { select: { id: true, name: true, mimeType: true, createdAt: true } },
} satisfies Prisma.ExpenseInclude;
type ExpenseRow = Prisma.ExpenseGetPayload<{ include: typeof relations }>;

@Injectable()
export class ExpenseService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateExpenseDto, user?: AuthenticatedUser) {
    assertCanAccessProperty(user, dto.property_id);
    return this.prisma.$transaction(async tx => {
      const data = await this.inputData(tx, dto);
      const expense = await tx.expense.create({ data: {
        ...data, createdByUserId: user?.sub ?? null, status: user?.role === 'STAFF' ? 'PENDING' : 'APPROVED',
      }, include: relations });
      await this.audit(tx, expense, user, 'CREATE', 'Expense created', { after: this.snapshot(expense) });
      return this.toResponse(expense);
    });
  }

  async update(id: string, dto: UpdateExpenseDto, user?: AuthenticatedUser) {
    return this.prisma.$transaction(async tx => {
      const existing = await this.lock(tx, id, user);
      this.assertEditable(existing, user);
      this.assertVersion(existing, dto.version);
      if (dto.property_id !== existing.propertyId) throw new BadRequestException('The expense property cannot be changed. Void this entry and create a new one.');
      const data = await this.inputData(tx, dto, existing);
      const updated = await tx.expense.update({ where: { id }, data: { ...data, version: { increment: 1 } }, include: relations });
      await this.audit(tx, updated, user, 'UPDATE', `Expense corrected: ${dto.reason.trim()}`.slice(0, 240), {
        reason: dto.reason.trim(), before: this.snapshot(existing), after: this.snapshot(updated),
      });
      return this.toResponse(updated);
    });
  }

  async changeStatus(id: string, dto: ExpenseActionDto, status: 'APPROVED' | 'VOID', user?: AuthenticatedUser) {
    if (user?.role === 'STAFF') throw new ForbiddenException('Manager access is required');
    return this.prisma.$transaction(async tx => {
      const existing = await this.lock(tx, id, user);
      this.assertVersion(existing, dto.version);
      if (existing.status === 'VOID' || (status === 'APPROVED' && existing.status !== 'PENDING')) throw new ConflictException('This expense is no longer eligible for that action');
      const updated = await tx.expense.update({ where: { id }, data: {
        status, voidReason: status === 'VOID' ? dto.reason.trim() : null, version: { increment: 1 },
      }, include: relations });
      await this.audit(tx, updated, user, 'UPDATE', status === 'VOID' ? 'Expense voided' : 'Expense approved', {
        reason: dto.reason.trim(), before: this.snapshot(existing), after: this.snapshot(updated),
      });
      return this.toResponse(updated);
    });
  }

  async findAll(query: ExpenseQueryDto, user?: AuthenticatedUser) {
    const { page, limit, skip, take } = paginationParams(query);
    const where = this.buildWhere(query, user);
    const [rows, total, sums, knownPayments] = await this.prisma.$transaction([
      this.prisma.expense.findMany({ where, include: relations, orderBy: this.sortOrder(query), skip, take }),
      this.prisma.expense.count({ where }),
      this.prisma.expense.groupBy({ by: ['currency'], orderBy: { currency: 'asc' }, where: { AND: [where, { status: { not: 'VOID' } }] }, _sum: { amount: true, amountPaid: true }, _count: { _all: true, amountPaid: true } }),
      this.prisma.expense.groupBy({ by: ['currency'], orderBy: { currency: 'asc' }, where: { AND: [where, { status: { not: 'VOID' }, amountPaid: { not: null } }] }, _sum: { amount: true, amountPaid: true } }),
    ]);
    return { ...paginatedResponse(rows.map(row => this.toResponse(row)), total, page, limit), summary: {
      totals: sums.map(sum => {
        const known = knownPayments.find(row => row.currency === sum.currency);
        return { currency: sum.currency, total_amount: Number(sum._sum?.amount ?? 0), recorded_paid: Number(sum._sum?.amountPaid ?? 0),
          outstanding: Number(new Prisma.Decimal(known?._sum?.amount ?? 0).minus(known?._sum?.amountPaid ?? 0)),
          unknown_payment_count: typeof sum._count === 'object' ? (sum._count._all ?? 0) - (sum._count.amountPaid ?? 0) : 0,
          unknown_payment_amount: Number(new Prisma.Decimal(sum._sum?.amount ?? 0).minus(known?._sum?.amount ?? 0)),
        };
      }),
    } };
  }

  async history(id: string, user?: AuthenticatedUser) {
    await this.findScoped(id, user);
    return this.prisma.auditLog.findMany({ where: { entityType: 'expense', entityId: id },
      select: { id: true, summary: true, metadata: true, createdAt: true, user: { select: { name: true } } }, orderBy: { createdAt: 'desc' } });
  }

  async attachReceipt(id: string, file: { buffer: Buffer; originalname: string } | undefined, user?: AuthenticatedUser) {
    if (!file || file.buffer.length === 0 || file.buffer.length > 5 * 1024 * 1024) throw new BadRequestException('Choose a PDF, JPEG or PNG receipt up to 5 MB');
    const bytes = file.buffer;
    const mimeType = bytes.subarray(0, 5).toString() === '%PDF-' ? 'application/pdf'
      : bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'image/png'
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg' : null;
    if (!mimeType) throw new BadRequestException('Receipt must be a PDF, JPEG or PNG file');
    return this.prisma.$transaction(async tx => {
      const expense = await this.lock(tx, id, user);
      this.assertEditable(expense, user);
      if (await tx.expenseReceipt.count({ where: { expenseId: id } }) >= 5) throw new BadRequestException('An expense can have up to five receipts');
      const receipt = await tx.expenseReceipt.create({ data: {
        expenseId: id, name: file.originalname.replace(/[\r\n/\\]/g, '_').slice(0, 180) || 'receipt', mimeType, content: bytes,
      }, select: { id: true, name: true, mimeType: true } });
      await this.audit(tx, expense, user, 'UPDATE', 'Receipt attached', { receipt_id: receipt.id, name: receipt.name });
      return receipt;
    });
  }

  async receipt(id: string, receiptId: string, user?: AuthenticatedUser) {
    await this.findScoped(id, user);
    const receipt = await this.prisma.expenseReceipt.findFirst({ where: { id: receiptId, expenseId: id } });
    if (!receipt) throw new NotFoundException('Receipt not found');
    return receipt;
  }

  async exportCsv(query: ExpenseQueryDto, user?: AuthenticatedUser) {
    const rows = await this.prisma.expense.findMany({ where: this.buildWhere(query, user), include: relations, orderBy: this.sortOrder(query) });
    const header = ['Date', 'Property', 'Category', 'Vendor', 'Vendor contact', 'Description', 'Amount', 'Currency', 'Payment mode', 'Amount paid', 'Payment status', 'Status', 'Invoice reference', 'Reservation', 'Void reason'];
    const body = rows.map(row => [row.expenseDate.toISOString().slice(0, 10), row.property.name, row.category, row.vendor ?? '', row.vendorContact ?? '', row.description, row.amount.toFixed(2), row.currency, row.paymentMode ?? '', row.amountPaid?.toFixed(2) ?? '', this.paymentStatus(row), row.status, row.invoiceNumber ?? '', row.reservationGroup?.externalReservationId ?? '', row.voidReason ?? '']);
    return [header, ...body].map(line => line.map(value => this.csvCell(value)).join(',')).join('\r\n');
  }

  private sortOrder(query: ExpenseQueryDto): Prisma.ExpenseOrderByWithRelationInput[] {
    const direction = query.sort_direction ?? 'desc';
    const primary: Prisma.ExpenseOrderByWithRelationInput = query.sort_by === 'amount' ? { amount: direction }
      : query.sort_by === 'vendor' ? { vendor: { sort: direction, nulls: 'last' } } : { expenseDate: direction };
    return [primary, { createdAt: 'desc' }, { id: 'desc' }];
  }

  private buildWhere(query: ExpenseQueryDto, user?: AuthenticatedUser): Prisma.ExpenseWhereInput {
    if (query.property_id) assertCanAccessProperty(user, query.property_id);
    const propertyId = query.property_id ?? propertyIdFilter(user);
    const from = query.date_from ? this.parseDate(query.date_from) : undefined;
    const to = query.date_to ? this.parseDate(query.date_to) : undefined;
    if (from && to && from > to) throw new BadRequestException('From date must be on or before To date');
    const payment = query.payment_status;
    const search = query.search?.trim();
    return {
      ...(propertyId ? { propertyId } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.status === 'ALL' ? {} : { status: !query.status || query.status === 'ACTIVE' ? { not: 'VOID' } : query.status }),
      ...(from || to ? { expenseDate: { gte: from, lte: to } } : {}),
      ...(payment === 'UNKNOWN' ? { amountPaid: null } : payment === 'UNPAID' ? { amountPaid: 0 } : payment === 'PAID' ? { amountPaid: { equals: this.prisma.expense.fields.amount } } : payment === 'PARTIAL' ? { amountPaid: { gt: 0, lt: this.prisma.expense.fields.amount } } : {}),
      ...(search ? { OR: ['description', 'vendor', 'invoiceNumber'].map(field => ({ [field]: { contains: search, mode: 'insensitive' } })) } : {}),
    };
  }

  private async inputData(tx: Prisma.TransactionClient, dto: CreateExpenseDto, existing?: Expense) {
    const amount = new Prisma.Decimal(dto.amount);
    const amountPaid = dto.amount_paid == null ? (existing?.amountPaid ?? null) : new Prisma.Decimal(dto.amount_paid);
    if (!amount.isFinite() || amount.lte(0) || amount.gt('99999999.99')) throw new BadRequestException('Amount must be positive and below 100,000,000');
    if (amountPaid && (!amountPaid.isFinite() || amountPaid.lt(0) || amountPaid.gt(amount))) throw new BadRequestException('Amount paid must be between zero and the expense amount');
    if (!dto.description.trim()) throw new BadRequestException('Description is required');
    const property = await tx.property.findUnique({ where: { id: dto.property_id } });
    if (!property) throw new NotFoundException('Property not found');
    if (dto.reservation_group_id) {
      const group = await tx.reservationGroup.findUnique({ where: { id: dto.reservation_group_id } });
      if (!group || group.propertyId !== dto.property_id) throw new BadRequestException('Choose a reservation belonging to this property');
    }
    if (dto.category === 'BOOKING_EXPENSE' && !dto.reservation_group_id && !(existing?.category === 'BOOKING_EXPENSE' && !existing.reservationGroupId)) throw new BadRequestException('A booking expense requires a reservation');
    return {
      propertyId: dto.property_id, expenseDate: this.parseDate(dto.expense_date), category: dto.category,
      vendor: dto.vendor?.trim() || null, vendorContact: dto.vendor_contact?.trim() || null, description: dto.description.trim(),
      amount, amountPaid, currency: dto.currency || 'INR', paymentMode: dto.payment_mode || null,
      invoiceNumber: dto.invoice_number?.trim() || null, reservationGroupId: dto.reservation_group_id || null,
    };
  }

  private async lock(tx: Prisma.TransactionClient, id: string, user?: AuthenticatedUser) {
    await tx.$queryRaw`SELECT id FROM expenses WHERE id = ${id}::uuid FOR UPDATE`;
    const row = await tx.expense.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Expense not found');
    assertCanAccessProperty(user, row.propertyId);
    return row;
  }

  private async findScoped(id: string, user?: AuthenticatedUser) {
    const row = await this.prisma.expense.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Expense not found');
    assertCanAccessProperty(user, row.propertyId);
    return row;
  }

  private assertEditable(row: Expense, user?: AuthenticatedUser) {
    if (row.status === 'VOID') throw new ConflictException('Voided expenses cannot be changed');
    if (user?.role === 'STAFF' && (row.status !== 'PENDING' || row.createdByUserId !== user.sub)) throw new ForbiddenException('Staff can only edit their own pending expenses');
  }

  private assertVersion(row: Expense, version: number) {
    if (row.version !== version) throw new ConflictException('This expense has changed. Refresh and try again.');
  }

  private audit(tx: Prisma.TransactionClient, row: Expense, user: AuthenticatedUser | undefined, action: 'CREATE' | 'UPDATE', summary: string, metadata: Prisma.InputJsonValue) {
    return tx.auditLog.create({ data: { action, entityType: 'expense', entityId: row.id, propertyId: row.propertyId, userId: user?.sub ?? null, summary, metadata } });
  }

  private snapshot(row: Expense) {
    return { date: row.expenseDate.toISOString().slice(0, 10), category: row.category, vendor: row.vendor, vendor_contact: row.vendorContact, description: row.description, amount: row.amount.toString(), amount_paid: row.amountPaid?.toString() ?? null, currency: row.currency, payment_mode: row.paymentMode, invoice_number: row.invoiceNumber, reservation_group_id: row.reservationGroupId, status: row.status };
  }

  private parseDate(value: string) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new BadRequestException('Enter a valid date in YYYY-MM-DD format');
    return date;
  }

  private paymentStatus(row: Expense) {
    return row.amountPaid == null ? 'UNKNOWN' : row.amountPaid.eq(0) ? 'UNPAID' : row.amountPaid.eq(row.amount) ? 'PAID' : 'PARTIAL';
  }

  private csvCell(value: string) {
    const safe = /^[\s]*[=+@-]/.test(value) ? `'${value}` : value;
    return `"${safe.replace(/"/g, '""')}"`;
  }

  private toResponse(row: ExpenseRow) {
    return {
      id: row.id, property_id: row.propertyId, expense_date: row.expenseDate.toISOString().slice(0, 10), category: row.category,
      vendor: row.vendor, vendor_contact: row.vendorContact, description: row.description, amount: Number(row.amount), currency: row.currency,
      amount_paid: row.amountPaid == null ? null : Number(row.amountPaid), balance_due: row.amountPaid == null ? null : Number(row.amount.minus(row.amountPaid)),
      payment_status: this.paymentStatus(row), payment_mode: row.paymentMode, invoice_number: row.invoiceNumber,
      reservation_group_id: row.reservationGroupId, reservation_reference: row.reservationGroup?.externalReservationId ?? null,
      status: row.status, version: row.version, void_reason: row.voidReason, created_by_user_id: row.createdByUserId,
      property: row.property, receipts: row.receipts.map(receipt => ({ id: receipt.id, name: receipt.name })),
      created_at: row.createdAt.toISOString(), updated_at: row.updatedAt.toISOString(),
    };
  }
}
