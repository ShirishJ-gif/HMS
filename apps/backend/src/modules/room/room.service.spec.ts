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
  };
  const auditLogService = {
    record: jest.fn(),
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
    prisma.$transaction.mockImplementation((queries) => Promise.all(queries));
    service = new RoomService(prisma as never, auditLogService as never);
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

  it('prevents deleting rooms with dependent bookings', async () => {
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
