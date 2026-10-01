import '../../common/env/load-env';
import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { BillingService } from './billing.service';
import { PaymentService } from '../payment/payment.service';
import { PaymentProviderService } from '../payment/payment-provider.service';
import { AuthenticatedUser } from '../auth/auth.guard';
import { AuditLogService } from '../audit-log/audit-log.service';

const integration = process.env.RUN_BILLING_INTEGRATION === 'true' ? describe : describe.skip;

integration('Billing and payments (rolled back)', () => {
  const prisma = new PrismaClient();
  afterAll(() => prisma.$disconnect());

  async function run(check: (context: Awaited<ReturnType<typeof setup>>) => Promise<void>) {
    const rollback = new Error('rollback billing test');
    await expect(prisma.$transaction(async tx => {
      await check(await setup(tx));
      throw rollback;
    }, { timeout: 30000 })).rejects.toBe(rollback);
  }

  async function setup(tx: Prisma.TransactionClient) {
    const db = new Proxy(tx, { get: (target, key) => key === '$transaction'
      ? async (input: unknown) => typeof input === 'function' ? input(tx) : Promise.all(input as Promise<unknown>[])
      : Reflect.get(target, key) });
    const property = await tx.property.create({ data: { name: 'Billing test', code: randomUUID(), address: 'Test' } });
    const staff = await tx.user.create({ data: { propertyId: property.id, name: 'Rahul', email: `${randomUUID()}@example.test`, passwordHash: 'test', role: 'STAFF' } });
    const actor: AuthenticatedUser = { sub: staff.id, email: staff.email, role: 'STAFF', property_id: property.id, organization_id: null };
    const category = await tx.roomCategory.create({ data: { propertyId: property.id, name: 'Test', code: 'TEST' } });
    const rate = await tx.ratePlan.create({ data: { propertyId: property.id, roomCategoryId: category.id, name: 'Test', code: 'TEST', baseRate: 100 } });
    const group = await tx.reservationGroup.create({ data: { propertyId: property.id, externalReservationId: randomUUID() } });
    const room = await tx.reservationRoom.create({ data: {
      propertyId: property.id, reservationGroupId: group.id, roomCategoryId: category.id, ratePlanId: rate.id,
      externalRoomReservationId: randomUUID(), externalRoomId: randomUUID(),
      arrivalDate: new Date('2026-10-01'), departureDate: new Date('2026-10-02'), totalAmount: 100, guestName: 'Amit', currency: 'INR',
    } });
    const bill = await tx.billing.create({ data: { reservationRoomId: room.id, amount: 100, tax: 0, total: 100 } });
    const billing = new BillingService(db as never);
    const payments = new PaymentService(db as never, new PaymentProviderService(),
      { run: (_key: unknown, _scope: unknown, _input: unknown, _user: unknown, action: () => Promise<unknown>) => action() } as never,
      { recordPaymentCollect: jest.fn(), recordPaymentRefund: jest.fn() } as never);
    return { tx, bill, group, billing, payments, actor, audit: new AuditLogService(db as never) };
  }

  it('counts a refund once, permits recollection and keeps the stored status and folio consistent', async () => run(async ({ tx, bill, group, billing, payments }) => {
    const payment = await payments.collect({ billing_id: bill.id, amount: '100', provider: 'CASH' });
    expect((await billing.findOne(bill.id)).payment_status).toBe('PAID');
    await payments.refund(payment.id, { amount: '60' });
    expect(await billing.findOne(bill.id)).toMatchObject({ payment_status: 'PARTIAL', balance_due: 60, refunded_total: 60 });
    expect((await tx.billing.findUniqueOrThrow({ where: { id: bill.id } })).paymentStatus).toBe('PARTIAL');
    await expect(payments.collect({ billing_id: bill.id, amount: '61' })).rejects.toThrow('exceeds');
    const collected = await payments.collectReservationGroup({ reservation_group_id: group.id, amount: '60', provider: 'CASH' });
    expect(collected).toMatchObject({ allocated_total: 60, remaining_balance: 0 });
    expect(await billing.findReservationGroupFolio(group.id)).toMatchObject({ balance_due: 0, paid_total: 160, refunded_total: 60 });
    expect((await tx.billing.findUniqueOrThrow({ where: { id: bill.id } })).paymentStatus).toBe('PAID');
  }));

  it('reopens paid bills for extra charges and settles them again after charge removal', async () => run(async ({ tx, bill, billing, payments }) => {
    await payments.collect({ billing_id: bill.id, amount: '100' });
    const added = await billing.addExtraCharge(bill.id, { description: 'Dinner', amount: '25' });
    expect(added).toMatchObject({ total: 125, balance_due: 25, payment_status: 'PARTIAL' });
    await expect(billing.updatePaymentStatus(bill.id, { payment_status: 'PAID' })).rejects.toThrow('must match');
    const charge = await tx.billingExtraCharge.findFirstOrThrow({ where: { billingId: bill.id } });
    expect(await billing.deleteExtraCharge(bill.id, charge.id)).toMatchObject({ total: 100, balance_due: 0, payment_status: 'PAID' });
  }));

  it('keeps an Airbnb net payout settled while collecting and refunding services separately', async () => run(async ({ tx, bill, group, billing, payments }) => {
    await tx.paymentTransaction.create({ data: { billingId: bill.id, amount: 80, status: 'SUCCEEDED', metadata: { source: 'airbnb_payout_email' } } });
    expect(await billing.findOne(bill.id)).toMatchObject({ payment_status: 'PAID', paid_total: 80, balance_due: 0 });
    await billing.addExtraCharge(bill.id, { description: 'OTA commission', amount: '20' });
    expect(await billing.addExtraCharge(bill.id, { description: 'Dinner', amount: '25' })).toMatchObject({ total: 125, balance_due: 25, payment_status: 'PARTIAL' });
    const collected = await payments.collectReservationGroup({ reservation_group_id: group.id, amount: '25' });
    expect(collected.remaining_balance).toBe(0);
    await payments.refund(collected.payments[0].payment_id, { amount: '10' });
    expect(await billing.findOne(bill.id)).toMatchObject({ total: 125, paid_total: 105, refunded_total: 10, balance_due: 10, payment_status: 'PARTIAL' });
    await payments.collect({ billing_id: bill.id, amount: '10' });
    expect((await billing.findOne(bill.id)).payment_status).toBe('PAID');
  }));

  it('records the actor, guest, charge and ledger changes, retaining history after charge and staff deletion', async () => run(async ({ tx, bill, group, billing, payments, actor, audit }) => {
    await billing.addExtraCharge(bill.id, { description: 'Food', amount: '25' }, actor);
    const charge = await tx.billingExtraCharge.findFirstOrThrow({ where: { billingId: bill.id } });
    const payment = await payments.collect({ billing_id: bill.id, amount: '125' }, actor);
    await payments.refund(payment.id, { amount: '25', reason: 'Food cancelled' }, actor);
    await billing.deleteExtraCharge(bill.id, charge.id, actor);
    const logs = (await audit.findAll({ page: 1, limit: 25 }, actor)).data;
    expect(logs).toHaveLength(4);
    const event = (operation: string) => logs.find(log => (log.metadata as Prisma.JsonObject).operation === operation)!;
    expect(event('charge_added')).toMatchObject({
      property_id: actor.property_id, user_id: actor.sub, action: 'CREATE', entity_type: 'billing', entity_id: bill.id,
      user: { name: 'Rahul' },
      metadata: {
        guest_name: 'Amit', reservation_reference: group.externalReservationId, billing_id: bill.id, currency: 'INR',
        actor: { id: actor.sub, name: 'Rahul', role: 'STAFF' }, charge_id: charge.id, description: 'Food', amount: '25.00',
        before: { total: '100.00', balance_due: '100.00' }, after: { total: '125.00', balance_due: '125.00' },
      },
    });
    expect(event('payment_collected').metadata).toMatchObject({ payment_id: payment.id, before: { balance_due: '125.00' }, after: { balance_due: '0.00' } });
    expect(event('payment_refunded').metadata).toMatchObject({ reason: 'Food cancelled', before: { balance_due: '0.00' }, after: { balance_due: '25.00' } });
    expect(event('charge_removed').metadata).toMatchObject({ description: 'Food', amount: '25.00', before: { total: '125.00' }, after: { total: '100.00', balance_due: '0.00' } });
    await tx.user.delete({ where: { id: actor.sub } });
    const retained = await tx.auditLog.findUniqueOrThrow({ where: { id: event('charge_added').id } });
    expect(retained.userId).toBeNull();
    expect(retained.metadata).toMatchObject({ actor: { name: 'Rahul' }, description: 'Food' });
    expect(await tx.billingExtraCharge.count({ where: { id: charge.id } })).toBe(0);
  }));

  it('logs each invoice allocation in a folio and prevents cross-property charge changes', async () => run(async ({ tx, bill, group, billing, payments, actor, audit }) => {
    await payments.collectReservationGroup({ reservation_group_id: group.id, amount: '40' }, actor);
    const logs = (await audit.findAll({ page: 1, limit: 25 }, actor)).data;
    expect(logs).toHaveLength(1);
    expect(logs[0].metadata).toMatchObject({ actor: { name: 'Rahul' }, guest_name: 'Amit', amount: '40.00', before: { balance_due: '100.00' }, after: { balance_due: '60.00' } });
    const outsider = { ...actor, property_id: randomUUID() };
    await expect(billing.addExtraCharge(bill.id, { description: 'Food', amount: '20' }, outsider)).rejects.toThrow('access');
    expect((await audit.findAll({ page: 1, limit: 25 }, outsider)).data).toHaveLength(0);
    expect(await tx.auditLog.count({ where: { entityId: bill.id } })).toBe(1);
  }));

  it('rolls back the charge if writing its audit entry fails', async () => {
    let billId: string | undefined;
    const auditError = new Error('Audit storage unavailable');
    await expect(prisma.$transaction(async tx => {
      const context = await setup(tx);
      billId = context.bill.id;
      const failingTx = new Proxy(tx, { get: (target, key) => key === 'auditLog'
        ? { create: () => { throw auditError; } } : Reflect.get(target, key) });
      const service = new BillingService({ $transaction: (work: (transaction: Prisma.TransactionClient) => Promise<unknown>) => work(failingTx) } as never);
      await service.addExtraCharge(billId, { description: 'Food', amount: '25' }, context.actor);
    })).rejects.toBe(auditError);
    expect(billId).toBeDefined();
    expect(await prisma.billingExtraCharge.count({ where: { billingId: billId } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { entityId: billId } })).toBe(0);
  });
});
