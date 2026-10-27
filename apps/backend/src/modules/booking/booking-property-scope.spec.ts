import { ForbiddenException } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.guard';
import { BookingService } from './booking.service';

describe('Reservation feed property scope', () => {
  const originalProviderFailures = process.env.SHOW_PROVIDER_ONLY_RESERVATION_FAILURES;
  const prisma = {
    $transaction: jest.fn(),
    reservationGroup: { findMany: jest.fn(), count: jest.fn() },
    channelSyncLog: { findMany: jest.fn() },
  };
  const service = new BookingService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never);
  const owner = { role: 'ORG_OWNER', property_id: 'property-a', property_ids: ['property-a', 'property-b'] } as AuthenticatedUser;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SHOW_PROVIDER_ONLY_RESERVATION_FAILURES = 'true';
    prisma.$transaction.mockImplementation(queries => Promise.all(queries));
    prisma.reservationGroup.findMany.mockResolvedValue([]);
    prisma.reservationGroup.count.mockResolvedValue(0);
    prisma.channelSyncLog.findMany.mockResolvedValue([]);
  });
  afterEach(() => {
    if (originalProviderFailures === undefined) delete process.env.SHOW_PROVIDER_ONLY_RESERVATION_FAILURES;
    else process.env.SHOW_PROVIDER_ONLY_RESERVATION_FAILURES = originalProviderFailures;
  });

  it.each(['property-a', 'property-b', undefined])('scopes imported reservations, totals, and provider failures to %s', async propertyId => {
    await service.findReservationFeed({ page: 1, limit: 10, property_id: propertyId }, owner);
    const scope = propertyId ?? { in: owner.property_ids };
    for (const query of [prisma.reservationGroup.findMany, prisma.reservationGroup.count]) {
      expect(query).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ propertyId: scope }) }));
    }
    expect(prisma.channelSyncLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ channelConnection: expect.objectContaining({ propertyId: scope }) }),
    }));
  });

  it.each([owner, { ...owner, role: 'STAFF' } as AuthenticatedUser])('rejects an inaccessible property before loading the feed', async user => {
    await expect(service.findReservationFeed({ page: 1, limit: 10, property_id: 'outside' }, user)).rejects.toThrow(ForbiddenException);
    expect(prisma.reservationGroup.findMany).not.toHaveBeenCalled();
    expect(prisma.channelSyncLog.findMany).not.toHaveBeenCalled();
  });
});
