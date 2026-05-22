import { BookingStatus, ChannelConnectionStatus, PaymentStatus, Prisma, RoomStatus } from '@prisma/client';
import { BookingService } from './booking.service';

describe('BookingService', () => {
  const originalZodomusEnvironment = process.env.ZODOMUS_ENVIRONMENT;
  const originalShowDetachedOtaReservationHistory = process.env.SHOW_DETACHED_OTA_RESERVATION_HISTORY;

  const tx = {
    reservationRoom: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    reservationGroup: {
      update: jest.fn(),
    },
    room: {
      update: jest.fn(),
    },
    billing: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    housekeepingTask: {
      create: jest.fn(),
    },
  };

  const prisma = {
    $transaction: jest.fn(),
  };

  const backgroundJobService = {
    enqueue: jest.fn(),
  };

  const auditLogService = {
    record: jest.fn(),
  };

  const inventoryService = {
    allocateInventory: jest.fn(),
  };

  const pricingService = {
    calculateStayPricing: jest.fn(),
  };

  const reservationRoom = {
    id: 'room-line-1',
    reservationGroupId: 'group-1',
    propertyId: 'property-1',
    externalRoomReservationId: 'ota-room-1',
    externalRoomId: 'external-room-1',
    roomCategoryId: 'category-1',
    ratePlanId: 'rate-1',
    roomId: 'physical-room-1',
    arrivalDate: new Date('2026-05-10T00:00:00.000Z'),
    departureDate: new Date('2026-05-11T00:00:00.000Z'),
    totalAmount: new Prisma.Decimal('4200.00'),
    currency: 'INR',
    status: BookingStatus.CHECKED_IN,
    guestName: 'Ops Guest',
    adults: 2,
    children: 0,
    reservationGroup: {
      id: 'group-1',
    },
    roomCategory: {
      id: 'category-1',
      name: 'Standard',
      code: 'STANDARD',
    },
    ratePlan: {
      id: 'rate-1',
      name: 'Standard Flexible',
      code: 'STANDARD-FLEX',
      baseRate: new Prisma.Decimal('4200.00'),
      currency: 'INR',
    },
    room: {
      id: 'physical-room-1',
      roomNumber: '101',
      status: RoomStatus.OCCUPIED,
    },
  };

  let service: BookingService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((callback: (client: typeof tx) => unknown) => callback(tx));
    tx.reservationRoom.findUnique.mockResolvedValue(reservationRoom);
    tx.room.update.mockResolvedValue(null);
    tx.reservationRoom.update.mockResolvedValue({
      ...reservationRoom,
      status: BookingStatus.CHECKED_OUT,
      room: {
        ...reservationRoom.room,
        status: RoomStatus.AVAILABLE,
      },
    });
    tx.reservationRoom.findMany.mockResolvedValue([{ status: BookingStatus.CHECKED_OUT }]);
    tx.reservationGroup.update.mockResolvedValue(null);
    tx.housekeepingTask.create.mockResolvedValue(null);
    tx.billing.findUnique.mockResolvedValue(null);
    tx.billing.create.mockResolvedValue({
      id: 'billing-1',
      reservationRoomId: reservationRoom.id,
      amount: new Prisma.Decimal('4200.00'),
      tax: new Prisma.Decimal('0.00'),
      total: new Prisma.Decimal('4200.00'),
      paymentStatus: PaymentStatus.PENDING,
    });

    service = new BookingService(
      prisma as never,
      backgroundJobService as never,
      auditLogService as never,
      inventoryService as never,
      pricingService as never,
    );
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

  it('creates a pending invoice automatically when checking out a room stay without billing', async () => {
    const response = await service.checkOutReservationRoom(reservationRoom.id);

    expect(tx.billing.findUnique).toHaveBeenCalledWith({
      where: { reservationRoomId: reservationRoom.id },
    });
    expect(tx.billing.create).toHaveBeenCalledTimes(1);
    const billingCreatePayload = tx.billing.create.mock.calls[0][0];
    expect(billingCreatePayload.data.reservationRoomId).toBe(reservationRoom.id);
    expect(billingCreatePayload.data.paymentStatus).toBe(PaymentStatus.PENDING);
    expect(billingCreatePayload.data.amount.toString()).toBe('4200');
    expect(billingCreatePayload.data.tax.toString()).toBe('0');
    expect(billingCreatePayload.data.total.toString()).toBe('4200');
    expect(response.reservation_status).toBe(BookingStatus.CHECKED_OUT);
  });

  it('does not create a second invoice when one already exists at checkout', async () => {
    tx.billing.findUnique.mockResolvedValue({
      id: 'billing-1',
      reservationRoomId: reservationRoom.id,
    });

    await service.checkOutReservationRoom(reservationRoom.id);

    expect(tx.billing.create).not.toHaveBeenCalled();
  });

  it('builds reservation feed status filters with the prisma status field', () => {
    const where = (
      service as unknown as {
        reservationFeedImportedWhere: (
          propertyId: string | null,
          search: string,
          status?: BookingStatus,
          includeCancelled?: boolean,
        ) => Record<string, unknown>;
      }
    ).reservationFeedImportedWhere('property-1', 'ops', BookingStatus.CHECKED_IN);

    expect(where).toMatchObject({
      propertyId: 'property-1',
      status: BookingStatus.CHECKED_IN,
    });
    expect(where).not.toHaveProperty('reservationStatus');
  });

  it('excludes cancelled reservations from the default reservation feed', () => {
    const where = (
      service as unknown as {
        reservationFeedImportedWhere: (
          propertyId: string | null,
          search: string,
          status?: BookingStatus,
          includeCancelled?: boolean,
        ) => Record<string, unknown>;
      }
    ).reservationFeedImportedWhere('property-1', '');

    expect(where).toMatchObject({
      propertyId: 'property-1',
      status: { not: BookingStatus.CANCELLED },
    });
  });

  it('can include cancelled reservations when explicitly requested', () => {
    const where = (
      service as unknown as {
        reservationFeedImportedWhere: (
          propertyId: string | null,
          search: string,
          status?: BookingStatus,
          includeCancelled?: boolean,
        ) => Record<string, unknown>;
      }
    ).reservationFeedImportedWhere('property-1', '', undefined, true);

    expect(where).toMatchObject({
      propertyId: 'property-1',
    });
    expect(where).not.toHaveProperty('status');
  });

  it('hides detached or paused OTA reservation history in non-production reservation feeds', () => {
    process.env.ZODOMUS_ENVIRONMENT = 'sandbox';
    delete process.env.SHOW_DETACHED_OTA_RESERVATION_HISTORY;

    const where = (
      service as unknown as {
        reservationFeedImportedWhere: (
          propertyId: string | null,
          search: string,
          status?: BookingStatus,
          includeCancelled?: boolean,
        ) => Record<string, unknown>;
      }
    ).reservationFeedImportedWhere('property-1', '');

    expect(where).toMatchObject({
      AND: [
        {
          OR: [
            { channelConnection: { is: { status: ChannelConnectionStatus.ACTIVE } } },
            { channelConnectionId: null, source: 'DIRECT' },
          ],
        },
      ],
    });
  });

  it('can show detached OTA reservation history in production-style feeds', () => {
    process.env.ZODOMUS_ENVIRONMENT = 'production';
    delete process.env.SHOW_DETACHED_OTA_RESERVATION_HISTORY;

    const where = (
      service as unknown as {
        reservationFeedImportedWhere: (
          propertyId: string | null,
          search: string,
          status?: BookingStatus,
          includeCancelled?: boolean,
        ) => Record<string, unknown>;
      }
    ).reservationFeedImportedWhere('property-1', '');

    expect(where).not.toHaveProperty('OR');
  });
});
