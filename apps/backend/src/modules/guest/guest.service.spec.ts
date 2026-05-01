import { GuestService } from './guest.service';

describe('GuestService', () => {
  const prisma = {
    $transaction: jest.fn(),
    guest: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  let service: GuestService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((queries) => Promise.all(queries));
    service = new GuestService(prisma as never);
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
      id_proof: 'AADHAAR-XXXX-1234',
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
      where: {},
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
});
