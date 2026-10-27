import { ForbiddenException } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.guard';
import { InventoryService } from '../inventory/inventory.service';
import { AvailabilityService } from './availability.service';

describe('Availability property scope', () => {
  const prisma = {
    property: { findUnique: jest.fn() },
    roomCategory: { findMany: jest.fn() },
    inventoryCalendar: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const inventory = { rebuildCalendarRange: jest.fn() };
  const availability = new AvailabilityService(prisma as never, inventory as never, {} as never);
  const calendar = new InventoryService(prisma as never, {} as never, {} as never, {} as never);
  const rebuildCalendar = jest.spyOn(calendar, 'rebuildCalendarRange');
  const owner = {
    role: 'ORG_OWNER', property_id: 'property-a', property_ids: ['property-a', 'property-b'],
  } as AuthenticatedUser;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.property.findUnique.mockImplementation(({ where }) => Promise.resolve({ id: where.id, name: where.id, propertyType: 'HOTEL' }));
    prisma.roomCategory.findMany.mockResolvedValue([]);
    prisma.inventoryCalendar.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation((queries) => Promise.all(queries));
    inventory.rebuildCalendarRange.mockResolvedValue([]);
    rebuildCalendar.mockResolvedValue([]);
  });

  it.each(['property-a', 'property-b'])('loads availability and the inventory calendar only for %s', async (propertyId) => {
    const query = { property_id: propertyId, from: '2026-10-05', to: '2026-10-10' };
    expect((await availability.getAvailability(query, owner)).property_id).toBe(propertyId);
    expect((await calendar.getInventoryCalendar(query, owner)).property_id).toBe(propertyId);
    for (const rebuild of [inventory.rebuildCalendarRange, rebuildCalendar]) {
      expect(rebuild).toHaveBeenCalledWith(expect.objectContaining({ propertyId }));
    }
    for (const call of prisma.roomCategory.findMany.mock.calls) {
      expect(call[0].where.propertyId).toBe(propertyId);
    }
    expect(prisma.inventoryCalendar.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ propertyId }),
    }));
  });

  it('rejects another organization property before querying or rebuilding inventory', async () => {
    const query = { property_id: 'outside', from: '2026-10-05', to: '2026-10-10' };
    await expect(availability.getAvailability(query, owner)).rejects.toThrow(ForbiddenException);
    await expect(calendar.getInventoryCalendar(query, owner)).rejects.toThrow(ForbiddenException);
    expect(prisma.property.findUnique).not.toHaveBeenCalled();
    expect(inventory.rebuildCalendarRange).not.toHaveBeenCalled();
    expect(rebuildCalendar).not.toHaveBeenCalled();
  });
});
