import { billingPaymentState } from '../billing/billing-calculations';
import { BookingStatus, PaymentStatus, PaymentTransactionStatus, Prisma } from '@prisma/client';

export const DAY_MS = 86_400_000;
export const dateKey = (value: Date) => value.toISOString().slice(0, 10);
export const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export const daysBetween = (from: Date, to: Date) => Math.max(0, Math.round((to.getTime() - from.getTime()) / DAY_MS));
export const overlapNights = (arrival: Date, departure: Date, from: Date, end: Date) =>
  daysBetween(
    new Date(Math.max(arrival.getTime(), from.getTime())),
    new Date(Math.min(departure.getTime(), end.getTime())),
  );
export function importBlocked(raw: unknown) {
  return (
    !!raw && typeof raw === 'object' && !Array.isArray(raw) && (raw as Record<string, unknown>).importBlocked === true
  );
}

type Amount = { toNumber(): number };
export type ReportRoom = {
  id: string;
  propertyId: string;
  roomCategoryId: string;
  arrivalDate: Date;
  departureDate: Date;
  status: BookingStatus;
  guestName: string | null;
  property: { id: string; name: string; code: string; propertyType: string };
  roomCategory: { id: string; name: string; code: string };
  reservationGroup: { id: string; externalReservationId: string; status: BookingStatus; rawPayload: unknown };
  billings: Array<{
    id: string;
    amount: Amount;
    tax: Amount;
    paymentStatus: PaymentStatus;
    extraCharges: Array<{ description: string; amount: Amount }>;
    payments: Array<{ amount: Amount; status: PaymentTransactionStatus; metadata?: unknown }>;
  }>;
};
export type ReportPayment = {
  id: string;
  provider: string;
  amount: Amount;
  status: PaymentTransactionStatus;
  createdAt: Date;
  billing: {
    reservationRoom: {
      propertyId: string;
      property: { name: string };
      reservationGroup: { id: string; externalReservationId: string };
    } | null;
  };
};
export type ReportInventory = {
  propertyId: string;
  status: string;
  outOfServicePeriods: Array<{ fromDate: Date; toDate: Date }>;
};

// Match the guest-facing totals used by Finance and Billing: OTA metadata is not an extra charge.
function invoiceTotal(billing: ReportRoom['billings'][number]) {
  const extras = billing.extraCharges
    .filter((charge) => {
      const description = charge.description.trim().toUpperCase();
      return !description.startsWith('OTA ') && !description.includes('TAX WITHHOLDING');
    })
    .reduce((sum, charge) => sum + charge.amount.toNumber(), 0);
  return billing.amount.toNumber() + billing.tax.toNumber() + extras;
}

