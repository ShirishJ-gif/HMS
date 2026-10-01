import { ConflictException, NotFoundException } from '@nestjs/common';
import { BookingStatus, PaymentStatus, Prisma, RoomStatus } from '@prisma/client';
import { BillingService } from './billing.service';

describe('BillingService', () => {
  const tx = {
    $queryRaw: jest.fn(),
    auditLog: { create: jest.fn() },
    user: { findUnique: jest.fn() },
    reservationRoom: { findUnique: jest.fn() },
    billing: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    billingExtraCharge: { create: jest.fn(), delete: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(),
    billing: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn() },
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
  const reservationGroup = {
    id: '3ffbbafc-1023-4ee0-9ed6-13c31c7fe29f',
    propertyId: property.id,
    primaryGuestId: guest.id,
    channelConnectionId: '4ffbbafc-1023-4ee0-9ed6-13c31c7fe29f',
    externalReservationId: 'ota-res-1',
    externalReservationVersion: null,
    externalStatus: 'booked',
    source: 'ZODOMUS',
    currency: 'INR',
    totalAmount: new Prisma.Decimal('15000.00'),
    status: BookingStatus.BOOKED,
    remarks: null,
    bookedAt: null,
    modifiedAt: null,
    rawPayload: null,
    property,
    primaryGuest: guest,
    createdAt: new Date('2026-04-28T00:00:00.000Z'),
    updatedAt: new Date('2026-04-28T00:00:00.000Z'),
  };
  const reservationRoom = {
    id: '5ffbbafc-1023-4ee0-9ed6-13c31c7fe29f',
    reservationGroupId: reservationGroup.id,
    propertyId: property.id,
    externalRoomReservationId: 'ota-room-1',
    externalRoomId: 'ext-room-1',
    roomCategoryId: roomCategory.id,
    ratePlanId: ratePlan.id,
    roomId: room.id,
    arrivalDate: new Date('2026-05-01T00:00:00.000Z'),
    departureDate: new Date('2026-05-03T00:00:00.000Z'),
    totalAmount: new Prisma.Decimal('15000.00'),
    currency: 'INR',
    status: BookingStatus.BOOKED,
    guestName: guest.name,
    adults: 2,
    children: 0,
    rawPayload: null,
    reservationGroup,
    roomCategory,
    ratePlan,
    room,
    createdAt: new Date('2026-04-28T00:00:00.000Z'),
    updatedAt: new Date('2026-04-28T00:00:00.000Z'),
    billings: [],
  };

  let service: BillingService;

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((callback) => callback(tx));
    service = new BillingService(prisma as never);
    tx.billingExtraCharge.create.mockImplementation(({ data }) => ({ ...data, id: "charge-1", amount: new Prisma.Decimal(data.amount) }));
  });

  it('generates an invoice from imported room-stay total and tax', async () => {
    const billing = billingRecord();

    tx.reservationRoom.findUnique.mockResolvedValue(reservationRoom);
    tx.billing.create.mockResolvedValue(billing);
    prisma.billing.findUniqueOrThrow.mockResolvedValue(billing);

    await expect(
      service.createInvoice({
        reservation_room_id: reservationRoom.id,
        tax: '1800.00',
      }),
    ).resolves.toMatchObject({
      id: billing.id,
      reservation_room_id: reservationRoom.id,
      amount: 15000,
      tax: 1800,
      total: 16800,
      payment_status: PaymentStatus.PENDING,
    });
  });

  it('prevents duplicate invoices for an imported room stay', async () => {
    prisma.$transaction.mockImplementation(async (callback) => callback({
      ...tx,
      reservationRoom: { findUnique: jest.fn().mockResolvedValue(reservationRoom) },
      billing: { ...tx.billing, findUnique: jest.fn().mockResolvedValue({ id: 'b4ddf4f6-3ea0-47f7-a39d-49180e9f54d2' }) },
    }));

    await expect(service.createInvoice({ reservation_room_id: reservationRoom.id })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('returns not found when imported room stay is missing', async () => {
    prisma.$transaction.mockImplementation((callback) => callback(tx));
    tx.reservationRoom.findUnique.mockResolvedValue(null);

    await expect(service.createInvoice({ reservation_room_id: reservationRoom.id })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('updates payment status', async () => {
    const paidBilling = billingRecord({ paymentStatus: PaymentStatus.PAID, payments: [{ amount: new Prisma.Decimal(16800), status: 'SUCCEEDED' }] });
    tx.billing.findUnique.mockResolvedValue(paidBilling);
    tx.billing.update.mockResolvedValue(paidBilling);

    await expect(
      service.updatePaymentStatus(paidBilling.id, { payment_status: PaymentStatus.PAID }),
    ).resolves.toMatchObject({
      id: paidBilling.id,
      payment_status: PaymentStatus.PAID,
    });
  });

  it('omits detached invoices from invoice list responses', async () => {
    prisma.$transaction.mockResolvedValue([[], 0]);

    await expect(service.findAll({ page: 1, limit: 25 })).resolves.toMatchObject({
      data: [],
      meta: {
        total: 0,
      },
    });
    expect(prisma.billing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [{ reservationRoomId: { not: null } }],
        },
      }),
    );
    expect(prisma.billing.count).toHaveBeenCalledWith({
      where: {
        AND: [{ reservationRoomId: { not: null } }],
      },
    });
  });

  it('reopens a paid bill when a guest extra charge is added', async () => {
    const existing = billingRecord({
      paymentStatus: PaymentStatus.PAID,
      payments: [{ amount: new Prisma.Decimal(16800), status: 'SUCCEEDED' }],
    });
    tx.billing.findUnique.mockResolvedValue(existing);
    tx.billing.update.mockImplementation(({ data }) => ({ ...existing, ...data,
      extraCharges: [{ id: 'charge-1', description: 'Dinner', amount: new Prisma.Decimal(5000) }],
    }));
    const result = await service.addExtraCharge(existing.id, { description: 'Dinner', amount: '5000' });
    expect(result).toMatchObject({ total: 21800, balance_due: 5000, payment_status: PaymentStatus.PARTIAL });
  });

  it('marks a bill paid when removing the last outstanding extra charge', async () => {
    const existing = billingRecord({
      total: new Prisma.Decimal(21800), paymentStatus: PaymentStatus.PARTIAL,
      extraCharges: [{ id: 'charge-1', description: 'Dinner', amount: new Prisma.Decimal(5000) }],
      payments: [{ amount: new Prisma.Decimal(16800), status: 'SUCCEEDED' }],
    });
    tx.billing.findUnique.mockResolvedValue(existing);
    tx.billing.update.mockImplementation(({ data }) => ({ ...existing, ...data, extraCharges: [] }));
    const result = await service.deleteExtraCharge(existing.id, 'charge-1');
    expect(result).toMatchObject({ total: 16800, balance_due: 0, payment_status: PaymentStatus.PAID });
  });

  it('keeps fully refunded bills refunded when adding charges', async () => {
    const existing = billingRecord({ paymentStatus: PaymentStatus.REFUNDED, payments: [
      { amount: new Prisma.Decimal(16800), status: 'SUCCEEDED' },
      { amount: new Prisma.Decimal(16800), status: 'REFUNDED' },
    ] });
    tx.billing.findUnique.mockResolvedValue(existing);
    tx.billing.update.mockImplementation(({ data }) => ({ ...existing, ...data,
      extraCharges: [{ id: 'charge-1', description: 'Dinner', amount: new Prisma.Decimal(5000) }],
    }));
    const result = await service.addExtraCharge(existing.id, { description: 'Dinner', amount: '5000' });
    expect(result).toMatchObject({ total: 21800, balance_due: 21800, payment_status: PaymentStatus.REFUNDED });
  });

  it('does not allow an arbitrary PAID status to hide an unpaid balance', async () => {
    const existing = billingRecord();
    tx.billing.findUnique.mockResolvedValue(existing);
    await expect(service.updatePaymentStatus(existing.id, { payment_status: PaymentStatus.PAID })).rejects.toThrow(ConflictException);
    expect(tx.billing.update).not.toHaveBeenCalled();
  });

  it('leaves only extra services due after an Airbnb room settlement', async () => {
    const existing = billingRecord({ paymentStatus: PaymentStatus.PAID, payments: [
      { amount: new Prisma.Decimal(13000), status: 'SUCCEEDED', metadata: { source: 'airbnb_payout_email' } },
    ] });
    tx.billing.findUnique.mockResolvedValue(existing);
    tx.billing.update.mockImplementation(({ data }) => ({ ...existing, ...data,
      extraCharges: [{ id: 'charge-1', description: 'Dinner', amount: new Prisma.Decimal(5000) }],
    }));
    const result = await service.addExtraCharge(existing.id, { description: 'Dinner', amount: '5000' });
    expect(result).toMatchObject({ total: 21800, paid_total: 13000, balance_due: 5000, payment_status: PaymentStatus.PARTIAL });
  });

  function billingRecord(overrides: Record<string, unknown> = {}): any {
    return {
      id: 'b4ddf4f6-3ea0-47f7-a39d-49180e9f54d2',
      reservationRoomId: reservationRoom.id,
      amount: new Prisma.Decimal('15000.00'),
      tax: new Prisma.Decimal('1800.00'),
      total: new Prisma.Decimal('16800.00'),
      paymentStatus: PaymentStatus.PENDING,
      reservationRoom,
      extraCharges: [],
      payments: [],
      createdAt: new Date('2026-04-28T00:00:00.000Z'),
      updatedAt: new Date('2026-04-28T00:00:00.000Z'),
      ...overrides,
    };
  }
});
