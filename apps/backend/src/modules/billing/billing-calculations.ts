import { PaymentStatus, PaymentTransactionStatus, Prisma } from '@prisma/client';

type PaymentAmount = { amount: { toNumber(): number }; status: PaymentTransactionStatus; metadata?: unknown };
export type ExtraChargeAmount = { amount: Prisma.Decimal; description: string };

// These historical rows describe OTA fees; they are not guest extra charges.
export function isOtaMetadataCharge(description: string) {
  const normalized = description.trim().toUpperCase();
  return normalized.startsWith('OTA ') || normalized.includes('TAX WITHHOLDING');
}

export function billingTotal(amount: Prisma.Decimal, tax: Prisma.Decimal, extras: ExtraChargeAmount[]) {
  return extras.filter(charge => !isOtaMetadataCharge(charge.description))
    .reduce((total, charge) => total.add(charge.amount), amount.add(tax));
}

export function billingPaymentState(total: Prisma.Decimal, payments: PaymentAmount[], roomTotal = new Prisma.Decimal(0)) {
  const sum = (status: PaymentTransactionStatus) => payments.filter(payment => payment.status === status)
    .reduce((value, payment) => value.add(payment.amount.toNumber()), new Prisma.Decimal(0));
  const paid = sum(PaymentTransactionStatus.SUCCEEDED);
  const refunded = sum(PaymentTransactionStatus.REFUNDED);
  const netPaid = paid.sub(refunded);
  // An applied Airbnb payout settles room charges under the existing settlement rule.
  // The gross/net difference is non-cash settlement coverage, never a payment or revenue.
  // Extra services and subsequent refunds still contribute to the outstanding balance.
  const otaPaid = payments.filter(payment => payment.status === PaymentTransactionStatus.SUCCEEDED
    && isAirbnbPayout(payment.metadata))
    .reduce((value, payment) => value.add(payment.amount.toNumber()), new Prisma.Decimal(0));
  const settlementCredit = otaPaid.gt(0) ? Prisma.Decimal.max(roomTotal.sub(otaPaid), 0) : new Prisma.Decimal(0);
  const covered = netPaid.add(settlementCredit);
  const paymentStatus = refunded.gt(0) && netPaid.lte(0) ? PaymentStatus.REFUNDED
    : covered.gte(total) ? PaymentStatus.PAID
    : netPaid.gt(0) ? PaymentStatus.PARTIAL : PaymentStatus.PENDING;
  return { paymentStatus, paid, refunded, netPaid, settlementCredit, balance: Prisma.Decimal.max(total.sub(covered), 0) };
}

export function isAirbnbPayout(metadata: unknown) {
  return !!metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    && (metadata as Record<string, unknown>).source === 'airbnb_payout_email';
}

export function recalculateBilling(billing: {
  amount: Prisma.Decimal; tax: Prisma.Decimal; extraCharges: ExtraChargeAmount[]; payments: PaymentAmount[];
}) {
  const total = billingTotal(billing.amount, billing.tax, billing.extraCharges);
  return { total, ...billingPaymentState(total, billing.payments, billing.amount.add(billing.tax)) };
}

export async function lockBilling(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM billings WHERE id = ${id}::uuid FOR UPDATE`;
}

export async function lockFolioBillings(tx: Prisma.TransactionClient, groupId: string) {
  await tx.$queryRaw`SELECT b.id FROM billings b JOIN reservation_rooms r ON r.id = b.reservation_room_id
    WHERE r.reservation_group_id = ${groupId}::uuid ORDER BY b.id FOR UPDATE OF b`;
}
