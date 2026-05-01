import { ConflictException, NotFoundException } from '@nestjs/common';
import { BookingStatus, PaymentStatus, Prisma, RoomStatus } from '@prisma/client';
import { BillingService } from './billing.service';

describe('BillingService', () => {
  const tx = {
    booking: { findUnique: jest.fn() },
    billing: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    billingExtraCharge: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn(),
    billing: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
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
  const booking = {
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
    billing: null,
    createdAt: new Date('2026-04-28T00:00:00.000Z'),
    updatedAt: new Date('2026-04-28T00:00:00.000Z'),
  };

  let service: BillingService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((callback) => callback(tx));
    service = new BillingService(prisma as never);
  });

  it('generates an invoice from booking total and tax', async () => {
    const billing = billingRecord();

    tx.booking.findUnique.mockResolvedValue(booking);
    tx.billing.create.mockResolvedValue(billing);

    await expect(
      service.createInvoice({
        booking_id: booking.id,
        tax: '1800.00',
      }),
    ).resolves.toMatchObject({
      id: billing.id,
      booking_id: booking.id,
      amount: 15000,
      tax: 1800,
      total: 16800,
      payment_status: PaymentStatus.PENDING,
    });
  });

  it('prevents duplicate invoices for a booking', async () => {
    tx.booking.findUnique.mockResolvedValue({
      ...booking,
      billing: { id: 'b4ddf4f6-3ea0-47f7-a39d-49180e9f54d2' },
    });

    await expect(service.createInvoice({ booking_id: booking.id })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('returns not found when booking is missing', async () => {
    tx.booking.findUnique.mockResolvedValue(null);

    await expect(service.createInvoice({ booking_id: booking.id })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('updates payment status', async () => {
    const paidBilling = billingRecord({ paymentStatus: PaymentStatus.PAID });
    prisma.billing.update.mockResolvedValue(paidBilling);

    await expect(
      service.updatePaymentStatus(paidBilling.id, { payment_status: PaymentStatus.PAID }),
    ).resolves.toMatchObject({
      id: paidBilling.id,
      payment_status: PaymentStatus.PAID,
    });
  });

  function billingRecord(overrides: Record<string, unknown> = {}): any {
    return {
      id: 'b4ddf4f6-3ea0-47f7-a39d-49180e9f54d2',
      bookingId: booking.id,
      amount: new Prisma.Decimal('15000.00'),
      tax: new Prisma.Decimal('1800.00'),
      total: new Prisma.Decimal('16800.00'),
      paymentStatus: PaymentStatus.PENDING,
      booking,
      extraCharges: [],
      payments: [],
      createdAt: new Date('2026-04-28T00:00:00.000Z'),
      updatedAt: new Date('2026-04-28T00:00:00.000Z'),
      ...overrides,
    };
  }
});
