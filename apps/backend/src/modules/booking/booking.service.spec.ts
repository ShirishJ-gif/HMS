import { BadRequestException, ConflictException } from '@nestjs/common';
import { BookingStatus, Prisma, RoomStatus } from '@prisma/client';
import { BookingService } from './booking.service';

describe('BookingService', () => {
  const tx = {
    $queryRaw: jest.fn(),
    guest: { findUnique: jest.fn() },
    roomCategory: { findUnique: jest.fn() },
    ratePlan: { findUnique: jest.fn() },
    room: { count: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    booking: { count: jest.fn(), create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    billing: { upsert: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(),
    booking: { findMany: jest.fn(), findUnique: jest.fn() },
  };
  const backgroundJobService = {
    enqueue: jest.fn(),
  };
  const auditLogService = {
    record: jest.fn(),
  };
  const pricingService = {
    calculateStayPricing: jest.fn(),
  };

  const property = {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Harbour Residency',
    code: 'HARBOUR-MUM',
    phone: null,
    email: null,
    address: 'Mumbai',
    timezone: 'Asia/Kolkata',
    createdAt: new Date('2026-04-28T00:00:00.000Z'),
    updatedAt: new Date('2026-04-28T00:00:00.000Z'),
  };
  const guest = {
    id: '9ddcb1e2-4388-4a16-b7f6-98549f5b73ef',
    propertyId: property.id,
    name: 'Aarav Mehta',
    phone: '+919876543210',
    email: 'aarav.mehta@example.com',
    idProof: 'AADHAAR-XXXX-1234',
    address: 'Bandra West, Mumbai, Maharashtra',
    createdAt: new Date('2026-04-28T00:00:00.000Z'),
    updatedAt: new Date('2026-04-28T00:00:00.000Z'),
  };
  const roomCategory = {
    id: '22222222-2222-4222-8222-222222222222',
    propertyId: property.id,
    name: 'Deluxe',
    code: 'DELUXE',
    description: null,
    maxOccupancy: 3,
    createdAt: new Date('2026-04-28T00:00:00.000Z'),
    updatedAt: new Date('2026-04-28T00:00:00.000Z'),
  };
  const ratePlan = {
    id: '33333333-3333-4333-8333-333333333333',
    propertyId: property.id,
    roomCategoryId: roomCategory.id,
    name: 'Deluxe Flexible',
    code: 'DELUXE-FLEX',
    baseRate: new Prisma.Decimal('7500.00'),
    currency: 'INR',
    isActive: true,
    pricingRules: [],
    createdAt: new Date('2026-04-28T00:00:00.000Z'),
    updatedAt: new Date('2026-04-28T00:00:00.000Z'),
  };
  const room = {
    id: '7f43ac6b-743c-4e21-b3a3-931025058655',
    propertyId: property.id,
    roomCategoryId: roomCategory.id,
    roomNumber: '202',
    status: RoomStatus.AVAILABLE,
    createdAt: new Date('2026-04-28T00:00:00.000Z'),
    updatedAt: new Date('2026-04-28T00:00:00.000Z'),
  };

  let service: BookingService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((callback) => callback(tx));
    tx.$queryRaw.mockResolvedValue([]);
    backgroundJobService.enqueue.mockResolvedValue({});
    pricingService.calculateStayPricing.mockResolvedValue({
      totalAmount: new Prisma.Decimal('15000.00'),
      currency: 'INR',
    });
    service = new BookingService(
      prisma as never,
      backgroundJobService as never,
      auditLogService as never,
      pricingService as never,
    );
  });

  it('creates a category booking when inventory is available', async () => {
    const booking = bookingRecord({ room: null, roomId: null });

    tx.guest.findUnique.mockResolvedValue(guest);
    tx.roomCategory.findUnique.mockResolvedValue(roomCategory);
    tx.ratePlan.findUnique.mockResolvedValue(ratePlan);
    tx.room.count.mockResolvedValue(2);
    tx.booking.count.mockResolvedValue(1);
    tx.booking.create.mockResolvedValue(booking);

    await expect(
      service.create({
        property_id: property.id,
        guest_id: guest.id,
        room_category_id: roomCategory.id,
        rate_plan_id: ratePlan.id,
        check_in_date: '2026-05-01',
        check_out_date: '2026-05-03',
      }),
    ).resolves.toMatchObject({
      property_id: property.id,
      guest_id: guest.id,
      room_category_id: roomCategory.id,
      rate_plan_id: ratePlan.id,
      room_id: null,
      total_amount: 15000,
      booking_status: BookingStatus.BOOKED,
    });

    expect(tx.booking.create).toHaveBeenCalledWith({
      data: {
        propertyId: property.id,
        guestId: guest.id,
        roomCategoryId: roomCategory.id,
        ratePlanId: ratePlan.id,
        checkInDate: new Date('2026-05-01T00:00:00.000Z'),
        checkOutDate: new Date('2026-05-03T00:00:00.000Z'),
        totalAmount: new Prisma.Decimal('15000.00'),
        status: BookingStatus.BOOKED,
      },
      include: expect.any(Object),
    });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(pricingService.calculateStayPricing).toHaveBeenCalledWith({
      db: tx,
      propertyId: property.id,
      roomCategoryId: roomCategory.id,
      ratePlan,
      checkInDate: new Date('2026-05-01T00:00:00.000Z'),
      checkOutDate: new Date('2026-05-03T00:00:00.000Z'),
    });
    expect(backgroundJobService.enqueue).toHaveBeenCalledTimes(2);
    expect(backgroundJobService.enqueue).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        type: 'NOTIFICATION_SEND',
        propertyId: property.id,
        dedupeKey: `notification:booking-confirmation:${booking.id}`,
      }),
    );
    expect(backgroundJobService.enqueue).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        type: 'NOTIFICATION_SEND',
        propertyId: property.id,
        dedupeKey: `notification:owner-booking-notification:${booking.id}`,
      }),
    );
  });

  it('rejects category bookings when inventory is sold out', async () => {
    tx.guest.findUnique.mockResolvedValue(guest);
    tx.roomCategory.findUnique.mockResolvedValue(roomCategory);
    tx.ratePlan.findUnique.mockResolvedValue(ratePlan);
    tx.room.count.mockResolvedValue(1);
    tx.booking.count.mockResolvedValue(1);

    await expect(
      service.create({
        property_id: property.id,
        guest_id: guest.id,
        room_category_id: roomCategory.id,
        rate_plan_id: ratePlan.id,
        check_in_date: '2026-05-01',
        check_out_date: '2026-05-03',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects invalid date ranges', async () => {
    await expect(
      service.create({
        property_id: property.id,
        guest_id: guest.id,
        room_category_id: roomCategory.id,
        rate_plan_id: ratePlan.id,
        check_in_date: '2026-05-03',
        check_out_date: '2026-05-03',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('assigns a physical room on check-in', async () => {
    const booked = bookingRecord({ status: BookingStatus.BOOKED, room: null, roomId: null });
    const checkedIn = bookingRecord({
      status: BookingStatus.CHECKED_IN,
      room,
      roomId: room.id,
    });

    tx.booking.findUnique.mockResolvedValue(booked);
    tx.room.findFirst.mockResolvedValue(room);
    tx.room.update.mockResolvedValue({ ...room, status: RoomStatus.OCCUPIED });
    tx.booking.update.mockResolvedValue(checkedIn);

    await expect(service.checkIn(booked.id)).resolves.toMatchObject({
      id: booked.id,
      room_id: room.id,
      booking_status: BookingStatus.CHECKED_IN,
    });
  });

  it('generates a pending invoice on check-out', async () => {
    const checkedIn = bookingRecord({ status: BookingStatus.CHECKED_IN });
    const checkedOut = bookingRecord({ status: BookingStatus.CHECKED_OUT });

    tx.booking.findUnique.mockResolvedValue(checkedIn);
    tx.room.update.mockResolvedValue({ ...room, status: RoomStatus.AVAILABLE });
    tx.booking.update.mockResolvedValue(checkedOut);
    tx.billing.upsert.mockResolvedValue({});

    await expect(service.checkOut(checkedIn.id)).resolves.toMatchObject({
      id: checkedIn.id,
      booking_status: BookingStatus.CHECKED_OUT,
    });

    expect(tx.billing.upsert).toHaveBeenCalledWith({
      where: { bookingId: checkedOut.id },
      update: {},
      create: {
        bookingId: checkedOut.id,
        amount: checkedOut.totalAmount,
        tax: new Prisma.Decimal(0),
        total: checkedOut.totalAmount,
        paymentStatus: 'PENDING',
      },
    });
  });

  function bookingRecord(overrides: Record<string, unknown> = {}): any {
    return {
      id: '3ffbbafc-1023-4ee0-9ed6-13c31c7fe29f',
      propertyId: property.id,
      guestId: guest.id,
      roomCategoryId: roomCategory.id,
      ratePlanId: ratePlan.id,
      roomId: room.id,
      checkInDate: new Date('2026-05-01T00:00:00.000Z'),
      checkOutDate: new Date('2026-05-03T00:00:00.000Z'),
      totalAmount: new Prisma.Decimal('15000.00'),
      status: BookingStatus.BOOKED,
      property,
      guest,
      roomCategory,
      ratePlan,
      room,
      createdAt: new Date('2026-04-28T00:00:00.000Z'),
      updatedAt: new Date('2026-04-28T00:00:00.000Z'),
      ...overrides,
    };
  }
});
