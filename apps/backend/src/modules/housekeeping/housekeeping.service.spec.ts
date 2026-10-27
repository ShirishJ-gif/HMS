import { ForbiddenException } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.guard';
import { HousekeepingController } from './housekeeping.controller';
import { HousekeepingService } from './housekeeping.service';

describe('Housekeeping board property scope', () => {
  const prisma = {
    $transaction: jest.fn(),
    housekeepingTask: { findMany: jest.fn() },
    room: { findMany: jest.fn() },
    roomCategory: { findMany: jest.fn() },
    property: { findMany: jest.fn() },
  };
  const service = new HousekeepingService(prisma as never);
  const controller = new HousekeepingController(service);
  const owner = { role: 'ORG_OWNER', property_id: 'property-a', property_ids: ['property-a', 'property-b'] } as AuthenticatedUser;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(queries => Promise.all(queries));
    for (const model of [prisma.housekeepingTask, prisma.room, prisma.roomCategory, prisma.property]) model.findMany.mockResolvedValue([]);
  });

  it.each(['property-a', 'property-b', undefined])('filters tasks, rooms, and categories by the selected property %s', async propertyId => {
    await controller.getBoard(owner, propertyId);
    const scope = propertyId ?? { in: owner.property_ids };
    for (const model of [prisma.housekeepingTask, prisma.room, prisma.roomCategory]) {
      expect(model.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { propertyId: scope } }));
    }
    expect(prisma.property.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: scope } }));
  });

  it('rejects a property outside the organization', async () => {
    await expect(controller.getBoard(owner, 'outside')).rejects.toThrow(ForbiddenException);
    expect(prisma.housekeepingTask.findMany).not.toHaveBeenCalled();
    expect(prisma.room.findMany).not.toHaveBeenCalled();
  });
});
