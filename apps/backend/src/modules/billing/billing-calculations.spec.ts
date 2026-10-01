import { PaymentTransactionStatus, Prisma } from '@prisma/client';
import { billingPaymentState, billingTotal } from './billing-calculations';

const decimal = (value: string | number) => new Prisma.Decimal(value);
const payment = (amount: number, status: PaymentTransactionStatus = 'SUCCEEDED') => ({ amount: decimal(amount), status });

describe('billing calculations', () => {
  it('includes real extra charges and tax, but excludes OTA metadata', () => {
    expect(billingTotal(decimal('30000'), decimal('0'), [
      { description: 'Food and transfers', amount: decimal('25000') },
      { description: 'OTA commission', amount: decimal('4000') },
      { description: 'Tax withholding', amount: decimal('1000') },
    ]).toFixed(2)).toBe('55000.00');
    expect(billingTotal(decimal('0.10'), decimal('0.20'), []).toFixed(2)).toBe('0.30');
  });

  it.each([
    ['unpaid', [], 'PENDING', '10200'],
    ['partly paid', [payment(5200)], 'PARTIAL', '5000'],
    ['paid', [payment(10200)], 'PAID', '0'],
    ['failed collection', [payment(10200, 'FAILED')], 'PENDING', '10200'],
    ['partial refund', [payment(10200), payment(5000, 'REFUNDED')], 'PARTIAL', '5000'],
    ['full refund', [payment(10200), payment(10200, 'REFUNDED')], 'REFUNDED', '10200'],
    ['refunded and recollected', [payment(10200), payment(5000, 'REFUNDED'), payment(5000)], 'PAID', '0'],
    ['overpaid after charge removal', [payment(12000)], 'PAID', '0'],
  ])('%s', (_label, payments, expectedStatus, expectedBalance) => {
    const state = billingPaymentState(decimal(10200), payments);
    expect(state.paymentStatus).toBe(expectedStatus);
    expect(state.balance.toString()).toBe(expectedBalance);
  });

  it('settles Airbnb room charges without reporting settlement credit as cash, leaving extras payable', () => {
    const payout = { ...payment(800), metadata: { source: 'airbnb_payout_email' } };
    const room = billingPaymentState(decimal(1000), [payout], decimal(1000));
    expect(room.paymentStatus).toBe('PAID');
    expect(room.paid.toNumber()).toBe(800);
    expect(room.settlementCredit.toNumber()).toBe(200);
    const extras = billingPaymentState(decimal(1250), [payout], decimal(1000));
    expect(extras.paymentStatus).toBe('PARTIAL');
    expect(extras.balance.toNumber()).toBe(250);
    const paid = billingPaymentState(decimal(1250), [payout, payment(250)], decimal(1000));
    expect(paid.paymentStatus).toBe('PAID');
    const refund = billingPaymentState(decimal(1250), [payout, payment(250), payment(100, 'REFUNDED')], decimal(1000));
    expect(refund.balance.toNumber()).toBe(100);
    expect(refund.paymentStatus).toBe('PARTIAL');
    expect(billingPaymentState(decimal(1000), [payment(800)], decimal(1000)).balance.toNumber()).toBe(200);
  });
});
