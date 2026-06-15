import { ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, RoomStatus } from '@prisma/client';
import { RoomService } from './room.service';

describe('RoomService', () => {
  const prisma = {
    $transaction: jest.fn(),
    room: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    reservationRoom: {
      count: jest.fn(),
    },
    roomOutOfServicePeriod: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
  };
  const auditLogService = {
    record: jest.fn(),
  };
  const backgroundJobService = {
    queueInventorySyncsForProperty: jest.fn(),
  };
  const inventoryService = {
    acquireInventoryAllocationLock: jest.fn(),
  };

  const property = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Harbour Residency',
    code: 'HARBOUR-MUM',
  };

  const roomCategory = {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Deluxe',
    code: 'DELUXE',
  };

  let service: RoomService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((input) =>
      typeof input === 'function' ? input(prisma) : Promise.all(input),
    );
    prisma.reservationRoom.count.mockResolvedValue(0);
    service = new RoomService(
      prisma as never,
      auditLogService as never,
      backgroundJobService as never,
      inventoryService as never,
    );
  });

  it('creates a property-scoped physical room', async () => {
    const room = roomRecord();

    prisma.room.create.mockResolvedValue(room);

    await expect(
      service.create({
        property_id: property.id,
        room_category_id: roomCategory.id,
        room_number: '101',
      }),
    ).resolves.toEqual({
      id: room.id,
      property_id: property.id,
      room_category_id: roomCategory.id,
      room_number: '101',
      room_category: roomCategory,
      property,
      status: RoomStatus.AVAILABLE,
      created_at: room.createdAt,
      updated_at: room.updatedAt,
    });

    expect(prisma.room.create).toHaveBeenCalledWith({
      data: {
        propertyId: property.id,
        roomCategoryId: roomCategory.id,
        roomNumber: '101',
        status: undefined,
      },
      include: {
        property: true,
        roomCategory: true,
      },
    });
    expect(backgroundJobService.queueInventorySyncsForProperty).toHaveBeenCalledWith(property.id, {
      trigger: 'room_created',
    });
  });

  it('lists rooms ordered by room number', async () => {
    prisma.room.findMany.mockResolvedValue([]);
    prisma.room.count.mockResolvedValue(0);

    await expect(service.findAll({ page: 1, limit: 25 })).resolves.toEqual({
      data: [],
      meta: {
        page: 1,
        limit: 25,
        total: 0,
        total_pages: 1,
      },
    });

    expect(prisma.room.findMany).toHaveBeenCalledWith({
      where: {},
      include: {
        property: true,
        roomCategory: true,
      },
      orderBy: {
        roomNumber: 'asc',
      },
      skip: 0,
      take: 25,
    });
  });

  it('maps duplicate room numbers to conflict errors', async () => {
    prisma.room.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '5.22.0',
      }),
    );

    await expect(
      service.create({
        property_id: property.id,
        room_category_id: roomCategory.id,
        room_number: '101',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('maps missing room updates to not found errors', async () => {
    prisma.room.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: '5.22.0',
      }),
    );

    await expect(
      service.update('7f43ac6b-743c-4e21-b3a3-931025058655', {
        status: RoomStatus.MAINTENANCE,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('queues inventory syncs when room inventory state changes', async () => {
    prisma.room.findUnique.mockResolvedValue(roomRecord());
    prisma.room.update.mockResolvedValue({
      ...roomRecord(),
      status: RoomStatus.MAINTENANCE,
    });

    await service.update(roomRecord().id, { status: RoomStatus.MAINTENANCE });

    expect(inventoryService.acquireInventoryAllocationLock).toHaveBeenCalledWith(
      prisma,
      property.id,
      roomCategory.id,
    );
    expect(backgroundJobService.queueInventorySyncsForProperty).toHaveBeenCalledWith(property.id, {
      trigger: 'room_updated',
    });
  });

  it('prevents marking an occupied room as available while a guest is checked in', async () => {
    prisma.room.findUnique.mockResolvedValue({
      ...roomRecord(),
      status: RoomStatus.OCCUPIED,
    });
    prisma.reservationRoom.count.mockResolvedValue(1);

    await expect(service.update(roomRecord().id, { status: RoomStatus.AVAILABLE })).rejects.toThrow(
      'Check out the guest from the Operations Board first.',
    );

    expect(prisma.room.update).not.toHaveBeenCalled();
    expect(backgroundJobService.queueInventorySyncsForProperty).not.toHaveBeenCalled();
  });

  it('prevents deleting rooms with dependent reservation stays', async () => {
    prisma.room.findUnique.mockResolvedValue(roomRecord());
    prisma.reservationRoom.count.mockResolvedValue(1);

    await expect(service.remove('7f43ac6b-743c-4e21-b3a3-931025058655')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(inventoryService.acquireInventoryAllocationLock).toHaveBeenCalledWith(
      prisma,
      property.id,
      roomCategory.id,
    );
    expect(prisma.room.delete).not.toHaveBeenCalled();
  });

  it('maps room deletion foreign key failures to conflict errors', async () => {
    prisma.room.findUnique.mockResolvedValue(roomRecord());
    prisma.room.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', {
        code: 'P2003',
        clientVersion: '5.22.0',
      }),
    );

    await expect(service.remove('7f43ac6b-743c-4e21-b3a3-931025058655')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('creates dated out-of-service periods and queues inventory syncs', async () => {
    prisma.room.findUnique.mockResolvedValue(roomRecord());
    prisma.roomOutOfServicePeriod.findFirst.mockResolvedValue(null);
    prisma.roomOutOfServicePeriod.create.mockResolvedValue({
      id: 'period-1',
      roomId: roomRecord().id,
      propertyId: property.id,
      fromDate: new Date('2026-06-10T00:00:00.000Z'),
      toDate: new Date('2026-06-12T00:00:00.000Z'),
      reason: 'Bathroom repair',
      notes: 'Plumbing',
      createdAt: new Date('2026-06-01T00:00:00.000Z'),
      updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    });

    await expect(
      service.createOutOfServicePeriod(
        roomRecord().id,
        {
          from_date: '2026-06-10',
          to_date: '2026-06-12',
          reason: 'Bathroom repair',
          notes: 'Plumbing',
        },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        room_id: roomRecord().id,
        property_id: property.id,
        from_date: '2026-06-10',
        to_date: '2026-06-12',
      }),
    );

    expect(inventoryService.acquireInventoryAllocationLock).toHaveBeenCalledWith(
      prisma,
      property.id,
      roomCategory.id,
    );
    expect(backgroundJobService.queueInventorySyncsForProperty).toHaveBeenCalledWith(property.id, {
      trigger: 'room_out_of_service_created',
    });
  });

  function roomRecord() {
    return {
      id: '7f43ac6b-743c-4e21-b3a3-931025058655',
      propertyId: property.id,
      roomCategoryId: roomCategory.id,
      roomNumber: '101',
      status: RoomStatus.AVAILABLE,
      property,
      roomCategory,
      createdAt: new Date('2026-04-28T00:00:00.000Z'),
      updatedAt: new Date('2026-04-28T00:00:00.000Z'),
    };
  }
});
