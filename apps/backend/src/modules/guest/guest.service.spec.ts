import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.guard';
import { GuestService } from './guest.service';

describe('GuestService', () => {
  const originalZodomusEnvironment = process.env.ZODOMUS_ENVIRONMENT;
  const originalShowDetachedOtaReservationHistory = process.env.SHOW_DETACHED_OTA_RESERVATION_HISTORY;

  const prisma = {
    $transaction: jest.fn(),
    guest: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    property: { findMany: jest.fn() },
    reservationGroup: { findMany: jest.fn() },
  };

  let service: GuestService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((queries) => Promise.all(queries));
    service = new GuestService(prisma as never);
  });

  afterEach(() => {
    if (originalZodomusEnvironment === undefined) {
      delete process.env.ZODOMUS_ENVIRONMENT;
    } else {
      process.env.ZODOMUS_ENVIRONMENT = originalZodomusEnvironment;
    }

    if (originalShowDetachedOtaReservationHistory === undefined) {
      delete process.env.SHOW_DETACHED_OTA_RESERVATION_HISTORY;
    } else {
      process.env.SHOW_DETACHED_OTA_RESERVATION_HISTORY = originalShowDetachedOtaReservationHistory;
    }
  });

  it('creates a guest', async () => {
    const property = {
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Harbour Residency',
      code: 'HARBOUR-MUM',
    };
    const guest = {
      id: '9ddcb1e2-4388-4a16-b7f6-98549f5b73ef',
      propertyId: property.id,
      name: 'Aarav Mehta',
      phone: '+919876543210',
      email: 'aarav.mehta@example.com',
      idProof: 'AADHAAR-XXXX-1234',
      address: 'Bandra West, Mumbai, Maharashtra',
      property,
      createdAt: new Date('2026-04-28T00:00:00.000Z'),
      updatedAt: new Date('2026-04-28T00:00:00.000Z'),
    };

    prisma.guest.create.mockResolvedValue(guest);

    await expect(
      service.create({
        property_id: property.id,
        name: 'Aarav Mehta',
        phone: '+919876543210',
        email: 'aarav.mehta@example.com',
        id_proof: 'AADHAAR-XXXX-1234',
        address: 'Bandra West, Mumbai, Maharashtra',
      }),
    ).resolves.toEqual({
      id: guest.id,
      property_id: property.id,
      name: 'Aarav Mehta',
      phone: '+919876543210',
      email: 'aarav.mehta@example.com',
      id_proof: '****234',
      address: 'Bandra West, Mumbai, Maharashtra',
      property,
      created_at: guest.createdAt,
      updated_at: guest.updatedAt,
    });

    expect(prisma.guest.create).toHaveBeenCalledWith({
      data: {
        propertyId: property.id,
        name: 'Aarav Mehta',
        phone: '+919876543210',
        email: 'aarav.mehta@example.com',
        idProof: 'AADHAAR-XXXX-1234',
        address: 'Bandra West, Mumbai, Maharashtra',
      },
    });
  });

  it('lists guests ordered by newest first', async () => {
    prisma.guest.findMany.mockResolvedValue([]);
    prisma.guest.count.mockResolvedValue(0);

    await expect(service.findAll({ page: 1, limit: 25 })).resolves.toEqual({
      data: [],
      meta: {
        page: 1,
        limit: 25,
        total: 0,
        total_pages: 1,
      },
    });

    expect(prisma.guest.findMany).toHaveBeenCalledWith({
      where: {
        NOT: {
          address: 'Imported from Zodomus',
        },
      },
      include: {
        property: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip: 0,
      take: 25,
    });
  });

  it('can list imported OTA guests in production-style history mode', async () => {
    process.env.ZODOMUS_ENVIRONMENT = 'production';
    delete process.env.SHOW_DETACHED_OTA_RESERVATION_HISTORY;
    prisma.guest.findMany.mockResolvedValue([]);
    prisma.guest.count.mockResolvedValue(0);

    await service.findAll({ page: 1, limit: 25 });

    expect(prisma.guest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
      }),
    );
  });

  describe('directory property selection', () => {
    const propertyIds = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
    const owner: AuthenticatedUser = {
      sub: 'owner',
      email: 'owner@example.com',
      role: UserRole.ORG_OWNER,
      organization_id: 'organization',
      property_id: null,
      property_ids: propertyIds,
    };

    beforeEach(() => {
      prisma.guest.findMany.mockResolvedValue([]);
      prisma.property.findMany.mockResolvedValue([]);
      prisma.reservationGroup.findMany.mockResolvedValue([]);
    });

    it.each(propertyIds)('narrows registry and reservation guests to the selected organization property %s', async (propertyId) => {
      await service.getDirectory({ page: 1, limit: 50, property_id: propertyId }, owner);

      for (const query of [prisma.guest.findMany, prisma.reservationGroup.findMany]) {
        expect(query).toHaveBeenCalledWith(expect.objectContaining({
          where: expect.objectContaining({ propertyId }),
        }));
      }
      expect(prisma.property.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: { in: propertyIds } },
      }));
    });

    it.each(['ALL', undefined])('limits an unfiltered directory (%s) to organization properties', async (propertyId) => {
      await service.getDirectory({ page: 1, limit: 50, property_id: propertyId }, owner);

      for (const query of [prisma.guest.findMany, prisma.reservationGroup.findMany]) {
        expect(query).toHaveBeenCalledWith(expect.objectContaining({
          where: expect.objectContaining({ propertyId: { in: propertyIds } }),
        }));
      }
    });

    it('rejects a property outside the organization before querying guests', async () => {
      await expect(service.getDirectory({ page: 1, limit: 50, property_id: 'outside-property' }, owner)).rejects.toThrow(ForbiddenException);

      expect(prisma.guest.findMany).not.toHaveBeenCalled();
      expect(prisma.reservationGroup.findMany).not.toHaveBeenCalled();
    });

    it('keeps staff scoped to their assigned property when all properties are requested', async () => {
      await service.getDirectory({ page: 1, limit: 50, property_id: 'ALL' }, { ...owner, role: UserRole.STAFF, property_id: propertyIds[0] });

      for (const query of [prisma.guest.findMany, prisma.reservationGroup.findMany]) {
        expect(query).toHaveBeenCalledWith(expect.objectContaining({
          where: expect.objectContaining({ propertyId: propertyIds[0] }),
        }));
      }
    });

    it('rejects staff selecting a different property', async () => {
      await expect(service.getDirectory({ page: 1, limit: 50, property_id: propertyIds[1] }, {
        ...owner, role: UserRole.STAFF, property_id: propertyIds[0],
      })).rejects.toThrow(ForbiddenException);

      expect(prisma.guest.findMany).not.toHaveBeenCalled();
      expect(prisma.reservationGroup.findMany).not.toHaveBeenCalled();
    });
  });
});
