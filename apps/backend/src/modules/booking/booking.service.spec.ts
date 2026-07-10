import {
  BookingStatus,
  ChannelConnectionStatus,
  PaymentProvider,
  PaymentStatus,
  PaymentTransactionStatus,
  Prisma,
  RoomStatus,
} from '@prisma/client';
import { BookingService } from './booking.service';

describe('BookingService', () => {
  const originalZodomusEnvironment = process.env.ZODOMUS_ENVIRONMENT;
  const originalShowDetachedOtaReservationHistory = process.env.SHOW_DETACHED_OTA_RESERVATION_HISTORY;

  const tx = {
    property: {
      findUnique: jest.fn(),
    },
    roomCategory: {
      findUnique: jest.fn(),
    },
    ratePlan: {
      findUnique: jest.fn(),
    },
    guest: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    reservationRoom: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    reservationGroup: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    room: {
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    billing: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    paymentTransaction: {
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
    queueInventorySyncsForProperty: jest.fn(),
  };

  const auditLogService = {
    record: jest.fn(),
  };

  const inventoryService = {
    allocateInventory: jest.fn(),
    acquireInventoryAllocationLock: jest.fn(),
  };

  const pricingService = {
    calculateStayPricing: jest.fn(),
  };

  const paymentProviderService = {
    collect: jest.fn(),
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

  const directGuest = {
    id: 'guest-1',
    propertyId: 'property-1',
    name: 'Direct Guest',
    phone: '+911234567890',
    email: 'direct@test.local',
    idProof: 'DL-1234',
    address: 'Marine Drive',
  };

  const directReservationGroup = {
    id: 'group-direct-1',
    propertyId: 'property-1',
    primaryGuestId: directGuest.id,
    channelConnectionId: null,
    externalReservationId: 'HBR-D-260623-ABCD',
    externalReservationVersion: '1',
    externalStatus: 'CONFIRMED',
    source: 'DIRECT',
    currency: 'INR',
    totalAmount: new Prisma.Decimal('8400.00'),
    status: BookingStatus.BOOKED,
    remarks: 'Late arrival',
    bookedAt: new Date('2026-06-23T12:00:00.000Z'),
    modifiedAt: new Date('2026-06-23T12:00:00.000Z'),
    createdAt: new Date('2026-06-23T12:00:00.000Z'),
    updatedAt: new Date('2026-06-23T12:00:00.000Z'),
    property: {
      id: 'property-1',
      name: 'Harbour',
      code: 'HBR',
      phone: '+919876543210',
    },
    primaryGuest: directGuest,
    channelConnection: null,
    rooms: [
      {
        ...reservationRoom,
        id: 'direct-room-1',
        reservationGroupId: 'group-direct-1',
        externalRoomReservationId: 'HBR-D-260623-ABCD-1',
        externalRoomId: 'DIRECT:STANDARD',
        arrivalDate: new Date('2026-06-25T00:00:00.000Z'),
        departureDate: new Date('2026-06-27T00:00:00.000Z'),
        totalAmount: new Prisma.Decimal('4200.00'),
        status: BookingStatus.BOOKED,
        guestName: directGuest.name,
        roomCategory: {
          ...reservationRoom.roomCategory,
          name: 'Deluxe',
          code: 'DELUXE',
        },
        room: null,
      },
      {
        ...reservationRoom,
        id: 'direct-room-2',
        reservationGroupId: 'group-direct-1',
        externalRoomReservationId: 'HBR-D-260623-ABCD-2',
        externalRoomId: 'DIRECT:STANDARD',
        arrivalDate: new Date('2026-06-25T00:00:00.000Z'),
        departureDate: new Date('2026-06-27T00:00:00.000Z'),
        totalAmount: new Prisma.Decimal('4200.00'),
        status: BookingStatus.BOOKED,
        guestName: directGuest.name,
        roomCategory: {
          ...reservationRoom.roomCategory,
          name: 'Deluxe',
          code: 'DELUXE',
        },
        room: null,
      },
    ],
  };

  let service: BookingService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((callback: (client: typeof tx) => unknown) => callback(tx));
    tx.reservationRoom.findUnique.mockResolvedValue(reservationRoom);
    tx.room.update.mockResolvedValue(null);
    tx.room.updateMany.mockResolvedValue({ count: 1 });
    tx.property.findUnique.mockResolvedValue({
      id: 'property-1',
      code: 'HBR',
      name: 'Harbour',
      phone: '+919876543210',
    });
    tx.roomCategory.findUnique.mockResolvedValue({
      id: 'category-1',
      propertyId: 'property-1',
      name: 'Deluxe',
      code: 'DELUXE',
    });
    tx.ratePlan.findUnique.mockResolvedValue({
      id: 'rate-1',
      propertyId: 'property-1',
      roomCategoryId: 'category-1',
      name: 'Deluxe Flexible',
      code: 'DELUXE-FLEX',
      baseRate: new Prisma.Decimal('4200.00'),
      currency: 'INR',
      pricingRules: [],
    });
    tx.guest.findUnique.mockResolvedValue(directGuest);
    tx.guest.create.mockResolvedValue(directGuest);
    tx.reservationGroup.findFirst.mockResolvedValue(null);
    tx.reservationGroup.create.mockResolvedValue({ id: 'group-direct-1' });
    tx.reservationGroup.findUniqueOrThrow.mockResolvedValue(directReservationGroup);
    tx.reservationRoom.create
      .mockResolvedValueOnce({ id: 'direct-room-1' })
      .mockResolvedValueOnce({ id: 'direct-room-2' });
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
    tx.room.findFirst.mockResolvedValue(reservationRoom.room);
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
    tx.billing.update.mockResolvedValue(null);
    tx.paymentTransaction.create.mockResolvedValue({ id: 'payment-1' });
    backgroundJobService.queueInventorySyncsForProperty.mockResolvedValue(undefined);
    backgroundJobService.enqueue.mockResolvedValue(undefined);
    inventoryService.allocateInventory.mockResolvedValue(undefined);
    inventoryService.acquireInventoryAllocationLock.mockResolvedValue(undefined);
    pricingService.calculateStayPricing.mockResolvedValue({
      totalAmount: new Prisma.Decimal('4200.00'),
      currency: 'INR',
    });
    paymentProviderService.collect.mockResolvedValue({
      provider_reference: 'UPI-REF-1',
      status: PaymentTransactionStatus.SUCCEEDED,
      metadata: {
        provider: PaymentProvider.UPI,
        mode: 'local',
      },
    });

    service = new BookingService(
      prisma as never,
      backgroundJobService as never,
      auditLogService as never,
      inventoryService as never,
      paymentProviderService as never,
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

  it('creates a pending invoice automatically when checking in a room stay without billing', async () => {
    tx.reservationRoom.findUnique.mockResolvedValue({
      ...reservationRoom,
      status: BookingStatus.BOOKED,
      room: null,
    });
    tx.reservationRoom.update.mockResolvedValue({
      ...reservationRoom,
      status: BookingStatus.CHECKED_IN,
      room: reservationRoom.room,
    });

    const response = await service.checkInReservationRoom(reservationRoom.id, {});

    expect(tx.billing.findUnique).toHaveBeenCalledWith({
      where: { reservationRoomId: reservationRoom.id },
      include: { payments: true },
    });
    expect(tx.billing.create).toHaveBeenCalledTimes(1);
    const billingCreatePayload = tx.billing.create.mock.calls[0][0];
    expect(billingCreatePayload.data.reservationRoomId).toBe(reservationRoom.id);
    expect(billingCreatePayload.data.paymentStatus).toBe(PaymentStatus.PENDING);
    expect(billingCreatePayload.data.amount.toString()).toBe('4200');
    expect(billingCreatePayload.data.tax.toString()).toBe('0');
    expect(billingCreatePayload.data.total.toString()).toBe('4200');
    expect(response.reservation_status).toBe(BookingStatus.CHECKED_IN);
  });

  it('expands advance billing to the full stay amount when checking in', async () => {
    tx.reservationRoom.findUnique.mockResolvedValue({
      ...reservationRoom,
      status: BookingStatus.BOOKED,
      room: null,
    });
    tx.reservationRoom.update.mockResolvedValue({
      ...reservationRoom,
      status: BookingStatus.CHECKED_IN,
      room: reservationRoom.room,
    });
    tx.billing.findUnique.mockResolvedValue({
      id: 'billing-1',
      reservationRoomId: reservationRoom.id,
      amount: new Prisma.Decimal('2500.00'),
      tax: new Prisma.Decimal('0'),
      total: new Prisma.Decimal('2500.00'),
      paymentStatus: PaymentStatus.PAID,
      payments: [
        {
          amount: new Prisma.Decimal('2500.00'),
          status: PaymentTransactionStatus.SUCCEEDED,
        },
      ],
    });

    await service.checkInReservationRoom(reservationRoom.id, {});

    expect(tx.billing.create).not.toHaveBeenCalled();
    expect(tx.billing.update).toHaveBeenCalledWith({
      where: { id: 'billing-1' },
      data: {
        amount: reservationRoom.totalAmount,
        total: reservationRoom.totalAmount,
        paymentStatus: PaymentStatus.PARTIAL,
      },
    });
  });

  it('creates a pending invoice automatically when checking out a room stay without billing', async () => {
    const response = await service.checkOutReservationRoom(reservationRoom.id);

    expect(tx.billing.findUnique).toHaveBeenCalledWith({
      where: { reservationRoomId: reservationRoom.id },
      include: { payments: true },
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
      tax: new Prisma.Decimal('0'),
      payments: [],
    });

    await service.checkOutReservationRoom(reservationRoom.id);

    expect(tx.billing.create).not.toHaveBeenCalled();
    expect(tx.billing.update).toHaveBeenCalledWith({
      where: { id: 'billing-1' },
      data: {
        amount: reservationRoom.totalAmount,
        total: reservationRoom.totalAmount,
        paymentStatus: PaymentStatus.PENDING,
      },
    });
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

  it('uses non-cancelled room dates for the reservation group stay window', () => {
    const response = (
      service as unknown as {
        toReservationGroupResponse: (group: unknown) => { arrival_date: string | null; departure_date: string | null };
      }
    ).toReservationGroupResponse({
      id: 'group-1',
      propertyId: 'property-1',
      primaryGuestId: 'guest-1',
      channelConnectionId: 'connection-1',
      externalReservationId: 'OTA-123',
      externalReservationVersion: null,
      externalStatus: 'modified',
      source: 'ZODOMUS',
      currency: 'INR',
      totalAmount: new Prisma.Decimal('9000'),
      status: BookingStatus.BOOKED,
      remarks: null,
      bookedAt: null,
      modifiedAt: new Date('2026-07-01T00:00:00.000Z'),
      createdAt: new Date('2026-07-01T00:00:00.000Z'),
      updatedAt: new Date('2026-07-01T00:00:00.000Z'),
      property: { id: 'property-1', name: 'Harbour', code: 'HBR' },
      primaryGuest: { id: 'guest-1', name: 'OTA Guest', phone: null, email: null },
      channelConnection: null,
      rooms: [
        {
          ...reservationRoom,
          id: 'cancelled-room-line',
          externalRoomReservationId: 'old-room-line',
          arrivalDate: new Date('2026-08-01T00:00:00.000Z'),
          departureDate: new Date('2026-08-02T00:00:00.000Z'),
          status: BookingStatus.CANCELLED,
        },
        {
          ...reservationRoom,
          id: 'active-room-line',
          externalRoomReservationId: 'new-room-line',
          arrivalDate: new Date('2026-10-01T00:00:00.000Z'),
          departureDate: new Date('2026-10-02T00:00:00.000Z'),
          status: BookingStatus.BOOKED,
        },
      ],
    });

    expect(response.arrival_date).toBe('2026-10-01');
    expect(response.departure_date).toBe('2026-10-02');
  });

  it('ignores cancelled room lines when applying the default reservation feed date window', () => {
    const where = (
      service as unknown as {
        reservationFeedImportedWhere: (
          propertyId: string | null,
          search: string,
          status?: BookingStatus,
          includeCancelled?: boolean,
          dateWindow?: { from?: Date; toExclusive?: Date },
        ) => Record<string, unknown>;
      }
    ).reservationFeedImportedWhere('property-1', '', undefined, false, {
      from: new Date('2026-08-01T00:00:00.000Z'),
      toExclusive: new Date('2026-08-02T00:00:00.000Z'),
    });

    expect(where).toMatchObject({
      rooms: {
        some: {
          status: { not: BookingStatus.CANCELLED },
          OR: [
            {
              arrivalDate: { lt: new Date('2026-08-02T00:00:00.000Z') },
              departureDate: { gt: new Date('2026-08-01T00:00:00.000Z') },
            },
            {
              checkedInAt: {
                gte: new Date('2026-08-01T00:00:00.000Z'),
                lt: new Date('2026-08-02T00:00:00.000Z'),
              },
            },
            {
              checkedOutAt: {
                gte: new Date('2026-08-01T00:00:00.000Z'),
                lt: new Date('2026-08-02T00:00:00.000Z'),
              },
            },
          ],
        },
      },
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

  it('builds compact direct reservation references for staff-facing direct bookings', () => {
    const reference = (
      service as unknown as {
        buildDirectReservationReference: (propertyCode?: string | null, now?: Date) => string;
      }
    ).buildDirectReservationReference('HBR', new Date('2026-06-23T12:00:00.000Z'));

    expect(reference).toMatch(/^HBR-D-260623-[A-F0-9]{4}$/);
  });

  it('queues an owner notification when creating a direct reservation', async () => {
    const response = await service.createDirectReservation({
      property_id: 'property-1',
      room_category_id: 'category-1',
      rate_plan_id: 'rate-1',
      check_in_date: '2026-06-25',
      check_out_date: '2026-06-27',
      room_count: 2,
      guest_id: directGuest.id,
      remarks: 'Late arrival',
    });

    expect(backgroundJobService.enqueue).toHaveBeenCalledWith({
      type: 'NOTIFICATION_SEND',
      propertyId: 'property-1',
      dedupeKey: 'notification:direct-owner-reservation:group-direct-1',
      entityType: 'notification',
      entityId: 'direct-owner-reservation:group-direct-1',
      payload: {
        template: 'owner_reservation_notification',
        owner_phone: '+919876543210',
        property_name: 'Harbour',
        guest_name: 'Direct Guest',
        guest_phone: '+911234567890',
        room_category_name: 'Deluxe x2',
        check_in_date: '2026-06-25T00:00:00.000Z',
        check_out_date: '2026-06-27T00:00:00.000Z',
        total_amount: '8400',
      },
      maxAttempts: 3,
    });
    expect(backgroundJobService.queueInventorySyncsForProperty).toHaveBeenCalledWith('property-1', {
      trigger: 'direct_reservation_created',
      from: '2026-06-25',
      to: '2026-06-26',
    });
    expect(tx.billing.create).not.toHaveBeenCalled();
    expect(response.external_reservation_id).toBe('HBR-D-260623-ABCD');
  });

  it('records an advance as partial folio payments during walk-in reservation creation', async () => {
    await service.createDirectReservation({
      property_id: 'property-1',
      room_category_id: 'category-1',
      rate_plan_id: 'rate-1',
      check_in_date: '2026-06-25',
      check_out_date: '2026-06-27',
      room_count: 2,
      guest_id: directGuest.id,
      source: 'WALK_IN',
      advance_amount: '5000.00',
      advance_payment_provider: PaymentProvider.UPI,
      advance_payment_reference: 'UPI123',
    });

    expect(tx.billing.create).toHaveBeenCalledTimes(2);
    expect(tx.billing.create.mock.calls[0][0]).toMatchObject({
      data: {
        reservationRoomId: 'direct-room-1',
        amount: new Prisma.Decimal('4200.00'),
        total: new Prisma.Decimal('4200.00'),
        paymentStatus: PaymentStatus.PAID,
      },
    });
    expect(tx.billing.create.mock.calls[1][0]).toMatchObject({
      data: {
        reservationRoomId: 'direct-room-2',
        amount: new Prisma.Decimal('800.00'),
        total: new Prisma.Decimal('800.00'),
        paymentStatus: PaymentStatus.PAID,
      },
    });
    expect(tx.paymentTransaction.create).toHaveBeenCalledTimes(2);
    expect(tx.paymentTransaction.create.mock.calls[0][0]).toMatchObject({
      data: {
        billingId: 'billing-1',
        provider: PaymentProvider.UPI,
      },
    });
    expect(tx.paymentTransaction.create.mock.calls[0][0].data.amount.toString()).toBe('4200');
    expect(tx.paymentTransaction.create.mock.calls[1][0].data.amount.toString()).toBe('800');
    expect(paymentProviderService.collect).toHaveBeenCalledWith({
      amount: '4200.00',
      provider: PaymentProvider.UPI,
      providerReference: 'UPI123:group-direct-1:1',
    });
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'PAYMENT_COLLECT',
        entityType: 'reservation_group_folio',
        entityId: 'group-direct-1',
      }),
    );
  });

  it('records only collected advance billing for room lines covered by a smaller walk-in advance', async () => {
    tx.billing.create.mockResolvedValueOnce({
      id: 'billing-1',
      total: new Prisma.Decimal('2500.00'),
      paymentStatus: PaymentStatus.PAID,
    });

    await service.createDirectReservation({
      property_id: 'property-1',
      room_category_id: 'category-1',
      rate_plan_id: 'rate-1',
      check_in_date: '2026-06-25',
      check_out_date: '2026-06-27',
      room_count: 2,
      guest_id: directGuest.id,
      source: 'WALK_IN',
      advance_amount: '2500.00',
      advance_payment_provider: PaymentProvider.CASH,
    });

    expect(tx.billing.create).toHaveBeenCalledTimes(1);
    expect(tx.billing.create.mock.calls[0][0]).toMatchObject({
      data: {
        reservationRoomId: 'direct-room-1',
        amount: new Prisma.Decimal('2500.00'),
        total: new Prisma.Decimal('2500.00'),
        paymentStatus: PaymentStatus.PAID,
      },
    });
    expect(tx.paymentTransaction.create).toHaveBeenCalledTimes(1);
    expect(tx.paymentTransaction.create.mock.calls[0][0]).toMatchObject({
      data: {
        billingId: 'billing-1',
        provider: PaymentProvider.CASH,
      },
    });
    expect(tx.paymentTransaction.create.mock.calls[0][0].data.amount.toString()).toBe('2500');
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
            { channelConnectionId: null, source: { in: ['DIRECT', 'WALK_IN'] } },
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
