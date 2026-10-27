import { ForbiddenException } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.guard';
import { OperationsBoardService } from './operations-board.service';

describe('OperationsBoardService property scope', () => {
  const prisma = {
    property: { findMany: jest.fn() },
    reservationGroup: { findMany: jest.fn() },
    room: { findMany: jest.fn() },
    housekeepingTask: { findMany: jest.fn() },
  };
  const dashboard = { getSummary: jest.fn() };
  const service = new OperationsBoardService(prisma as never, dashboard as never);
  const owner = {
    role: 'ORG_OWNER', property_id: 'property-a', property_ids: ['property-a', 'property-b'],
  } as AuthenticatedUser;

  beforeEach(() => {
    jest.clearAllMocks();
    for (const model of Object.values(prisma)) model.findMany.mockResolvedValue([]);
    dashboard.getSummary.mockResolvedValue({ total_rooms: 4, occupied_rooms: 2, pending_balance_total: 1500 });
  });

  it.each(['property-a', 'property-b', 'ALL'])('uses the same property for board rows and summary totals (%s)', async (propertyId) => {
    const result = await service.getBoard({ property_id: propertyId, date: '2026-10-05' }, owner);
    const expectedScope = propertyId === 'ALL' ? { in: owner.property_ids } : propertyId;
    for (const model of [prisma.reservationGroup, prisma.room, prisma.housekeepingTask]) {
      expect(model.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ propertyId: expectedScope }),
      }));
    }
    expect(dashboard.getSummary).toHaveBeenCalledWith(
      new Date('2026-10-05T00:00:00Z'), owner, propertyId === 'ALL' ? undefined : propertyId, '2026-10-05',
    );
    expect(result.dashboard).toEqual({ total_rooms: 4, occupied_rooms: 2, pending_balance_total: 1500 });
  });

  it('rejects a property outside the organization before loading either rows or totals', async () => {
    await expect(service.getBoard({ property_id: 'outside', date: '2026-10-05' }, owner)).rejects.toThrow(ForbiddenException);
    expect(dashboard.getSummary).not.toHaveBeenCalled();
    for (const model of Object.values(prisma)) expect(model.findMany).not.toHaveBeenCalled();
  });

  it('keeps all-properties requests scoped for staff', async () => {
    const staff = { ...owner, role: 'STAFF' } as AuthenticatedUser;
    await service.getBoard({ property_id: 'ALL', date: '2026-10-05' }, staff);
    expect(prisma.room.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ propertyId: 'property-a' }),
    }));
    expect(dashboard.getSummary).toHaveBeenCalledWith(expect.any(Date), staff, undefined, '2026-10-05');
  });
});
