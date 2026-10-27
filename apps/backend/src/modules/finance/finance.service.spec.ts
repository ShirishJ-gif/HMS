import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.guard';
import { FinanceService } from './finance.service';

describe('FinanceService property scope', () => {
  const prisma = {
    billing: { findMany: jest.fn() },
    reservationGroup: { findMany: jest.fn() },
    paymentTransaction: { count: jest.fn() },
  };
  const service = new FinanceService(prisma as never);
  const owner = {
    role: 'ORG_OWNER', property_id: 'property-a', property_ids: ['property-a', 'property-b'],
  } as AuthenticatedUser;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.billing.findMany.mockResolvedValue([]);
    prisma.reservationGroup.findMany.mockResolvedValue([]);
    prisma.paymentTransaction.count.mockResolvedValue(0);
  });

  it.each([
    ['property-a', 'property-a'],
    ['property-b', 'property-b'],
    ['ALL', { in: ['property-a', 'property-b'] }],
    [undefined, { in: ['property-a', 'property-b'] }],
  ])('scopes invoices, folios, and transaction totals for %s', async (propertyId, expectedScope) => {
    await service.getOverview({ property_id: propertyId as string | undefined }, owner);
    const roomScope = expect.objectContaining({ propertyId: expectedScope });
    expect(prisma.billing.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { reservationRoom: roomScope },
    }));
    expect(prisma.reservationGroup.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ propertyId: expectedScope }),
    }));

  });

  it.each([
    owner,
    { ...owner, role: 'STAFF', property_id: 'property-a' } as AuthenticatedUser,
  ])('rejects properties outside the user scope', async (user) => {
    await expect(service.getOverview({ property_id: 'other-org-property' }, user)).rejects.toThrow(ForbiddenException);
    expect(prisma.billing.findMany).not.toHaveBeenCalled();
    expect(prisma.reservationGroup.findMany).not.toHaveBeenCalled();
    expect(prisma.paymentTransaction.count).not.toHaveBeenCalled();
  });

  it('keeps all-properties requests scoped for staff', async () => {
    await service.getOverview({ property_id: 'ALL' }, { ...owner, role: 'STAFF' });
    expect(prisma.billing.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { reservationRoom: expect.objectContaining({ propertyId: 'property-a' }) },
    }));
  });
  it.each([
    { from: '2026-10-01' }, { to: '2026-10-01' },
    { from: '2026-02-30', to: '2026-03-02' },
    { from: '2026-10-02', to: '2026-10-01' },
    { from: '2025-01-01', to: '2026-10-01' },
  ])('rejects invalid stay ranges before querying: %j', async query => {
    await expect(service.getOverview(query, owner)).rejects.toThrow(BadRequestException);
    expect(prisma.billing.findMany).not.toHaveBeenCalled();
  });
  it('uses complete folios for the same overlapping stay-date range as reports', async () => {
    await service.getOverview({ from: '2026-10-01', to: '2026-10-07' }, owner);
    const stayWhere = { rooms: { some: { arrivalDate: { lt: new Date('2026-10-08') }, departureDate: { gt: new Date('2026-10-01') } } } };
    expect(prisma.billing.findMany.mock.calls[0][0].where.reservationRoom.AND).toEqual([{ reservationGroup: stayWhere }]);
    expect(prisma.reservationGroup.findMany.mock.calls[0][0].where.AND).toEqual([stayWhere]);
  });
  it('returns no unrestricted totals for an owner with no properties', async () => {
    await service.getOverview({}, { ...owner, property_id: null, property_ids: [] });
    expect(prisma.billing.findMany.mock.calls[0][0].where.reservationRoom.propertyId).toEqual({ in: [] });
  });

});
