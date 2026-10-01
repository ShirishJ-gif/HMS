import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DashboardService } from './dashboard.service';
import { AuthenticatedUser } from '../auth/auth.guard';
import { validate } from 'class-validator';
import { DashboardQueryDto } from './dto/dashboard-query.dto';
import { DashboardController } from './dashboard.controller';

const amount = (value: number) => new Prisma.Decimal(value);
const day = (value: string) => new Date(`${value}T00:00:00Z`);
const now = new Date('2026-09-23T08:00:00Z');
const property = { id: 'property-a', name: 'Hotel', propertyType: 'HOTEL' };
function payment(value: number, status = 'SUCCEEDED', createdAt = '2026-09-23T06:00:00Z', source = 'DIRECT') {
  return {
    amount: amount(value),
    status,
    createdAt: new Date(createdAt),
    billing: { reservationRoom: { reservationGroup: { source, rawPayload: {}, channelConnection: null } } },
  };
}
function stay(id: string, status = 'BOOKED', arrival = '2026-09-23', departure = '2026-09-25', groupId = id) {
  return {
    id,
    status,
    roomId: null,
    arrivalDate: day(arrival),
    departureDate: day(departure),
    guestName: 'Guest',
    property,
    room: null,
    roomCategory: { name: 'Deluxe' },
    reservationGroup: {
      id: groupId,
      externalReservationId: groupId,
      status: status === 'CHECKED_OUT' ? 'CHECKED_OUT' : 'BOOKED',
      rawPayload: {},
      primaryGuest: { name: 'Guest' },
    },
  };
}
function invoice(paid = 0, refund = 0) {
  return {
    amount: amount(1000),
    tax: amount(100),
    extraCharges: [
      { description: 'Breakfast', amount: amount(100) },
      { description: 'OTA commission', amount: amount(500) },
    ],
    payments: [
      { amount: amount(paid), status: 'SUCCEEDED' },
      { amount: amount(refund), status: 'REFUNDED' },
    ],
    reservationRoom: { reservationGroup: { rawPayload: {} } },
  };
}

