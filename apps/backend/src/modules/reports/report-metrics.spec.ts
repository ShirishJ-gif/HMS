import { BookingStatus, PaymentStatus, PaymentTransactionStatus, Prisma } from '@prisma/client';
import { calculatePeriod, overlapNights, ReportInventory, ReportPayment, ReportRoom } from './report-metrics';
const date = (day: string) => new Date(`${day}T00:00:00Z`);
const amount = (value: number) => new Prisma.Decimal(value);
function room(overrides: Partial<ReportRoom> = {}): ReportRoom {
  return {
    id: 'room-line',
    propertyId: 'property',
    roomCategoryId: 'category',
    arrivalDate: date('2026-09-20'),
    departureDate: date('2026-09-25'),
    status: BookingStatus.BOOKED,
    guestName: 'Guest',
    property: { id: 'property', name: 'Villa', code: 'V', propertyType: 'RENTAL_VILLAS' },
    roomCategory: { id: 'category', name: 'Entire villa', code: 'VILLA' },
    reservationGroup: { id: 'group', externalReservationId: 'REF-1', status: BookingStatus.BOOKED, rawPayload: {} },
    billings: [
      {
        id: 'invoice',
        amount: amount(5000),
        tax: amount(500),
        paymentStatus: PaymentStatus.PENDING,
        extraCharges: [],
        payments: [],
      },
    ],
    ...overrides,
  };
}
const inventory: ReportInventory[] = [{ propertyId: 'property', status: 'AVAILABLE', outOfServicePeriods: [] }];
function payment(value: number, status: PaymentTransactionStatus, day: string, subject = room()): ReportPayment {
  return {
    id: `${day}-${status}`,
    amount: amount(value),
    provider: 'CASH',
    status,
    createdAt: date(day),
    billing: { reservationRoom: subject },
  };
}
const calculate = (
  rooms = [room()],
  payments: ReportPayment[] = [],
  stock = inventory,
  from = '2026-09-22',
  to = '2026-09-23',
) => calculatePeriod(rooms, payments, stock, date(from), date(to));

describe('Report metrics', () => {
  it('clips sold nights and billed revenue to the report period', () => {
    const result = calculate();
    expect(result.summary.room_nights_sold).toBe(1);
    expect(result.summary.billed_total).toBe(1100);
    expect(result.summary.average_daily_rate).toBe(1000);
    expect(result.summary.balance_due).toBe(5500);
    expect(result.folios[0].total).toBe(5500);
  });
  it('does not count checkout day as a stay night', () => {
    expect(calculate([room()], [], inventory, '2026-09-25', '2026-09-26').summary.reservation_groups).toBe(0);
    expect(overlapNights(date('2026-09-22'), date('2026-09-22'), date('2026-09-22'), date('2026-09-23'))).toBe(0);
  });
  it('excludes cancelled and blocked rooms from revenue and occupied nights', () => {
    const cancelled = room({
      status: BookingStatus.CANCELLED,
      reservationGroup: { ...room().reservationGroup, id: 'cancelled', status: BookingStatus.CANCELLED },
    });
    const blocked = room({
      reservationGroup: { ...room().reservationGroup, id: 'blocked', rawPayload: { importBlocked: true } },
    });
    const result = calculate([cancelled, blocked]);
    expect(result.summary.room_nights_sold).toBe(0);
    expect(result.summary.billed_total).toBe(0);
    expect(result.summary.cancelled_reservation_groups).toBe(1);
    expect(result.summary.blocked_reservation_groups).toBe(1);
    expect(result.folios).toHaveLength(1); // A cancellation can still have an unpaid invoice.
  });
  it('counts multi-room checked-in groups once and includes checked-out groups', () => {
    const checkedIn = room({
      status: BookingStatus.CHECKED_IN,
      reservationGroup: { ...room().reservationGroup, status: BookingStatus.CHECKED_IN },
    });
    const checkedOut = room({
      status: BookingStatus.CHECKED_OUT,
      reservationGroup: { ...room().reservationGroup, id: 'out', status: BookingStatus.CHECKED_OUT },
    });
    const result = calculate([checkedIn, { ...checkedIn, id: 'second-room' }, checkedOut]);
    expect(result.summary.reservation_groups).toBe(2);
    expect(result.reservation_posture.find((s) => s.status === 'CHECKED_IN')?.value).toBe(1);
    expect(result.reservation_posture.reduce((sum, s) => sum + s.value, 0)).toBe(2);
    expect(result.summary.room_nights_sold).toBe(3); // Villa rooms remain individual inventory units.
  });
  it('uses transaction dates for collections even when the stay is outside the period', () => {
    const otherStay = room({ arrivalDate: date('2026-10-01'), departureDate: date('2026-10-05') });
    const result = calculate(
      [],
      [
        payment(1000, 'SUCCEEDED', '2026-09-22', otherStay),
        payment(800, 'SUCCEEDED', '2026-09-21'),
        payment(600, 'SUCCEEDED', '2026-09-23'),
        payment(100, 'FAILED', '2026-09-22'),
      ],
    );
    expect(result.summary.paid_total).toBe(1000);
    expect(result.summary.room_nights_sold).toBe(0);
  });
  it('subtracts refund events on their own date and reconciles full-folio balance', () => {
    const subject = room();
    subject.billings[0].payments = [
      { amount: amount(2000), status: 'SUCCEEDED' },
      { amount: amount(400), status: 'REFUNDED' },
    ];
    const result = calculate(
      [subject],
      [payment(2000, 'SUCCEEDED', '2026-09-21'), payment(400, 'REFUNDED', '2026-09-22')],
    );
    expect(result.summary.paid_total).toBe(-400);
    expect(result.summary.refunded_total).toBe(400);
    expect(result.folios[0].paid).toBe(1600);
    expect(result.summary.balance_due).toBe(3900);
  });
  it('ignores stale PAID flags and excludes OTA metadata charges', () => {
    const subject = room();
    subject.billings[0].paymentStatus = PaymentStatus.PAID;
    subject.billings[0].extraCharges = [
      { description: 'OTA service fee', amount: amount(900) },
      { description: 'Tax withholding', amount: amount(100) },
      { description: 'Breakfast', amount: amount(500) },
    ];
    const result = calculate([subject]);
    expect(result.summary.billed_total).toBe(1200);
    expect(result.summary.balance_due).toBe(6000);
    expect(result.folios[0].total).toBe(6000);
  });
  it('removes maintenance and dated out-of-service inventory without double subtracting', () => {
    const stock: ReportInventory[] = [
      inventory[0],
      { ...inventory[0], status: 'MAINTENANCE' },
      {
        ...inventory[0],
        outOfServicePeriods: [
          { fromDate: date('2026-09-22'), toDate: date('2026-09-22') },
          { fromDate: date('2026-09-21'), toDate: date('2026-09-23') },
        ],
      },
    ];
    expect(calculate([room()], [], stock).summary.available_room_nights).toBe(1);
    expect(calculate([room()], [], stock).summary.occupancy_rate).toBe(100);
  });
  it('does not invent percentages or average rates when denominators are zero', () => {
    const result = calculate([], [], []);
    expect(result.summary.occupancy_rate).toBeNull();
    expect(result.summary.average_daily_rate).toBeNull();
    expect(result.summary.cancellation_rate).toBeNull();
    expect(result.summary.billed_total).toBe(0);
  });
});
