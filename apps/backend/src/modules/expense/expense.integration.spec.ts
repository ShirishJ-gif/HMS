import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { ExpenseService } from './expense.service';
import { AuthenticatedUser } from '../auth/auth.guard';

const integration = process.env.RUN_EXPENSE_INTEGRATION === 'true' ? describe : describe.skip;

integration('Expense workflow (rolled back)', () => {
  const prisma = new PrismaClient();
  afterAll(() => prisma.$disconnect());

  async function run(check: (context: Awaited<ReturnType<typeof setup>>) => Promise<void>) {
    const rollback = new Error('rollback expense test');
    await expect(prisma.$transaction(async tx => {
      await check(await setup(tx));
      throw rollback;
    }, { timeout: 60000 })).rejects.toBe(rollback);
  }

  async function setup(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) {
    const db = new Proxy(tx, { get: (target, key) => key === '$transaction'
      ? async (input: unknown) => typeof input === 'function' ? input(tx) : Promise.all(input as Promise<unknown>[])
      : Reflect.get(target, key) });
    const property = await tx.property.create({ data: { name: 'Expense test', code: randomUUID(), address: 'Test' } });
    const other = await tx.property.create({ data: { name: 'Other expense test', code: randomUUID(), address: 'Test' } });
    const staffRecord = await tx.user.create({ data: { propertyId: property.id, name: 'Staff test', email: `${randomUUID()}@example.test`, passwordHash: 'test', role: 'STAFF' } });
    const staff: AuthenticatedUser = { sub: staffRecord.id, role: 'STAFF', property_id: property.id, organization_id: null, email: staffRecord.email };
    const manager: AuthenticatedUser = { ...staff, role: 'ADMIN' };
    const service = new ExpenseService(db as never);
    const input = { property_id: property.id, expense_date: '2026-09-17', category: 'SUPPLIES', description: 'Linen', amount: '100.00', amount_paid: '0', currency: 'INR', payment_mode: 'CASH' };
    const query = { page: 1, limit: 25, property_id: property.id };
    return { tx, service, property, other, staff, manager, input, query };
  }

  it('tracks unpaid, partial and paid expenses, corrections, stale edits and void history', async () => run(async ({ service, input, query, manager }) => {
    const row = await service.create(input, manager);
    expect(row.payment_status).toBe('UNPAID');
    const partial = await service.update(row.id, { ...input, amount_paid: '40', version: row.version, reason: 'Deposit paid' }, manager);
    expect(partial.payment_status).toBe('PARTIAL');
    expect(partial.balance_due).toBe(60);
    await expect(service.update(row.id, { ...input, version: row.version, reason: 'Old edit' }, manager)).rejects.toThrow('has changed');
    await expect(service.update(row.id, { ...input, amount_paid: '101', version: partial.version, reason: 'Invalid' }, manager)).rejects.toThrow('between zero');
    const paid = await service.update(row.id, { ...input, amount_paid: '100', version: partial.version, reason: 'Settled vendor' }, manager);
    expect(paid.payment_status).toBe('PAID');
    expect((await service.findAll({ ...query, payment_status: 'PAID' }, manager)).meta.total).toBe(1);
    const voided = await service.changeStatus(row.id, { version: paid.version, reason: 'Duplicate entry' }, 'VOID', manager);
    expect(voided.status).toBe('VOID');
    expect((await service.findAll(query, manager)).meta.total).toBe(0);
    const all = await service.findAll({ ...query, status: 'ALL' }, manager);
    expect(all.meta.total).toBe(1);
    expect(all.summary.totals).toEqual([]);
    await expect(service.update(row.id, { ...input, version: voided.version, reason: 'Change' }, manager)).rejects.toThrow('Voided');
    const history = await service.history(row.id, manager);
    expect(history).toHaveLength(4);
    expect(history.some(entry => entry.summary === 'Expense voided')).toBe(true);
  }));

  it('requires approval for staff and limits edits and cross-property access', async () => run(async ({ service, input, staff, manager, other }) => {
    const pending = await service.create(input, staff);
    expect(pending.status).toBe('PENDING');
    await expect(service.changeStatus(pending.id, { version: 1, reason: 'Approve' }, 'APPROVED', staff)).rejects.toThrow('Manager');
    await expect(service.update(pending.id, { ...input, reason: 'Not mine', version: 1 }, { ...staff, sub: randomUUID() })).rejects.toThrow('own pending');
    const approved = await service.changeStatus(pending.id, { version: 1, reason: 'Receipt checked' }, 'APPROVED', manager);
    await expect(service.update(pending.id, { ...input, reason: 'Edit', version: approved.version }, staff)).rejects.toThrow('own pending');
    await expect(service.create({ ...input, property_id: other.id }, staff)).rejects.toThrow('access');
    await expect(service.history(pending.id, { ...staff, property_id: other.id })).rejects.toThrow('access');
  }));

  it('separates currencies and honors a selected property within an organization', async () => run(async ({ service, input, query, staff, other }) => {
    const owner: AuthenticatedUser = { ...staff, role: 'ORG_OWNER', property_ids: [input.property_id, other.id] };
    await service.create(input, owner);
    await service.create({ ...input, currency: 'USD', amount: '25', amount_paid: '5' }, owner);
    await service.create({ ...input, property_id: other.id, amount: '500' }, owner);
    const selected = await service.findAll(query, owner);
    expect(selected.meta.total).toBe(2);
    expect(selected.summary.totals).toEqual([
      { currency: 'INR', total_amount: 100, recorded_paid: 0, outstanding: 100, unknown_payment_count: 0, unknown_payment_amount: 0 },
      { currency: 'USD', total_amount: 25, recorded_paid: 5, outstanding: 20, unknown_payment_count: 0, unknown_payment_amount: 0 },
    ]);
    expect((await service.findAll({ ...query, payment_status: 'PARTIAL' }, owner)).meta.total).toBe(1);
    expect((await service.findAll({ page: 1, limit: 25 }, owner)).meta.total).toBe(3);
    await expect(service.findAll({ ...query, date_from: '2026-10-01', date_to: '2026-09-01' }, owner)).rejects.toThrow('From date');
    await expect(service.findAll({ ...query, date_from: '2026-02-30' }, owner)).rejects.toThrow('valid date');
  }));

  it('validates reservation links and preserves unspecified legacy payment status', async () => run(async ({ tx, service, input, query, manager, property, other }) => {
    const group = await tx.reservationGroup.create({ data: { propertyId: property.id, externalReservationId: randomUUID() } });
    const wrong = await tx.reservationGroup.create({ data: { propertyId: other.id, externalReservationId: randomUUID() } });
    await expect(service.create({ ...input, category: 'BOOKING_EXPENSE' }, manager)).rejects.toThrow('requires a reservation');
    await expect(service.create({ ...input, reservation_group_id: wrong.id }, manager)).rejects.toThrow('belonging');
    const linked = await service.create({ ...input, category: 'BOOKING_EXPENSE', reservation_group_id: group.id }, manager);
    expect(linked.reservation_reference).toBe(group.externalReservationId);
    await tx.expense.create({ data: { propertyId: property.id, expenseDate: new Date('2026-09-17'), category: 'PROPERTY_EXPENSE', description: 'Legacy', amount: 75 } });
    const legacy = await service.findAll({ ...query, payment_status: 'UNKNOWN' }, manager);
    expect(legacy.data[0].amount_paid).toBeNull();
    expect(legacy.data[0].balance_due).toBeNull();
  }));

  it('protects receipts and exports safe, filtered CSV', async () => run(async ({ service, input, query, manager, other }) => {
    const row = await service.create({ ...input, description: '=SUM(1,2)', invoice_number: 'REF-1' }, manager);
    const file = { buffer: Buffer.from('%PDF-1.4\nTest receipt'), originalname: 'receipt.pdf' };
    const receipt = await service.attachReceipt(row.id, file, manager);
    expect((await service.receipt(row.id, receipt.id, manager)).content).toEqual(file.buffer);
    await expect(service.receipt(row.id, receipt.id, { ...manager, property_id: other.id })).rejects.toThrow('access');
    await expect(service.attachReceipt(row.id, { buffer: Buffer.from('<script>'), originalname: 'fake.pdf' }, manager)).rejects.toThrow('PDF');
    expect((await service.findAll(query, manager)).data[0].receipts).toEqual([{ id: receipt.id, name: 'receipt.pdf' }]);
    const csv = await service.exportCsv({ ...query, search: 'REF-1' }, manager);
    expect(csv).toContain('"\'=SUM(1,2)"');
    expect(csv).toContain('UNPAID');
    expect((await service.exportCsv({ ...query, search: 'missing' }, manager)).split('\r\n')).toHaveLength(1);
  }));
  it('sorts the full register before pagination and exports the same order', async () => run(async ({ service, input, query, manager }) => {
    const first = await service.create({ ...input, vendor: 'Alpha', amount: '10', expense_date: '2026-09-15' }, manager);
    const last = await service.create({ ...input, vendor: 'Zulu', amount: '900', expense_date: '2026-09-20' }, manager);
    await service.create({ ...input, vendor: 'Middle', amount: '50', expense_date: '2026-09-18' }, manager);
    for (const sort_by of ['amount', 'date', 'vendor'] as const) {
      const asc = await service.findAll({ ...query, limit: 1, sort_by, sort_direction: 'asc' }, manager);
      const desc = await service.findAll({ ...query, limit: 1, sort_by, sort_direction: 'desc' }, manager);
      expect(asc.data[0].id).toBe(first.id);
      expect(desc.data[0].id).toBe(last.id);
      expect(asc.meta.total).toBe(3);
    }
    const csv = await service.exportCsv({ ...query, sort_by: 'amount', sort_direction: 'desc' }, manager);
    expect(csv.indexOf('Zulu')).toBeLessThan(csv.indexOf('Alpha'));
  }));
  it('excludes unknown payments from outstanding balances and excludes voids from every total', async () => run(async ({ service, input, query, manager }) => {
    await service.create({ ...input, amount: '100', amount_paid: '25' }, manager);
    await service.create({ ...input, amount: '70', amount_paid: null }, manager);
    const voided = await service.create({ ...input, amount: '900', amount_paid: '0' }, manager);
    await service.changeStatus(voided.id, { version: 1, reason: 'Duplicate' }, 'VOID', manager);
    const report = await service.findAll({ ...query, status: 'ALL', limit: 1 }, manager);
    expect(report.meta.total).toBe(3);
    expect(report.summary.totals).toEqual([{ currency: 'INR', total_amount: 170, recorded_paid: 25, outstanding: 75, unknown_payment_count: 1, unknown_payment_amount: 70 }]);
  }));
});