export function calculatePeriod(
  rooms: ReportRoom[],
  payments: ReportPayment[],
  inventory: ReportInventory[],
  from: Date,
  end: Date,
) {
  const scopedRooms = rooms.filter((room) => overlapNights(room.arrivalDate, room.departureDate, from, end) > 0);
  const roomsByGroup = new Map<string, ReportRoom[]>();
  for (const room of scopedRooms) {
    const lines = roomsByGroup.get(room.reservationGroup.id) ?? [];
    lines.push(room);
    roomsByGroup.set(room.reservationGroup.id, lines);
  }
  const groups = [...new Map(scopedRooms.map((room) => [room.reservationGroup.id, room.reservationGroup])).values()];
  const soldRooms = scopedRooms.filter(
    (room) =>
      room.status !== BookingStatus.CANCELLED &&
      room.reservationGroup.status !== BookingStatus.CANCELLED &&
      !importBlocked(room.reservationGroup.rawPayload),
  );
  const roomNights = soldRooms.reduce(
    (sum, room) => sum + overlapNights(room.arrivalDate, room.departureDate, from, end),
    0,
  );
  let billed = 0,
    roomRevenue = 0;
  const nightsByGroup = new Map<string, number>();
  for (const room of soldRooms) {
    const nights = overlapNights(room.arrivalDate, room.departureDate, from, end);
    nightsByGroup.set(room.reservationGroup.id, (nightsByGroup.get(room.reservationGroup.id) ?? 0) + nights);
    const portion =
      overlapNights(room.arrivalDate, room.departureDate, from, end) /
      daysBetween(room.arrivalDate, room.departureDate);
    for (const billing of room.billings) {
      billed += invoiceTotal(billing) * portion;
      roomRevenue += billing.amount.toNumber() * portion;
    }
  }
  const folios = scopedRooms
    .filter((room) => !importBlocked(room.reservationGroup.rawPayload))
    .flatMap((room) =>
      room.billings.map((billing) => {
        const paid = billing.payments
          .filter((p) => p.status === PaymentTransactionStatus.SUCCEEDED)
          .reduce((sum, p) => sum + p.amount.toNumber(), 0);
        const refunded = billing.payments
          .filter((p) => p.status === PaymentTransactionStatus.REFUNDED)
          .reduce((sum, p) => sum + p.amount.toNumber(), 0);
        return {
          billing_id: billing.id,
          group_id: room.reservationGroup.id,
          reference: room.reservationGroup.externalReservationId,
          property_id: room.propertyId,
          property_name: room.property.name,
          guest_name: room.guestName ?? 'Guest',
          from: dateKey(room.arrivalDate),
          to: dateKey(room.departureDate),
          total: money(invoiceTotal(billing)),
          paid: money(paid - refunded),
          balance:
            billingPaymentState(new Prisma.Decimal(invoiceTotal(billing)), billing.payments,
              new Prisma.Decimal(billing.amount.toNumber()).add(billing.tax.toNumber())).balance.toNumber(),
        };
      }),
    );
  const transactions = payments.filter((p) => p.createdAt >= from && p.createdAt < end);
  const collected = transactions
    .filter((p) => p.status === PaymentTransactionStatus.SUCCEEDED)
    .reduce((sum, p) => sum + p.amount.toNumber(), 0);
  const refunded = transactions
    .filter((p) => p.status === PaymentTransactionStatus.REFUNDED)
    .reduce((sum, p) => sum + p.amount.toNumber(), 0);
  let availableNights = 0;
  for (let time = from.getTime(); time < end.getTime(); time += DAY_MS) {
    availableNights += inventory.filter(
      (room) =>
        room.status !== 'MAINTENANCE' &&
        !room.outOfServicePeriods.some(
          (period) => period.fromDate.getTime() <= time && period.toDate.getTime() >= time,
        ),
    ).length;
  }
  const count = (status: BookingStatus) =>
    groups.filter((g) => g.status === status && !importBlocked(g.rawPayload)).length;
  const cancelled = count(BookingStatus.CANCELLED);
  const imported = groups.filter((g) => !importBlocked(g.rawPayload)).length;
  return {
    summary: {
      room_nights_sold: roomNights,
      available_room_nights: availableNights,
      occupancy_rate: availableNights > 0 ? money((roomNights / availableNights) * 100) : null,
      average_daily_rate: roomNights > 0 ? money(roomRevenue / roomNights) : null,
      billed_total: money(billed),
      paid_total: money(collected - refunded),
      gross_collected: money(collected),
      refunded_total: money(refunded),
      balance_due: money(folios.reduce((sum, f) => sum + f.balance, 0)),
      active_reservation_groups: count(BookingStatus.BOOKED) + count(BookingStatus.CHECKED_IN),
      cancelled_reservation_groups: cancelled,
      cancellation_rate: imported > 0 ? money((cancelled / imported) * 100) : null,
      blocked_reservation_groups: groups.filter((g) => importBlocked(g.rawPayload)).length,
      checked_in_room_lines: soldRooms.filter((r) => r.status === BookingStatus.CHECKED_IN).length,
      reservation_groups: groups.length,
    },
    reservation_posture: [
      { label: 'Booked', value: count(BookingStatus.BOOKED), color: '#6366f1', status: 'BOOKED' },
      { label: 'Checked in', value: count(BookingStatus.CHECKED_IN), color: '#10b981', status: 'CHECKED_IN' },
      { label: 'Checked out', value: count(BookingStatus.CHECKED_OUT), color: '#38bdf8', status: 'CHECKED_OUT' },
      { label: 'Cancelled', value: cancelled, color: '#94a3b8', status: 'CANCELLED' },
      {
        label: 'Blocked',
        value: groups.filter((g) => importBlocked(g.rawPayload)).length,
        color: '#f87171',
        status: 'BLOCKED',
      },
    ],
    reservations: groups.map((group) => {
      const lines = roomsByGroup.get(group.id)!;
      return {
        id: group.id,
        reference: group.externalReservationId,
        status: importBlocked(group.rawPayload) ? 'BLOCKED' : group.status,
        property_id: lines[0].propertyId,
        property_name: lines[0].property.name,
        guest_name: lines[0].guestName ?? 'Guest',
        from: dateKey(new Date(Math.min(...lines.map((r) => r.arrivalDate.getTime())))),
        to: dateKey(new Date(Math.max(...lines.map((r) => r.departureDate.getTime())))),
        room_nights: nightsByGroup.get(group.id) ?? 0,
      };
    }),
    folios,
    transactions,
  };
}