describe('DashboardService', () => {
  const prisma = {
    property: { findMany: jest.fn() },
    room: { findMany: jest.fn() },
    reservationGroup: { findMany: jest.fn() },
    reservationRoom: { findMany: jest.fn() },
    paymentTransaction: { findMany: jest.fn() },
    billing: { findMany: jest.fn() },
    housekeepingTask: { findMany: jest.fn() },
  };
  const service = new DashboardService(prisma as never);
  beforeEach(() => {
    jest.clearAllMocks();
    for (const model of Object.values(prisma)) model.findMany.mockResolvedValue([]);
    prisma.property.findMany.mockResolvedValue([property]);
  });
  it('returns honest zero states when no inventory, payments, or stays exist', async () => {
    const result = await service.getSummary(now);
    expect(result).toMatchObject({
      date: '2026-09-23',
      total_rooms: 0,
      available_rooms: 0,
      occupancy_rate: 0,
      revenue_today: 0,
      pending_balance_total: 0,
      arrivals: [],
      departures: [],
      upcoming_arrivals: [],
      revenue_by_ota: [],
    });
    expect(result.collections_trend).toHaveLength(7);
    expect(result.collections_trend.every((point) => point.amount === 0)).toBe(true);
  });
  it('counts actual collections, including partial payments, and subtracts refunds on their own date', async () => {
    prisma.paymentTransaction.findMany.mockResolvedValue([
      payment(800),
      payment(200, 'REFUNDED'),
      payment(500, 'SUCCEEDED', '2026-09-22T06:00:00Z'),
    ]);
    const result = await service.getSummary(now);
    expect(result.revenue_today).toBe(600);
    expect(result.collected_today).toBe(800);
    expect(result.refunded_today).toBe(200);
    expect(result.revenue_yesterday).toBe(500);
    expect(result.revenue_month_to_date).toBe(1100);
    expect(result.collections_trend.reduce((sum, point) => sum + point.amount, 0)).toBe(1100);
    expect(result.revenue_by_ota).toEqual([{ label: 'Direct', collected: 1300, refunded: 200, amount: 1100 }]);
  });
  it('uses the IST date boundary for today, yesterday, and the chart', async () => {
    prisma.paymentTransaction.findMany.mockResolvedValue([
      payment(200, 'SUCCEEDED', '2026-09-22T18:29:59Z'),
      payment(900, 'SUCCEEDED', '2026-09-22T18:30:00Z'),
    ]);
    const result = await service.getSummary(now);
    expect(result.revenue_today).toBe(900);
    expect(result.revenue_yesterday).toBe(200);
    expect(result.collections_trend.at(-1)).toEqual({ date: '2026-09-23', amount: 900 });
  });
  it('keeps the seven-day trend at a month boundary but limits source totals to this month', async () => {
    prisma.paymentTransaction.findMany.mockResolvedValue([
      payment(300, 'SUCCEEDED', '2026-08-31T10:00:00Z'),
      payment(700, 'SUCCEEDED', '2026-09-01T07:00:00Z'),
    ]);
    const result = await service.getSummary(new Date('2026-09-01T08:00:00Z'));
    expect(result.revenue_month_to_date).toBe(700);
    expect(result.revenue_by_ota[0].amount).toBe(700);
    expect(result.collections_trend.reduce((sum, point) => sum + point.amount, 0)).toBe(1000);
  });
  it('subtracts prior payments from outstanding invoices and excludes OTA metadata', async () => {
    prisma.billing.findMany.mockResolvedValue([invoice(500, 100), invoice(1200), invoice(1500)]);
    const result = await service.getSummary(now);
    expect(result.pending_balance_total).toBe(800);
    expect(result.unpaid_invoice_count).toBe(1);
    expect(prisma.billing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ paymentStatus: { not: 'PAID' } }) }),
    );
  });
  it('separates occupied, unoccupied, and maintenance rooms without double counting', async () => {
    prisma.room.findMany.mockResolvedValue([
      { id: 'occupied', status: 'OCCUPIED', outOfServicePeriods: [{ id: 'period' }] },
      { id: 'available', status: 'AVAILABLE', outOfServicePeriods: [] },
      { id: 'maintenance', status: 'MAINTENANCE', outOfServicePeriods: [{ id: 'period' }] },
      { id: 'dated-block', status: 'AVAILABLE', outOfServicePeriods: [{ id: 'period' }] },
    ]);
    const result = await service.getSummary(now);
    expect(result).toMatchObject({
      total_rooms: 4,
      occupied_rooms: 1,
      available_rooms: 1,
      out_of_service_rooms: 2,
      occupancy_rate: 25,
    });
  });
  it('groups multi-room arrivals and separates remaining check-ins from completed ones', async () => {
    prisma.reservationRoom.findMany.mockResolvedValue([
      stay('one', 'BOOKED', '2026-09-23', '2026-09-25', 'group'),
      stay('two', 'CHECKED_IN', '2026-09-23', '2026-09-25', 'group'),
      stay('upcoming', 'BOOKED', '2026-09-24', '2026-09-27'),
      stay('leaving', 'CHECKED_IN', '2026-09-20', '2026-09-23'),
      stay('left', 'CHECKED_OUT', '2026-09-20', '2026-09-23'),
    ]);
    const result = await service.getSummary(now);
    expect(result).toMatchObject({
      reservation_room_arrivals_today: 2,
      pending_arrivals_today: 1,
      unassigned_arrivals_today: 1,
      reservation_room_departures_today: 2,
      pending_departures_today: 1,
    });
    expect(result.arrivals).toHaveLength(1);
    expect(result.arrivals[0]).toMatchObject({ id: 'group', room_count: 2, pending_rooms: 1 });
    expect(result.upcoming_arrivals[0].id).toBe('upcoming');
  });
  it('excludes cancelled groups and blocked imports from the schedule', async () => {
    const cancelled = stay('cancelled');
    cancelled.reservationGroup.status = 'CANCELLED';
    const importBlocked = {
      ...stay('blocked'),
      reservationGroup: { ...stay('blocked').reservationGroup, rawPayload: { importBlocked: true } },
    };
    prisma.reservationRoom.findMany.mockResolvedValue([cancelled, importBlocked]);
    expect((await service.getSummary(now)).arrivals).toEqual([]);
  });
  it('counts overdue housekeeping by due date and requests only open tasks', async () => {
    prisma.housekeepingTask.findMany.mockResolvedValue([
      { status: 'DIRTY', dueDate: day('2026-09-22') },
      { status: 'CLEANING', dueDate: day('2026-09-23') },
      { status: 'OUT_OF_SERVICE', dueDate: null },
    ]);
    const result = await service.getSummary(now);
    expect(result.open_housekeeping_tasks).toBe(3);
    expect(result.overdue_housekeeping_tasks).toBe(1);
    expect(prisma.housekeepingTask.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ completedAt: null }) }),
    );
  });
  it('applies the selected authorized property to every data source', async () => {
    const user = { role: 'ORG_OWNER', property_ids: ['property-a', 'property-b'] } as AuthenticatedUser;
    const result = await service.getSummary(now, user, 'property-a');
    expect(result.property_id).toBe('property-a');
    expect(prisma.property.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'property-a' } }));
    for (const model of [prisma.room, prisma.reservationGroup, prisma.reservationRoom, prisma.housekeepingTask])
      expect(model.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ propertyId: 'property-a' }) }),
      );
    expect(prisma.paymentTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          billing: { reservationRoom: expect.objectContaining({ propertyId: 'property-a' }) },
        }),
      }),
    );
  });
  it('rejects a selected property outside the user scope before querying', async () => {
    await expect(
      service.getSummary(now, { role: 'ADMIN', property_id: 'property-a' } as AuthenticatedUser, 'property-b'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.property.findMany).not.toHaveBeenCalled();
  });

  it('uses a selected day for collections and completed arrivals while keeping live room status and update time', async () => {
    prisma.reservationRoom.findMany.mockResolvedValue([stay('finished', 'CHECKED_OUT', '2026-07-03', '2026-07-04')]);
    prisma.paymentTransaction.findMany.mockResolvedValue([
      payment(100, 'SUCCEEDED', '2026-07-02T18:29:59Z'),
      payment(700, 'SUCCEEDED', '2026-07-02T18:30:00Z'),
      payment(200, 'REFUNDED', '2026-07-03T18:29:59Z'),
      payment(999, 'SUCCEEDED', '2026-07-03T18:30:00Z'),
    ]);
    const result = await service.getSummary(now, undefined, undefined, '2026-07-03');
    expect(result).toMatchObject({
      date: '2026-07-03',
      generated_at: now.toISOString(),
      revenue_today: 500,
      revenue_yesterday: 100,
      revenue_month_to_date: 600,
      reservation_room_arrivals_today: 1,
      pending_arrivals_today: 0,
    });
    expect(result.arrivals[0]).toMatchObject({ id: 'finished', pending_rooms: 0 });
    expect(result.collections_trend.at(-1)).toEqual({ date: '2026-07-03', amount: 500 });
    expect(prisma.paymentTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: { gte: new Date('2026-06-26T18:30:00Z'), lt: new Date('2026-07-03T18:30:00Z') },
        }),
      }),
    );
    expect(prisma.room.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          outOfServicePeriods: {
            where: { fromDate: { lte: day('2026-09-23') }, toDate: { gte: day('2026-09-23') } },
            select: { id: true },
          },
        }),
      }),
    );
  });

  it('includes departures for future bookings that have not checked in yet', async () => {
    prisma.reservationRoom.findMany.mockResolvedValue([stay('future', 'BOOKED', '2026-10-03', '2026-10-05')]);
    const result = await service.getSummary(now, undefined, undefined, '2026-10-05');
    expect(result).toMatchObject({ reservation_room_departures_today: 1, pending_departures_today: 1 });
    expect(result.departures[0]).toMatchObject({ id: 'future', pending_rooms: 1 });
  });
});

describe('Dashboard calendar query', () => {
  it('accepts real calendar dates and rejects timestamps and impossible dates', async () => {
    for (const date of ['2026-07-03', '2028-02-29', undefined]) {
      expect(await validate(Object.assign(new DashboardQueryDto(), { date }))).toHaveLength(0);
    }
    for (const date of ['2026-02-30', '2026-02-29', '2026-07-03T00:00:00Z', 'not-a-date']) {
      expect((await validate(Object.assign(new DashboardQueryDto(), { date }))).length).toBeGreaterThan(0);
    }
  });

  it('passes the selected calendar date and property through the endpoint', () => {
    const getSummary = jest.fn();
    const controller = new DashboardController({ getSummary } as unknown as DashboardService);
    const user = { role: 'SUPER_ADMIN' } as AuthenticatedUser;
    controller.getSummary(user, { date: '2026-07-03', property_id: 'property-a' });
    expect(getSummary).toHaveBeenCalledWith(expect.any(Date), user, 'property-a', '2026-07-03');
  });
});
