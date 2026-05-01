import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import {
  PrismaClient,
  BookingStatus,
  ChannelConnectionStatus,
  ChannelProvider,
  ChannelSyncStatus,
  ChannelSyncType,
  HousekeepingPriority,
  HousekeepingStatus,
  PaymentStatus,
  PaymentProvider,
  PaymentTransactionStatus,
  RoomStatus,
  UserRole,
} from '@prisma/client';

const prisma = new PrismaClient();
const scrypt = promisify(scryptCallback);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;

  return `scrypt:${salt}:${derivedKey.toString('hex')}`;
}

async function main() {
  await prisma.propertyImage.deleteMany();
  await prisma.roomCategoryImage.deleteMany();
  await prisma.channelSyncLog.deleteMany();
  await prisma.channelRateMapping.deleteMany();
  await prisma.channelRoomMapping.deleteMany();
  await prisma.channelConnection.deleteMany();
  await prisma.billingExtraCharge.deleteMany();
  await prisma.paymentTransaction.deleteMany();
  await prisma.billing.deleteMany();
  await prisma.housekeepingTask.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.guest.deleteMany();
  await prisma.room.deleteMany();
  await prisma.ratePlan.deleteMany();
  await prisma.roomCategory.deleteMany();
  await prisma.user.deleteMany();
  await prisma.property.deleteMany();

  const property = await prisma.property.create({
    data: {
      name: 'Harbour Residency',
      code: 'HARBOUR-MUM',
      phone: '+912212345678',
      email: 'ops@harbour.example.com',
      address: 'Bandra West, Mumbai, Maharashtra',
      timezone: 'Asia/Kolkata',
    },
  });

  const secondProperty = await prisma.property.create({
    data: {
      name: 'Lakeview Suites',
      code: 'LAKEVIEW-PUNE',
      phone: '+912012345678',
      email: 'ops@lakeview.example.com',
      address: 'Koregaon Park, Pune, Maharashtra',
      timezone: 'Asia/Kolkata',
    },
  });

  const lakeviewStandard = await prisma.roomCategory.create({
    data: {
      propertyId: secondProperty.id,
      name: 'Standard',
      code: 'STANDARD',
      description: 'Standard room for business travellers.',
      maxOccupancy: 2,
    },
  });

  await prisma.ratePlan.create({
    data: {
      propertyId: secondProperty.id,
      roomCategoryId: lakeviewStandard.id,
      name: 'Standard Flexible',
      code: 'STANDARD-FLEX',
      baseRate: '3600.00',
    },
  });

  await prisma.room.createMany({
    data: [
      {
        propertyId: secondProperty.id,
        roomCategoryId: lakeviewStandard.id,
        roomNumber: 'L101',
        status: RoomStatus.AVAILABLE,
      },
      {
        propertyId: secondProperty.id,
        roomCategoryId: lakeviewStandard.id,
        roomNumber: 'L102',
        status: RoomStatus.AVAILABLE,
      },
    ],
  });

  const [single, double, deluxe] = await Promise.all([
    prisma.roomCategory.create({
      data: {
        propertyId: property.id,
        name: 'Single',
        code: 'SINGLE',
        description: 'Compact room for solo travellers.',
        maxOccupancy: 1,
      },
    }),
    prisma.roomCategory.create({
      data: {
        propertyId: property.id,
        name: 'Double',
        code: 'DOUBLE',
        description: 'Standard room for two guests.',
        maxOccupancy: 2,
      },
    }),
    prisma.roomCategory.create({
      data: {
        propertyId: property.id,
        name: 'Deluxe',
        code: 'DELUXE',
        description: 'Premium room with upgraded amenities.',
        maxOccupancy: 3,
      },
    }),
  ]);

  const [singleRack, doubleRack, deluxeRack] = await Promise.all([
    prisma.ratePlan.create({
      data: {
        propertyId: property.id,
        roomCategoryId: single.id,
        name: 'Single Flexible',
        code: 'SINGLE-FLEX',
        baseRate: '2500.00',
      },
    }),
    prisma.ratePlan.create({
      data: {
        propertyId: property.id,
        roomCategoryId: double.id,
        name: 'Double Flexible',
        code: 'DOUBLE-FLEX',
        baseRate: '4200.00',
      },
    }),
    prisma.ratePlan.create({
      data: {
        propertyId: property.id,
        roomCategoryId: deluxe.id,
        name: 'Deluxe Flexible',
        code: 'DELUXE-FLEX',
        baseRate: '7500.00',
      },
    }),
  ]);

  const rooms = await Promise.all([
    prisma.room.create({
      data: {
        propertyId: property.id,
        roomCategoryId: single.id,
        roomNumber: '101',
        status: RoomStatus.AVAILABLE,
      },
    }),
    prisma.room.create({
      data: {
        propertyId: property.id,
        roomCategoryId: double.id,
        roomNumber: '102',
        status: RoomStatus.OCCUPIED,
      },
    }),
    prisma.room.create({
      data: {
        propertyId: property.id,
        roomCategoryId: deluxe.id,
        roomNumber: '201',
        status: RoomStatus.MAINTENANCE,
      },
    }),
    prisma.room.create({
      data: {
        propertyId: property.id,
        roomCategoryId: deluxe.id,
        roomNumber: '202',
        status: RoomStatus.AVAILABLE,
      },
    }),
  ]);

  const guests = await Promise.all([
    prisma.guest.create({
      data: {
        propertyId: property.id,
        name: 'Aarav Mehta',
        phone: '+919876543210',
        email: 'aarav.mehta@example.com',
        idProof: 'AADHAAR-XXXX-1234',
        address: 'Bandra West, Mumbai, Maharashtra',
      },
    }),
    prisma.guest.create({
      data: {
        propertyId: property.id,
        name: 'Priya Nair',
        phone: '+919812345678',
        email: 'priya.nair@example.com',
        idProof: 'PASSPORT-M1234567',
        address: 'Indiranagar, Bengaluru, Karnataka',
      },
    }),
  ]);

  const checkedInBooking = await prisma.booking.create({
    data: {
      propertyId: property.id,
      guestId: guests[0].id,
      roomCategoryId: double.id,
      ratePlanId: doubleRack.id,
      roomId: rooms[1].id,
      checkInDate: new Date('2026-04-28T00:00:00.000Z'),
      checkOutDate: new Date('2026-04-30T00:00:00.000Z'),
      totalAmount: '8400.00',
      status: BookingStatus.CHECKED_IN,
    },
  });

  const upcomingBooking = await prisma.booking.create({
    data: {
      propertyId: property.id,
      guestId: guests[1].id,
      roomCategoryId: deluxe.id,
      ratePlanId: deluxeRack.id,
      checkInDate: new Date('2026-05-05T00:00:00.000Z'),
      checkOutDate: new Date('2026-05-08T00:00:00.000Z'),
      totalAmount: '22500.00',
      status: BookingStatus.BOOKED,
    },
  });

  await prisma.billing.create({
    data: {
      bookingId: checkedInBooking.id,
      amount: '8400.00',
      tax: '1008.00',
      total: '10608.00',
      paymentStatus: PaymentStatus.PENDING,
      extraCharges: {
        create: [
          {
            description: 'Airport pickup',
            amount: '1200.00',
          },
        ],
      },
    },
  });

  const upcomingBilling = await prisma.billing.create({
    data: {
      bookingId: upcomingBooking.id,
      amount: '22500.00',
      tax: '2700.00',
      total: '25200.00',
      paymentStatus: PaymentStatus.PAID,
    },
  });

  await prisma.paymentTransaction.create({
    data: {
      billingId: upcomingBilling.id,
      provider: PaymentProvider.MOCK,
      providerReference: 'seed_paid_invoice',
      amount: '25200.00',
      status: PaymentTransactionStatus.SUCCEEDED,
      metadata: {
        seed: true,
      },
    },
  });

  await prisma.ratePlan.create({
    data: {
      propertyId: property.id,
      roomCategoryId: single.id,
      name: 'Single Non Refundable',
      code: 'SINGLE-NRF',
      baseRate: '2200.00',
    },
  });

  await prisma.user.create({
    data: {
      name: 'System Admin',
      email: 'admin@hms.local',
      passwordHash: await hashPassword('Admin@12345'),
      role: UserRole.SUPER_ADMIN,
    },
  });

  await prisma.user.createMany({
    data: [
      {
        propertyId: property.id,
        name: 'Harbour Admin',
        email: 'admin.harbour@hms.local',
        passwordHash: await hashPassword('Admin@12345'),
        role: UserRole.ADMIN,
      },
      {
        propertyId: property.id,
        name: 'Harbour Staff',
        email: 'staff.harbour@hms.local',
        passwordHash: await hashPassword('Staff@12345'),
        role: UserRole.STAFF,
      },
      {
        propertyId: secondProperty.id,
        name: 'Lakeview Admin',
        email: 'admin.lakeview@hms.local',
        passwordHash: await hashPassword('Admin@12345'),
        role: UserRole.ADMIN,
      },
    ],
  });

  await prisma.housekeepingTask.createMany({
    data: [
      {
        propertyId: property.id,
        roomId: rooms[0].id,
        status: HousekeepingStatus.INSPECTED,
        priority: HousekeepingPriority.NORMAL,
        notes: 'Ready for arrival.',
        dueDate: new Date('2026-04-28T00:00:00.000Z'),
      },
      {
        propertyId: property.id,
        roomId: rooms[2].id,
        status: HousekeepingStatus.OUT_OF_SERVICE,
        priority: HousekeepingPriority.HIGH,
        notes: 'Maintenance inspection required before sale.',
        dueDate: new Date('2026-04-29T00:00:00.000Z'),
      },
    ],
  });

  const mockChannel = await prisma.channelConnection.create({
    data: {
      propertyId: property.id,
      provider: ChannelProvider.MOCK,
      name: 'Mock OTA Gateway',
      status: ChannelConnectionStatus.ACTIVE,
      externalHotelId: 'MOCK-HARBOUR-MUM',
    },
  });

  await prisma.channelRoomMapping.createMany({
    data: [
      {
        channelConnectionId: mockChannel.id,
        roomCategoryId: single.id,
        externalRoomId: 'MOCK-SINGLE',
        externalRoomName: 'Mock Single Room',
      },
      {
        channelConnectionId: mockChannel.id,
        roomCategoryId: double.id,
        externalRoomId: 'MOCK-DOUBLE',
        externalRoomName: 'Mock Double Room',
      },
      {
        channelConnectionId: mockChannel.id,
        roomCategoryId: deluxe.id,
        externalRoomId: 'MOCK-DELUXE',
        externalRoomName: 'Mock Deluxe Room',
      },
    ],
  });

  await prisma.channelRateMapping.createMany({
    data: [
      {
        channelConnectionId: mockChannel.id,
        ratePlanId: singleRack.id,
        externalRateId: 'MOCK-SINGLE-FLEX',
        externalRateName: 'Mock Single Flexible',
      },
      {
        channelConnectionId: mockChannel.id,
        ratePlanId: doubleRack.id,
        externalRateId: 'MOCK-DOUBLE-FLEX',
        externalRateName: 'Mock Double Flexible',
      },
      {
        channelConnectionId: mockChannel.id,
        ratePlanId: deluxeRack.id,
        externalRateId: 'MOCK-DELUXE-FLEX',
        externalRateName: 'Mock Deluxe Flexible',
      },
    ],
  });

  await prisma.channelSyncLog.create({
    data: {
      channelConnectionId: mockChannel.id,
      syncType: ChannelSyncType.INVENTORY,
      status: ChannelSyncStatus.SUCCEEDED,
      requestPayload: { seed: true },
      responsePayload: { accepted: true, external_reference: 'seed-sync' },
    },
  });

  void singleRack;
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
