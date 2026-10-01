import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.guard';

describe('ReportsService', () => {
  const prisma = {
    expense: { groupBy: jest.fn() },
    property: { findMany: jest.fn() },
    reservationRoom: { findMany: jest.fn() },
    paymentTransaction: { findMany: jest.fn() },
    room: { findMany: jest.fn() },
    channelConnection: { findMany: jest.fn() },
  };
  const service = new ReportsService(prisma as unknown as PrismaService);
  const user = { role: 'ADMIN', property_id: 'property-a' } as AuthenticatedUser;
  beforeEach(() => {
    jest.clearAllMocks();
    for (const model of Object.values(prisma)) {
      if ('findMany' in model) model.findMany.mockResolvedValue([]);
    }
    prisma.expense.groupBy.mockResolvedValue([]);
  });
  it('scopes every report query to the authenticated property', async () => {
    await service.getAnalytics({ from: '2026-09-22', to: '2026-09-22' }, user);
    expect(prisma.property.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'property-a' } }));
    for (const model of [prisma.reservationRoom, prisma.room, prisma.channelConnection])
      expect(model.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ propertyId: 'property-a' }) }),
      );
    expect(prisma.expense.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          propertyId: 'property-a',
          status: { not: 'VOID' },
          expenseDate: { gte: new Date('2026-09-22'), lt: new Date('2026-09-23') },
        }),
      }),
    );
    expect(prisma.paymentTransaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          billing: { reservationRoom: expect.objectContaining({ propertyId: 'property-a' }) },
        }),
      }),
    );
  });
  it('rejects properties outside the user scope before reading any data', async () => {
    await expect(
      service.getAnalytics({ property_id: 'property-b', from: '2026-09-22', to: '2026-09-22' }, user),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.property.findMany).not.toHaveBeenCalled();
  });
  it('returns an empty report for a new organisation owner with an assigned property', async () => {
    const owner = {
      role: 'ORG_OWNER',
      organization_id: 'org-a',
      property_id: 'property-a',
      property_ids: ['property-a'],
    } as AuthenticatedUser;
    prisma.property.findMany.mockResolvedValue([
      { id: 'property-a', name: 'New property', code: 'NEW', propertyType: 'HOTEL' },
    ]);
    const report = await service.getAnalytics(
      { property_id: 'property-a', from: '2026-09-01', to: '2026-09-24' },
      owner,
    );
    expect(report.summary).toMatchObject({ reservation_groups: 0, billed_total: 0, paid_total: 0, balance_due: 0 });
    expect(report.properties).toHaveLength(1);
    expect(report.property_performance).toEqual([expect.objectContaining({ id: 'property-a', groups: 0, billed: 0 })]);
    expect(report.reservations).toEqual([]);
    expect(report.expenses_by_category).toEqual([]);
    expect(report.trend.length).toBeGreaterThan(0);
  });
  it.each([['property-a', 'property-b'], []])(
    'limits all owner report sources to organisation properties %j',
    async (...propertyIds: string[]) => {
      const owner = {
        role: 'ORG_OWNER',
        organization_id: 'org-a',
        property_id: null,
        property_ids: propertyIds,
      } as AuthenticatedUser;
      const report = await service.getAnalytics({ property_id: 'ALL', from: '2026-09-01', to: '2026-09-24' }, owner);
      const scope = { in: propertyIds };
      expect(prisma.property.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: scope } }));
      for (const model of [prisma.reservationRoom, prisma.room, prisma.channelConnection]) {
        expect(model.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: expect.objectContaining({ propertyId: scope }) }),
        );
      }
      expect(prisma.expense.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ propertyId: scope }) }),
      );
      expect(prisma.paymentTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            billing: { reservationRoom: expect.objectContaining({ propertyId: scope }) },
          }),
        }),
      );
      expect(report.summary.reservation_groups).toBe(0);
      expect(report.properties).toEqual([]);
    },
  );
  it('still rejects another organisation property for an organisation owner', async () => {
    const owner = {
      role: 'ORG_OWNER',
      organization_id: 'org-a',
      property_id: 'property-a',
      property_ids: ['property-a'],
    } as AuthenticatedUser;
    await expect(
      service.getAnalytics({ property_id: 'other-org-property', from: '2026-09-01', to: '2026-09-24' }, owner),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.property.findMany).not.toHaveBeenCalled();
  });
  it.each([
    ['2026-02-30', '2026-03-01'],
    ['2026-09-23', '2026-09-22'],
    ['2025-01-01', '2026-09-22'],
  ])('rejects invalid or oversized dates %s to %s', async (from, to) => {
    await expect(service.getAnalytics({ from, to }, user)).rejects.toBeInstanceOf(BadRequestException);
  });
  it('compares equal inclusive periods across a month boundary and returns zero chart values', async () => {
    const report = await service.getAnalytics({ from: '2026-09-01', to: '2026-09-07' }, user);
    expect(report.comparison.from).toBe('2026-08-25');
    expect(report.comparison.to).toBe('2026-08-31');
    expect(report.trend).toHaveLength(7);
    expect(report.trend.every((point) => point.billed === 0 && point.collected === 0)).toBe(true);
  });
  it('never infers channel health from an external hotel ID', async () => {
    prisma.channelConnection.findMany.mockResolvedValue([
      {
        id: 'channel',
        name: 'Booking.com',
        provider: 'ZODOMUS',
        externalHotelId: '100',
        status: 'ACTIVE',
        credentials: {},
        property: { name: 'Hotel' },
        syncLogs: [],
      },
    ]);
    const report = await service.getAnalytics({ from: '2026-09-22', to: '2026-09-22' }, user);
    expect(report.channel_readiness[0].ready).toBe(false);
    expect(report.channel_readiness[0].rooms_activated).toBe(false);
  });
  it('aligns comparison buckets by day, including the shorter final bucket', async () => {
    const report = await service.getAnalytics({ from: '2026-08-01', to: '2026-08-31' }, user);
    expect(report.trend[0]).toEqual(
      expect.objectContaining({
        from: '2026-08-01',
        to: '2026-08-03',
        previous_from: '2026-07-01',
        previous_to: '2026-07-03',
      }),
    );
    expect(report.trend.at(-1)).toEqual(
      expect.objectContaining({
        from: '2026-08-31',
        to: '2026-08-31',
        previous_from: '2026-07-31',
        previous_to: '2026-07-31',
      }),
    );
    expect(report.trend.reduce((sum, point) => sum + point.previous_billed, 0)).toBe(
      report.comparison.summary.billed_total,
    );
  });
  it('keeps expense categories and currencies separate and reports unknown payment entries', async () => {
    prisma.expense.groupBy.mockResolvedValue([
      {
        category: 'UTILITIES',
        currency: 'INR',
        _sum: { amount: 1200, amountPaid: 200 },
        _count: { _all: 3, amountPaid: 2 },
      },
      {
        category: 'UTILITIES',
        currency: 'USD',
        _sum: { amount: 50, amountPaid: 50 },
        _count: { _all: 1, amountPaid: 1 },
      },
    ]);
    const report = await service.getAnalytics({ from: '2026-09-01', to: '2026-09-07' }, user);
    expect(report.expenses_by_category).toEqual([
      { category: 'UTILITIES', currency: 'INR', amount: 1200, recorded_paid: 200, count: 3, unknown_payment_count: 1 },
      { category: 'UTILITIES', currency: 'USD', amount: 50, recorded_paid: 50, count: 1, unknown_payment_count: 0 },
    ]);
  });
});
