import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, UserRole } from '@prisma/client';
import { createHmac } from 'node:crypto';
import * as request from 'supertest';
import { AppModule } from '../app.module';
import { BackgroundJobService } from '../modules/background-job/background-job.service';
import { PasswordService } from '../modules/auth/password.service';
import { ChannelProviderService } from '../modules/channel/channel-provider.service';
import { ZodomusReservationImportService } from '../modules/channel/zodomus-reservation-import.service';
import { PrismaService } from '../prisma/prisma.service';

describe('App integration', () => {
  const tag = `it${Date.now().toString().slice(-8)}`;
  const adminPassword = 'Admin@12345';

  let app: INestApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;
  let backgroundJobService: BackgroundJobService;
  let zodomusReservationImportService: ZodomusReservationImportService;

  let propertyAId: string;
  let propertyBId: string;
  let roomCategoryAId: string;
  let ratePlanAId: string;
  let roomAId: string;
  let guestA1Id: string;
  let guestA2Id: string;
  let guestA3Id: string;
  let adminAId: string;
  let adminBId: string;
  let authUserId: string;
  let adminAToken: string;
  let adminBToken: string;
  let billingAId: string;
  let channelConnectionAId: string;
  let authUserEmail: string;
  let authUserPassword: string;
  const paymentWebhookSecret = 'payment-webhook-secret';
  const channelWebhookSecret = 'channel-webhook-secret';

  beforeAll(async () => {
    process.env.PAYMENT_WEBHOOK_SECRET = paymentWebhookSecret;
    process.env.CHANNEL_WEBHOOK_SECRET = channelWebhookSecret;
    process.env.JOB_WORKER_DISABLED = 'true';
    process.env.CHANNEL_SYNC_SCHEDULER_DISABLED = 'true';
    process.env.ZODOMUS_API_USER = 'integration-user';
    process.env.ZODOMUS_API_PASSWORD = 'integration-password';
    process.env.ZODOMUS_ENVIRONMENT = 'sandbox';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication({ rawBody: true });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = moduleRef.get(PrismaService);
    passwordService = moduleRef.get(PasswordService);
    backgroundJobService = moduleRef.get(BackgroundJobService);
    zodomusReservationImportService = moduleRef.get(ZodomusReservationImportService);

    const passwordHash = await passwordService.hash(adminPassword);

    const propertyA = await prisma.property.create({
      data: {
        name: `${tag}-Property-A`,
        code: `${tag}-A`,
        address: 'Mumbai',
        timezone: 'Asia/Kolkata',
      },
    });
    propertyAId = propertyA.id;

    const propertyB = await prisma.property.create({
      data: {
        name: `${tag}-Property-B`,
        code: `${tag}-B`,
        address: 'Pune',
        timezone: 'Asia/Kolkata',
      },
    });
    propertyBId = propertyB.id;

    const categoryA = await prisma.roomCategory.create({
      data: {
        propertyId: propertyA.id,
        name: 'Standard',
        code: `${tag}-STD`,
        maxOccupancy: 2,
      },
    });
    roomCategoryAId = categoryA.id;

    const ratePlanA = await prisma.ratePlan.create({
      data: {
        propertyId: propertyA.id,
        roomCategoryId: categoryA.id,
        name: 'Standard Flexible',
        code: `${tag}-STD-FLEX`,
        baseRate: '3000.00',
        currency: 'INR',
        isActive: true,
      },
    });
    ratePlanAId = ratePlanA.id;

    const roomA = await prisma.room.create({
      data: {
        propertyId: propertyA.id,
        roomCategoryId: categoryA.id,
        roomNumber: `${tag}101`.slice(0, 20),
      },
    });
    roomAId = roomA.id;

    const [guestA1, guestA2, guestA3] = await prisma.$transaction([
      prisma.guest.create({
        data: {
          propertyId: propertyA.id,
          name: 'Guest One',
          phone: `+91001${Date.now().toString().slice(-7)}`,
          email: `${tag}-guest-1@test.local`,
          idProof: 'TEST-ID-1',
          address: 'Address 1',
        },
      }),
      prisma.guest.create({
        data: {
          propertyId: propertyA.id,
          name: 'Guest Two',
          phone: `+91002${Date.now().toString().slice(-7)}`,
          email: `${tag}-guest-2@test.local`,
          idProof: 'TEST-ID-2',
          address: 'Address 2',
        },
      }),
      prisma.guest.create({
        data: {
          propertyId: propertyA.id,
          name: 'Guest Three',
          phone: `+91003${Date.now().toString().slice(-7)}`,
          email: `${tag}-guest-3@test.local`,
          idProof: 'TEST-ID-3',
          address: 'Address 3',
        },
      }),
    ]);
    guestA1Id = guestA1.id;
    guestA2Id = guestA2.id;
    guestA3Id = guestA3.id;

    const channelConnection = await prisma.channelConnection.create({
      data: {
        propertyId: propertyA.id,
        provider: 'MOCK',
        name: `${tag}-mock-channel`,
        status: 'ACTIVE',
        externalHotelId: `${tag}-hotel`,
        credentials: { token: 'mock-token' },
      },
    });
    channelConnectionAId = channelConnection.id;

    await prisma.channelRoomMapping.create({
      data: {
        channelConnectionId: channelConnection.id,
        roomCategoryId: categoryA.id,
        externalRoomId: `${tag}-ext-room`,
        externalRoomName: 'External Standard',
      },
    });

    await prisma.channelRateMapping.create({
      data: {
        channelConnectionId: channelConnection.id,
        ratePlanId: ratePlanA.id,
        externalRoomId: `${tag}-ext-room`,
        externalRateId: `${tag}-ext-rate`,
        externalRateName: 'External Flex',
      },
    });

    const paymentReservationGroup = await prisma.reservationGroup.create({
      data: {
        propertyId: propertyA.id,
        primaryGuestId: guestA3.id,
        channelConnectionId: channelConnection.id,
        externalReservationId: `${tag}-payment-reservation`,
        externalStatus: 'booked',
        source: 'ZODOMUS',
        currency: 'INR',
        totalAmount: '3000.00',
        status: 'BOOKED',
        bookedAt: new Date('2026-06-01T00:00:00.000Z'),
        modifiedAt: new Date('2026-06-01T00:00:00.000Z'),
      },
    });

    const paymentReservationRoom = await prisma.reservationRoom.create({
      data: {
        reservationGroupId: paymentReservationGroup.id,
        propertyId: propertyA.id,
        externalRoomReservationId: `${tag}-payment-line`,
        externalRoomId: `${tag}-ext-room`,
        roomCategoryId: categoryA.id,
        ratePlanId: ratePlanA.id,
        arrivalDate: new Date('2026-06-10T00:00:00.000Z'),
        departureDate: new Date('2026-06-11T00:00:00.000Z'),
        totalAmount: '3000.00',
        currency: 'INR',
        status: 'BOOKED',
        guestName: guestA3.name,
      },
    });

    const billing = await prisma.billing.create({
      data: {
        reservationRoomId: paymentReservationRoom.id,
        amount: '3000.00',
        tax: '0.00',
        total: '3000.00',
        paymentStatus: 'PENDING',
      },
    });
    billingAId = billing.id;

    authUserEmail = `${tag}-auth-user@test.local`;
    authUserPassword = 'Auth@12345';

    const [adminA, adminB, authUser] = await prisma.$transaction([
      prisma.user.create({
        data: {
          propertyId: propertyA.id,
          name: 'Admin A',
          email: `${tag}-admin-a@test.local`,
          passwordHash,
          role: UserRole.ADMIN,
        },
      }),
      prisma.user.create({
        data: {
          propertyId: propertyB.id,
          name: 'Admin B',
          email: `${tag}-admin-b@test.local`,
          passwordHash,
          role: UserRole.ADMIN,
        },
      }),
      prisma.user.create({
        data: {
          propertyId: propertyA.id,
          name: 'Auth User',
          email: authUserEmail,
          passwordHash: await passwordService.hash(authUserPassword),
          role: UserRole.ADMIN,
        },
      }),
    ]);
    adminAId = adminA.id;
    adminBId = adminB.id;
    authUserId = authUser.id;

    adminAToken = await loginAndGetAccessToken(`${tag}-admin-a@test.local`, adminPassword);
    adminBToken = await loginAndGetAccessToken(`${tag}-admin-b@test.local`, adminPassword);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    if (!prisma) {
      await app?.close();
      return;
    }

    await prisma.idempotencyKey.deleteMany({
      where: {
        userId: { in: [adminAId, adminBId, authUserId].filter(Boolean) as string[] },
      },
    });
    await prisma.backgroundJob.deleteMany({
      where: {
        propertyId: { in: [propertyAId, propertyBId].filter(Boolean) as string[] },
      },
    });
    await prisma.webhookEvent.deleteMany({
      where: {
        propertyId: { in: [propertyAId, propertyBId].filter(Boolean) as string[] },
      },
    });
    await prisma.refreshSession.deleteMany({
      where: {
        userId: { in: [adminAId, adminBId, authUserId].filter(Boolean) as string[] },
      },
    });
    await prisma.passwordResetToken.deleteMany({
      where: {
        userId: { in: [adminAId, adminBId, authUserId].filter(Boolean) as string[] },
      },
    });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { propertyId: { in: [propertyAId, propertyBId].filter(Boolean) as string[] } },
          { userId: { in: [adminAId, adminBId, authUserId].filter(Boolean) as string[] } },
        ],
      },
    });
    await prisma.housekeepingTask.deleteMany({
      where: {
        propertyId: { in: [propertyAId, propertyBId].filter(Boolean) as string[] },
      },
    });
    await prisma.billingExtraCharge.deleteMany({
      where: {
        billing: {
          OR: [
            {
              reservationRoom: {
                propertyId: { in: [propertyAId, propertyBId].filter(Boolean) as string[] },
              },
            },
            {
              reservationRoom: {
                reservationGroup: {
                  channelConnectionId: channelConnectionAId,
                },
              },
            },
          ],
        },
      },
    });
    await prisma.paymentTransaction.deleteMany({
      where: {
        billing: {
          OR: [
            {
              reservationRoom: {
                propertyId: { in: [propertyAId, propertyBId].filter(Boolean) as string[] },
              },
            },
            {
              reservationRoom: {
                reservationGroup: {
                  channelConnectionId: channelConnectionAId,
                },
              },
            },
          ],
        },
      },
    });
    await prisma.billing.deleteMany({
      where: {
        OR: [
          {
            reservationRoom: {
              propertyId: { in: [propertyAId, propertyBId].filter(Boolean) as string[] },
            },
          },
          {
            reservationRoom: {
              reservationGroup: {
                channelConnectionId: channelConnectionAId,
              },
            },
          },
        ],
      },
    });
    await prisma.reservationRoom.deleteMany({
      where: {
        propertyId: { in: [propertyAId, propertyBId].filter(Boolean) as string[] },
      },
    });
    await prisma.reservationGroup.deleteMany({
      where: {
        propertyId: { in: [propertyAId, propertyBId].filter(Boolean) as string[] },
      },
    });
    await prisma.channelConnection.deleteMany({
      where: {
        propertyId: { in: [propertyAId, propertyBId].filter(Boolean) as string[] },
      },
    });
    await prisma.guest.deleteMany({
      where: {
        propertyId: { in: [propertyAId, propertyBId].filter(Boolean) as string[] },
      },
    });
    await prisma.room.deleteMany({
      where: {
        propertyId: { in: [propertyAId, propertyBId].filter(Boolean) as string[] },
      },
    });
    await prisma.ratePlan.deleteMany({
      where: {
        propertyId: { in: [propertyAId, propertyBId].filter(Boolean) as string[] },
      },
    });
    await prisma.roomCategory.deleteMany({
      where: {
        propertyId: { in: [propertyAId, propertyBId].filter(Boolean) as string[] },
      },
    });
    await prisma.user.deleteMany({
      where: {
        id: { in: [adminAId, adminBId, authUserId].filter(Boolean) as string[] },
      },
    });
    await prisma.property.deleteMany({
      where: {
        id: { in: [propertyAId, propertyBId].filter(Boolean) as string[] },
      },
    });

    await app.close();
  });

  it('limits property listings to the admin property', async () => {
    const response = await request(app.getHttpServer())
      .get('/properties')
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(propertyAId);
  });

  it('blocks admins from writing data into another property', async () => {
    await request(app.getHttpServer())
      .post('/room-categories')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        property_id: propertyBId,
        name: 'Forbidden Category',
        code: `${tag}-FORBIDDEN`,
        max_occupancy: 2,
      })
      .expect(403);
  });

  it('queues imported reservation notifications and processes them through the background worker', async () => {
    const summary = await zodomusReservationImportService.importFromSync({
      channelConnectionId: channelConnectionAId,
      propertyId: propertyAId,
      responsePayload: {
        reservations: [
          {
            reservations: {
              reservation: {
                id: `${tag}-ota-res-notify`,
                status: 1,
                currencyCode: 'INR',
                totalPrice: '300',
                bookedAt: '2026-06-12 00:00:00',
                modifiedAt: '2026-06-12 00:00:00',
                source: 'ZODOMUS',
              },
              customer: {
                firstName: 'Notify',
                lastName: 'Guest',
                phone: `+9177${Date.now().toString().slice(-8)}`,
                email: `${tag}-notify@test.local`,
              },
              rooms: [
                {
                  id: `${tag}-ext-room`,
                  roomReservationId: `${tag}-notify-line-1`,
                  guestName: 'Notify Guest',
                  arrivalDate: '2026-06-12',
                  departureDate: '2026-06-13',
                  totalPrice: '300',
                  prices: [{ rateId: `${tag}-ext-rate`, price: '300', date: '2026-06-12' }],
                },
              ],
            },
          },
        ],
      },
    });

    expect(summary.created).toBe(1);

    const importedGroup = await prisma.reservationGroup.findUniqueOrThrow({
      where: {
        channelConnectionId_externalReservationId: {
          channelConnectionId: channelConnectionAId,
          externalReservationId: `${tag}-ota-res-notify`,
        },
      },
    });

    await (backgroundJobService as any).queueImportedReservationNotifications(propertyAId, [importedGroup.id]);

    const queuedJobs = await prisma.backgroundJob.findMany({
      where: {
        propertyId: propertyAId,
        type: 'NOTIFICATION_SEND',
        dedupeKey: {
          in: [
            `notification:imported-reservation-confirmation:${importedGroup.id}`,
            `notification:imported-owner-reservation:${importedGroup.id}`,
          ],
        },
      },
      orderBy: { dedupeKey: 'asc' },
    });

    expect(queuedJobs).toHaveLength(2);
    expect(queuedJobs.every((job) => job.status === 'PENDING')).toBe(true);

    expect(await backgroundJobService.processDueJobs()).toBeGreaterThan(0);

    const processedJobs = await prisma.backgroundJob.findMany({
      where: {
        id: { in: queuedJobs.map((job) => job.id) },
      },
      orderBy: { dedupeKey: 'asc' },
    });

    expect(processedJobs).toHaveLength(2);
    expect(processedJobs.every((job) => job.status === 'SUCCEEDED')).toBe(true);
  });

  it('imports multi-room OTA reservations and exposes grouped reservation reads', async () => {
    await prisma.room.create({
      data: {
        propertyId: propertyAId,
        roomCategoryId: roomCategoryAId,
        roomNumber: `${tag}150`.slice(0, 20),
      },
    });

    const summary = await zodomusReservationImportService.importFromSync({
      channelConnectionId: channelConnectionAId,
      propertyId: propertyAId,
      responsePayload: {
        reservations: [
          {
            reservations: {
              reservation: {
                id: `${tag}-ota-res-1`,
                status: 1,
                currencyCode: 'EUR',
                totalPrice: '520',
                bookedAt: '2026-06-01 00:00:00',
                modifiedAt: '2026-06-01 00:00:00',
                source: 'ZODOMUS',
              },
              customer: {
                firstName: 'OTA',
                lastName: 'Guest',
                phone: `+9199${Date.now().toString().slice(-8)}`,
                email: `${tag}-ota@test.local`,
              },
              rooms: [
                {
                  id: `${tag}-ext-room`,
                  roomReservationId: `${tag}-rr-1`,
                  guestName: 'OTA Guest',
                  arrivalDate: '2026-07-01',
                  departureDate: '2026-07-02',
                  totalPrice: '260',
                  prices: [{ rateId: `${tag}-ext-rate`, price: '260', date: '2026-07-01' }],
                },
                {
                  id: `${tag}-ext-room`,
                  roomReservationId: `${tag}-rr-2`,
                  guestName: 'OTA Guest',
                  arrivalDate: '2026-07-01',
                  departureDate: '2026-07-02',
                  totalPrice: '260',
                  prices: [{ rateId: `${tag}-ext-rate`, price: '260', date: '2026-07-01' }],
                },
              ],
            },
          },
        ],
      },
    });

    expect(summary.discovered).toBe(1);
    expect(summary.created).toBe(1);
    expect(summary.imported_room_count).toBe(2);

    const response = await request(app.getHttpServer())
      .get('/bookings/groups')
      .set('Authorization', `Bearer ${adminAToken}`)
      .query({ search: `${tag}-ota-res-1` })
      .expect(200);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].external_reservation_id).toBe(`${tag}-ota-res-1`);
    expect(response.body.data[0].rooms).toHaveLength(2);
  });

  it('supports imported room-line reminder, check-in/out, housekeeping, and billing', async () => {
    const imported = await zodomusReservationImportService.importFromSync({
      channelConnectionId: channelConnectionAId,
      propertyId: propertyAId,
      responsePayload: {
        reservations: [
          {
            reservations: {
              reservation: {
                id: `${tag}-ota-res-ops`,
                status: 1,
                currencyCode: 'EUR',
                totalPrice: '300',
                bookedAt: '2026-06-05 00:00:00',
                modifiedAt: '2026-06-05 00:00:00',
                source: 'ZODOMUS',
              },
              customer: {
                firstName: 'Ops',
                lastName: 'Guest',
                phone: `+9188${Date.now().toString().slice(-8)}`,
                email: `${tag}-ops@test.local`,
              },
              rooms: [
                {
                  id: `${tag}-ext-room`,
                  roomReservationId: `${tag}-ops-line-1`,
                  guestName: 'Ops Guest',
                  arrivalDate: '2026-07-10',
                  departureDate: '2026-07-11',
                  totalPrice: '300',
                  prices: [{ rateId: `${tag}-ext-rate`, price: '300', date: '2026-07-10' }],
                },
              ],
            },
          },
        ],
      },
    });

    const reservationRoomId = summaryRoomId(imported);

    const reminder = await request(app.getHttpServer())
      .post(`/bookings/groups/rooms/${reservationRoomId}/checkin-reminder`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(201);

    expect(reminder.body.reminder_queued).toBe(true);

    const reminderJob = await prisma.backgroundJob.findFirstOrThrow({
      where: {
        propertyId: propertyAId,
        type: 'NOTIFICATION_SEND',
        dedupeKey: {
          contains: `reservation-room:${reservationRoomId}`,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(reminderJob.status).toBe('PENDING');

    await request(app.getHttpServer())
      .put(`/bookings/groups/rooms/${reservationRoomId}/checkin`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);

    let reservationRoom = await prisma.reservationRoom.findUniqueOrThrow({
      where: { id: reservationRoomId },
    });
    expect(reservationRoom.status).toBe('CHECKED_IN');
    expect(reservationRoom.roomId).toBe(roomAId);

    await request(app.getHttpServer())
      .put(`/bookings/groups/rooms/${reservationRoomId}/checkout`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);

    reservationRoom = await prisma.reservationRoom.findUniqueOrThrow({
      where: { id: reservationRoomId },
    });
    expect(reservationRoom.status).toBe('CHECKED_OUT');

    const billing = await prisma.billing.findUniqueOrThrow({
      where: { reservationRoomId },
    });
    expect(billing.total.toNumber()).toBeGreaterThan(0);
    expect(billing.paymentStatus).toBe('PENDING');

    const housekeepingTask = await prisma.housekeepingTask.findFirstOrThrow({
      where: { reservationRoomId },
      orderBy: { createdAt: 'desc' },
    });
    expect(housekeepingTask.roomId).toBe(roomAId);
    expect(housekeepingTask.status).toBe('DIRTY');

    await request(app.getHttpServer())
      .post('/billings')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        reservation_room_id: reservationRoomId,
        tax: '0.00',
      })
      .expect(409);
  });

  it('creates a provider reservation, imports it through bookings sync, and updates dashboard and billing state through checkout', async () => {
    jest.spyOn(ChannelProviderService.prototype, 'validateConnection').mockResolvedValue({
      provider: 'ZODOMUS',
      accepted: true,
    });

    const fixture = await createZodomusWorkflowFixture('provider-flow');
    const reservationId = `${tag}-provider-flow`;
    const roomReservationId = `${reservationId}-line-1`;
    const arrivalDate = serviceDateOffset(-1);
    const departureDate = serviceDateOffset(0);
    const totalAmount = '3450';

    jest.spyOn(ChannelProviderService.prototype, 'createTestReservation').mockResolvedValue({
      provider: 'ZODOMUS',
      reservation_id: reservationId,
      status: 'new',
      accepted: true,
    });
    jest.spyOn(ChannelProviderService.prototype, 'push').mockImplementation(async (payload) => {
      if (payload.provider === 'ZODOMUS' && payload.sync_type === 'BOOKINGS') {
        return buildProviderReservationSyncPayload({
          reservationId,
          roomReservationId,
          externalRoomId: fixture.externalRoomId,
          externalRateId: fixture.externalRateId,
          arrivalDate,
          departureDate,
          totalAmount,
          guestName: 'Provider Flow Guest',
        });
      }

      return {
        provider: payload.provider,
        accepted: true,
      };
    });

    const providerCreate = await request(app.getHttpServer())
      .post(`/channels/${fixture.connectionId}/provider-reservations-create-test`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        status: 'new',
        reservation_id: reservationId,
      })
      .expect(201);

    expect(providerCreate.body.accepted).toBe(true);
    expect(providerCreate.body.reservation_id).toBe(reservationId);

    const dashboardBeforeImport = await getDashboardSummary();

    const queuedSync = await request(app.getHttpServer())
      .post(`/channels/${fixture.connectionId}/sync`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        sync_type: 'BOOKINGS',
      })
      .expect(201);

    expect(await backgroundJobService.processDueJobs()).toBeGreaterThan(0);

    const processedSync = await prisma.channelSyncLog.findUniqueOrThrow({
      where: { id: queuedSync.body.id },
    });
    expect(processedSync.status).toBe('SUCCEEDED');
    expect(
      ((processedSync.responsePayload as { import_summary?: { created?: number } } | null)?.import_summary?.created ?? 0),
    ).toBe(1);

    const importedGroups = await request(app.getHttpServer())
      .get('/bookings/groups')
      .set('Authorization', `Bearer ${adminAToken}`)
      .query({ search: reservationId })
      .expect(200);

    expect(importedGroups.body.data).toHaveLength(1);
    expect(importedGroups.body.data[0].external_reservation_id).toBe(reservationId);
    expect(importedGroups.body.data[0].rooms).toHaveLength(1);

    const importedGroup = importedGroups.body.data[0] as {
      id: string;
      rooms: Array<{ id: string }>;
    };
    const importedRoomId = importedGroup.rooms[0].id;

    const dashboardAfterImport = await getDashboardSummary();
    expect(dashboardAfterImport.reservation_groups_today).toBe(dashboardBeforeImport.reservation_groups_today + 1);
    expect(dashboardAfterImport.active_reservation_groups).toBe(
      dashboardBeforeImport.active_reservation_groups + 1,
    );

    const checkIn = await request(app.getHttpServer())
      .put(`/bookings/groups/rooms/${importedRoomId}/checkin`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);

    expect(checkIn.body.room.id).toBe(fixture.roomId);

    const dashboardAfterCheckIn = await getDashboardSummary();
    expect(dashboardAfterCheckIn.occupied_rooms).toBe(dashboardAfterImport.occupied_rooms + 1);
    expect(dashboardAfterCheckIn.active_reservation_groups).toBe(
      dashboardAfterImport.active_reservation_groups,
    );

    await request(app.getHttpServer())
      .put(`/bookings/groups/rooms/${importedRoomId}/checkout`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);

    const dashboardAfterCheckout = await getDashboardSummary();
    expect(dashboardAfterCheckout.occupied_rooms).toBe(dashboardAfterImport.occupied_rooms);
    expect(dashboardAfterCheckout.active_reservation_groups).toBe(
      dashboardAfterImport.active_reservation_groups - 1,
    );
    expect(dashboardAfterCheckout.open_housekeeping_tasks).toBe(
      dashboardAfterCheckIn.open_housekeeping_tasks + 1,
    );

    const billing = await request(app.getHttpServer())
      .post('/billings')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        reservation_room_id: importedRoomId,
        tax: '0.00',
      })
      .expect(201);

    const dashboardAfterInvoice = await getDashboardSummary();
    expect(dashboardAfterInvoice.pending_balance_total).toBe(
      dashboardAfterCheckout.pending_balance_total + billing.body.total,
    );

    await request(app.getHttpServer())
      .post('/payments/collect')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        billing_id: billing.body.id,
        amount: billing.body.total.toFixed(2),
        provider: 'MOCK',
      })
      .expect(201);

    const paidBilling = await prisma.billing.findUniqueOrThrow({
      where: { id: billing.body.id },
    });
    expect(paidBilling.paymentStatus).toBe('PAID');

    const dashboardAfterPayment = await getDashboardSummary();
    expect(dashboardAfterPayment.pending_balance_total).toBe(dashboardAfterCheckout.pending_balance_total);
    expect(dashboardAfterPayment.revenue_today).toBe(dashboardAfterInvoice.revenue_today + billing.body.total);
  });

  it('filters reservation feed by reservation status', async () => {
    const checkedInFeed = await request(app.getHttpServer())
      .get('/bookings/feed')
      .set('Authorization', `Bearer ${adminAToken}`)
      .query({ status: 'CHECKED_IN' })
      .expect(200);

    expect(checkedInFeed.body.data.length).toBeGreaterThan(0);
    expect(
      checkedInFeed.body.data.every(
        (group: { import_blocked: boolean; reservation_status: string }) =>
          !group.import_blocked && group.reservation_status === 'CHECKED_IN',
      ),
    ).toBe(true);
  });

  it('surfaces blocked imports in the reservation feed and imports them after inventory is fixed', async () => {
    jest.spyOn(ChannelProviderService.prototype, 'validateConnection').mockResolvedValue({
      provider: 'ZODOMUS',
      accepted: true,
    });

    const fixture = await createZodomusWorkflowFixture('blocked-import');
    const reservationId = `${tag}-blocked-import`;
    const roomReservationId = `${reservationId}-line-1`;
    const arrivalDate = serviceDateOffset(4);
    const departureDate = serviceDateOffset(5);

    jest.spyOn(ChannelProviderService.prototype, 'push').mockImplementation(async (payload) => {
      if (payload.provider === 'ZODOMUS' && payload.sync_type === 'BOOKINGS') {
        return buildProviderReservationSyncPayload({
          reservationId,
          roomReservationId,
          externalRoomId: fixture.externalRoomId,
          externalRateId: fixture.externalRateId,
          arrivalDate,
          departureDate,
          totalAmount: '2800',
          guestName: 'Blocked Import Guest',
        });
      }

      return {
        provider: payload.provider,
        accepted: true,
      };
    });

    await request(app.getHttpServer())
      .post('/inventory/restrictions')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        property_id: propertyAId,
        room_category_id: fixture.roomCategoryId,
        from_date: arrivalDate,
        to_date: arrivalDate,
        stop_sell: true,
      })
      .expect(201);

    const firstSync = await request(app.getHttpServer())
      .post(`/channels/${fixture.connectionId}/sync`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        sync_type: 'BOOKINGS',
      })
      .expect(201);

    expect(await backgroundJobService.processDueJobs()).toBeGreaterThan(0);

    const blockedSyncLog = await prisma.channelSyncLog.findUniqueOrThrow({
      where: { id: firstSync.body.id },
    });
    expect(blockedSyncLog.status).toBe('SUCCEEDED');
    expect(
      ((blockedSyncLog.responsePayload as { import_summary?: { failed?: number } } | null)?.import_summary?.failed ?? 0),
    ).toBe(1);

    const blockedFeed = await request(app.getHttpServer())
      .get('/bookings/feed')
      .set('Authorization', `Bearer ${adminAToken}`)
      .query({ search: reservationId })
      .expect(200);

    expect(blockedFeed.body.data).toHaveLength(1);
    expect(blockedFeed.body.data[0].external_reservation_id).toBe(reservationId);
    expect(blockedFeed.body.data[0].import_blocked).toBe(true);
    expect(blockedFeed.body.data[0].import_error).toContain(`Stop-sell is active for ${arrivalDate}`);

    await request(app.getHttpServer())
      .post('/inventory/restrictions')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        property_id: propertyAId,
        room_category_id: fixture.roomCategoryId,
        from_date: arrivalDate,
        to_date: arrivalDate,
        stop_sell: false,
      })
      .expect(201);

    const secondSync = await request(app.getHttpServer())
      .post(`/channels/${fixture.connectionId}/sync`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        sync_type: 'BOOKINGS',
      })
      .expect(201);

    expect(await backgroundJobService.processDueJobs()).toBeGreaterThan(0);

    const recoveredSyncLog = await prisma.channelSyncLog.findUniqueOrThrow({
      where: { id: secondSync.body.id },
    });
    expect(
      ((recoveredSyncLog.responsePayload as { import_summary?: { created?: number; failed?: number } } | null)
        ?.import_summary?.created ?? 0),
    ).toBe(1);
    expect(
      ((recoveredSyncLog.responsePayload as { import_summary?: { created?: number; failed?: number } } | null)
        ?.import_summary?.failed ?? 0),
    ).toBe(0);

    const recoveredGroups = await request(app.getHttpServer())
      .get('/bookings/groups')
      .set('Authorization', `Bearer ${adminAToken}`)
      .query({ search: reservationId })
      .expect(200);

    expect(recoveredGroups.body.data).toHaveLength(1);
    expect(recoveredGroups.body.data[0].external_reservation_id).toBe(reservationId);
    expect(recoveredGroups.body.data[0].rooms).toHaveLength(1);

    const recoveredFeed = await request(app.getHttpServer())
      .get('/bookings/feed')
      .set('Authorization', `Bearer ${adminAToken}`)
      .query({ search: reservationId })
      .expect(200);

    expect(recoveredFeed.body.data).toHaveLength(1);
    expect(recoveredFeed.body.data[0].import_blocked).toBe(false);
    expect(recoveredFeed.body.data[0].import_error).toBeNull();
  });

  it('applies weekend, date-range, and occupancy pricing rules to reservation-room availability', async () => {
    await prisma.room.createMany({
      data: [
        {
          propertyId: propertyAId,
          roomCategoryId: roomCategoryAId,
          roomNumber: `${tag}201`.slice(0, 20),
        },
        {
          propertyId: propertyAId,
          roomCategoryId: roomCategoryAId,
          roomNumber: `${tag}202`.slice(0, 20),
        },
      ],
    });

    const pricingGroup = await prisma.reservationGroup.create({
      data: {
        propertyId: propertyAId,
        primaryGuestId: guestA1Id,
        channelConnectionId: channelConnectionAId,
        externalReservationId: `${tag}-pricing-res`,
        externalStatus: 'booked',
        source: 'ZODOMUS',
        currency: 'INR',
        totalAmount: '6000.00',
        status: 'BOOKED',
      },
    });

    await prisma.reservationRoom.createMany({
      data: [
        {
          reservationGroupId: pricingGroup.id,
          propertyId: propertyAId,
          externalRoomReservationId: `${tag}-pricing-line-1`,
          externalRoomId: `${tag}-ext-room`,
          roomCategoryId: roomCategoryAId,
          ratePlanId: ratePlanAId,
          arrivalDate: new Date('2026-06-13T00:00:00.000Z'),
          departureDate: new Date('2026-06-14T00:00:00.000Z'),
          totalAmount: '3000.00',
          currency: 'INR',
          status: 'BOOKED',
          guestName: 'Pricing Guest One',
        },
        {
          reservationGroupId: pricingGroup.id,
          propertyId: propertyAId,
          externalRoomReservationId: `${tag}-pricing-line-2`,
          externalRoomId: `${tag}-ext-room`,
          roomCategoryId: roomCategoryAId,
          ratePlanId: ratePlanAId,
          arrivalDate: new Date('2026-06-13T00:00:00.000Z'),
          departureDate: new Date('2026-06-14T00:00:00.000Z'),
          totalAmount: '3000.00',
          currency: 'INR',
          status: 'BOOKED',
          guestName: 'Pricing Guest Two',
        },
      ],
    });

    await request(app.getHttpServer())
      .post('/pricing-rules')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        property_id: propertyAId,
        rate_plan_id: ratePlanAId,
        name: 'Weekend surcharge',
        type: 'WEEKEND',
        adjustment_percent: '20.00',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/pricing-rules')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        property_id: propertyAId,
        rate_plan_id: ratePlanAId,
        name: 'Festival surcharge',
        type: 'DATE_RANGE',
        adjustment_percent: '40.00',
        start_date: '2026-06-13',
        end_date: '2026-06-13',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/pricing-rules')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        property_id: propertyAId,
        rate_plan_id: ratePlanAId,
        name: 'Occupancy surge',
        type: 'OCCUPANCY',
        adjustment_percent: '40.00',
        occupancy_threshold: 50,
      })
      .expect(201);

    const availability = await request(app.getHttpServer())
      .get('/availability')
      .set('Authorization', `Bearer ${adminAToken}`)
      .query({
        property_id: propertyAId,
        from: '2026-06-13',
        to: '2026-06-14',
      })
      .expect(200);

    expect(availability.body.categories[0].lowest_rate).toBe(6000);
  });

  it('counts imported room stays in occupancy-driven pricing and availability', async () => {
    const importedCategory = await prisma.roomCategory.create({
      data: {
        propertyId: propertyAId,
        name: `${tag}-Imported Occupancy`,
        code: `${tag}-IMP-OCC`,
        maxOccupancy: 2,
      },
    });
    const importedRatePlan = await prisma.ratePlan.create({
      data: {
        propertyId: propertyAId,
        roomCategoryId: importedCategory.id,
        name: `${tag}-Imported Occupancy Rate`,
        code: `${tag}-IMP-OCC-RATE`,
        baseRate: '3000.00',
        currency: 'INR',
        isActive: true,
      },
    });

    await prisma.room.createMany({
      data: [
        {
          propertyId: propertyAId,
          roomCategoryId: importedCategory.id,
          roomNumber: `${tag}203`.slice(0, 20),
        },
        {
          propertyId: propertyAId,
          roomCategoryId: importedCategory.id,
          roomNumber: `${tag}204`.slice(0, 20),
        },
      ],
    });

    const importedGuest = await prisma.guest.create({
      data: {
        propertyId: propertyAId,
        name: 'Imported Occupancy Guest',
        phone: `+9166${Date.now().toString().slice(-8)}`,
        email: `${tag}-imported-occ@test.local`,
        idProof: 'TEST-ID-IMPORT-OCC',
        address: 'Imported occupancy address',
      },
    });

    await request(app.getHttpServer())
      .post('/pricing-rules')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        property_id: propertyAId,
        rate_plan_id: importedRatePlan.id,
        name: 'Imported occupancy surge',
        type: 'OCCUPANCY',
        adjustment_percent: '50.00',
        occupancy_threshold: 50,
      })
      .expect(201);

    const importedGroup = await prisma.reservationGroup.create({
      data: {
        propertyId: propertyAId,
        primaryGuestId: importedGuest.id,
        channelConnectionId: channelConnectionAId,
        externalReservationId: `${tag}-ota-res-occupancy`,
        externalStatus: 'booked',
        source: 'ZODOMUS',
        currency: 'INR',
        totalAmount: '3000.00',
        status: 'BOOKED',
      },
    });
    await prisma.reservationRoom.create({
      data: {
        reservationGroupId: importedGroup.id,
        propertyId: propertyAId,
        externalRoomReservationId: `${tag}-occ-line-1`,
        externalRoomId: 'imported-occ-room',
        roomCategoryId: importedCategory.id,
        ratePlanId: importedRatePlan.id,
        arrivalDate: new Date('2026-07-20T00:00:00.000Z'),
        departureDate: new Date('2026-07-21T00:00:00.000Z'),
        totalAmount: '3000.00',
        currency: 'INR',
        status: 'BOOKED',
        guestName: importedGuest.name,
      },
    });

    const availability = await request(app.getHttpServer())
      .get('/availability')
      .set('Authorization', `Bearer ${adminAToken}`)
      .query({
        property_id: propertyAId,
        from: '2026-07-20',
        to: '2026-07-21',
      })
      .expect(200);

    const importedCategoryAvailability = availability.body.categories.find(
      (category: { room_category_id: string }) => category.room_category_id === importedCategory.id,
    );
    expect(importedCategoryAvailability).toBeDefined();
    expect(importedCategoryAvailability.available).toBeGreaterThanOrEqual(0);
    expect(importedCategoryAvailability.lowest_rate).toBe(4500);
  });

  it('enforces stop-sell and min/max-stay rules for direct reservations', async () => {
    await request(app.getHttpServer())
      .post('/inventory/restrictions')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        property_id: propertyAId,
        room_category_id: roomCategoryAId,
        from_date: '2026-08-10',
        to_date: '2026-08-10',
        stop_sell: true,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/reservations/direct')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        property_id: propertyAId,
        room_category_id: roomCategoryAId,
        rate_plan_id: ratePlanAId,
        check_in_date: '2026-08-10',
        check_out_date: '2026-08-11',
        guest_id: guestA1Id,
      })
      .expect(409);

    await request(app.getHttpServer())
      .post('/inventory/restrictions')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        property_id: propertyAId,
        room_category_id: roomCategoryAId,
        from_date: '2026-08-11',
        to_date: '2026-08-13',
        stop_sell: false,
        min_stay: 2,
        max_stay: 3,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/reservations/direct')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        property_id: propertyAId,
        room_category_id: roomCategoryAId,
        rate_plan_id: ratePlanAId,
        check_in_date: '2026-08-11',
        check_out_date: '2026-08-12',
        guest_id: guestA1Id,
      })
      .expect(409);

    await request(app.getHttpServer())
      .post('/reservations/direct')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        property_id: propertyAId,
        room_category_id: roomCategoryAId,
        rate_plan_id: ratePlanAId,
        check_in_date: '2026-08-11',
        check_out_date: '2026-08-15',
        guest_id: guestA1Id,
      })
      .expect(409);

    const success = await request(app.getHttpServer())
      .post('/reservations/direct')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        property_id: propertyAId,
        room_category_id: roomCategoryAId,
        rate_plan_id: ratePlanAId,
        check_in_date: '2026-08-11',
        check_out_date: '2026-08-13',
        guest_id: guestA1Id,
      })
      .expect(201);

    expect(success.body.source).toBe('DIRECT');
    expect(success.body.rooms).toHaveLength(1);
  });

  it('prevents double booking under concurrent direct reservation requests', async () => {
    const payload = {
      property_id: propertyAId,
      room_category_id: roomCategoryAId,
      rate_plan_id: ratePlanAId,
      check_in_date: '2026-10-10',
      check_out_date: '2026-10-11',
      room_count: 1,
    };

    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post('/reservations/direct')
        .set('Authorization', `Bearer ${adminAToken}`)
        .send({
          ...payload,
          guest_id: guestA1Id,
          remarks: 'Concurrency test first',
        }),
      request(app.getHttpServer())
        .post('/reservations/direct')
        .set('Authorization', `Bearer ${adminAToken}`)
        .send({
          ...payload,
          guest_id: guestA2Id,
          remarks: 'Concurrency test second',
        }),
    ]);

    const statuses = [first.status, second.status].sort((left, right) => left - right);
    expect(statuses).toEqual([201, 409]);

    const concurrencyGroups = await prisma.reservationGroup.findMany({
      where: {
        propertyId: propertyAId,
        remarks: {
          in: ['Concurrency test first', 'Concurrency test second'],
        },
      },
      select: {
        remarks: true,
      },
    });
    expect(concurrencyGroups).toHaveLength(1);
  });

  it('enforces stop-sell and min-stay rules for OTA reservation import', async () => {
    await request(app.getHttpServer())
      .post('/inventory/restrictions')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        property_id: propertyAId,
        room_category_id: roomCategoryAId,
        from_date: '2026-09-01',
        to_date: '2026-09-01',
        stop_sell: true,
      })
      .expect(201);

    const stopSellSummary = await zodomusReservationImportService.importFromSync({
      channelConnectionId: channelConnectionAId,
      propertyId: propertyAId,
      responsePayload: {
        reservations: [
          {
            reservations: {
              reservation: {
                id: `${tag}-ota-stop-sell`,
                status: 1,
                currencyCode: 'INR',
                totalPrice: '3000',
                bookedAt: '2026-08-01 00:00:00',
                modifiedAt: '2026-08-01 00:00:00',
                source: 'ZODOMUS',
              },
              customer: {
                firstName: 'Blocked',
                lastName: 'Guest',
                phone: `+9155${Date.now().toString().slice(-8)}`,
              },
              rooms: [
                {
                  id: `${tag}-ext-room`,
                  roomReservationId: `${tag}-ota-stop-sell-line`,
                  guestName: 'Blocked Guest',
                  arrivalDate: '2026-09-01',
                  departureDate: '2026-09-02',
                  totalPrice: '3000',
                  prices: [{ rateId: `${tag}-ext-rate`, price: '3000', date: '2026-09-01' }],
                },
              ],
            },
          },
        ],
      },
    });

    expect(stopSellSummary.failed).toBe(1);
    expect(stopSellSummary.created).toBe(0);

    await request(app.getHttpServer())
      .post('/inventory/restrictions')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        property_id: propertyAId,
        room_category_id: roomCategoryAId,
        from_date: '2026-09-10',
        to_date: '2026-09-12',
        stop_sell: false,
        min_stay: 2,
      })
      .expect(201);

    const minStaySummary = await zodomusReservationImportService.importFromSync({
      channelConnectionId: channelConnectionAId,
      propertyId: propertyAId,
      responsePayload: {
        reservations: [
          {
            reservations: {
              reservation: {
                id: `${tag}-ota-min-stay`,
                status: 1,
                currencyCode: 'INR',
                totalPrice: '3000',
                bookedAt: '2026-08-01 00:00:00',
                modifiedAt: '2026-08-01 00:00:00',
                source: 'ZODOMUS',
              },
              customer: {
                firstName: 'Short',
                lastName: 'Stay',
                phone: `+9144${Date.now().toString().slice(-8)}`,
              },
              rooms: [
                {
                  id: `${tag}-ext-room`,
                  roomReservationId: `${tag}-ota-min-stay-line`,
                  guestName: 'Short Stay',
                  arrivalDate: '2026-09-10',
                  departureDate: '2026-09-11',
                  totalPrice: '3000',
                  prices: [{ rateId: `${tag}-ext-rate`, price: '3000', date: '2026-09-10' }],
                },
              ],
            },
          },
        ],
      },
    });

    expect(minStaySummary.failed).toBe(1);
    expect(minStaySummary.created).toBe(0);
  });

  it('updates, disables, and deletes pricing rules through the admin API', async () => {
    const created = await request(app.getHttpServer())
      .post('/pricing-rules')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        property_id: propertyAId,
        rate_plan_id: ratePlanAId,
        name: 'Lifecycle rule',
        type: 'WEEKEND',
        adjustment_percent: '15.00',
      })
      .expect(201);

    const ruleId = created.body.id as string;

    const updated = await request(app.getHttpServer())
      .put(`/pricing-rules/${ruleId}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        name: 'Lifecycle festival rule',
        type: 'DATE_RANGE',
        adjustment_percent: '25.00',
        start_date: '2026-06-25',
        end_date: '2026-06-26',
      })
      .expect(200);

    expect(updated.body.name).toBe('Lifecycle festival rule');
    expect(updated.body.type).toBe('DATE_RANGE');
    expect(updated.body.adjustment_percent).toBe(25);
    expect(updated.body.start_date).toBe('2026-06-25');
    expect(updated.body.end_date).toBe('2026-06-26');

    const disabled = await request(app.getHttpServer())
      .put(`/pricing-rules/${ruleId}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        is_active: false,
      })
      .expect(200);

    expect(disabled.body.is_active).toBe(false);

    await request(app.getHttpServer())
      .delete(`/pricing-rules/${ruleId}`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);

    const deletedRule = await prisma.pricingRule.findUnique({
      where: { id: ruleId },
    });
    expect(deletedRule).toBeNull();
  });

  it('replays payment collection safely with the same idempotency key', async () => {
    const idempotencyKey = `${tag}-collect`;

    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post('/payments/collect')
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          billing_id: billingAId,
          amount: '1000.00',
          provider: 'MOCK',
        }),
      request(app.getHttpServer())
        .post('/payments/collect')
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          billing_id: billingAId,
          amount: '1000.00',
          provider: 'MOCK',
        }),
    ]);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.id).toBe(second.body.id);

    const payments = await prisma.paymentTransaction.findMany({
      where: { billingId: billingAId },
      orderBy: { createdAt: 'asc' },
    });
    expect(payments).toHaveLength(1);
    expect(payments[0].amount.toNumber()).toBe(1000);

    const billing = await prisma.billing.findUniqueOrThrow({ where: { id: billingAId } });
    expect(billing.paymentStatus).toBe('PARTIAL');
  });

  it('blocks cross-property payment collection access', async () => {
    await request(app.getHttpServer())
      .post('/payments/collect')
      .set('Authorization', `Bearer ${adminBToken}`)
      .send({
        billing_id: billingAId,
        amount: '500.00',
        provider: 'MOCK',
      })
      .expect(403);
  });

  it('replays refunds safely with the same idempotency key', async () => {
    const originalPayment = await prisma.paymentTransaction.findFirstOrThrow({
      where: { billingId: billingAId, status: 'SUCCEEDED' },
      orderBy: { createdAt: 'asc' },
    });
    const idempotencyKey = `${tag}-refund`;

    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post(`/payments/${originalPayment.id}/refund`)
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          amount: '1000.00',
          reason: 'Integration test refund',
        }),
      request(app.getHttpServer())
        .post(`/payments/${originalPayment.id}/refund`)
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          amount: '1000.00',
          reason: 'Integration test refund',
        }),
    ]);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.id).toBe(second.body.id);

    const refunds = await prisma.paymentTransaction.findMany({
      where: { billingId: billingAId, status: 'REFUNDED' },
      orderBy: { createdAt: 'asc' },
    });
    expect(refunds).toHaveLength(1);
    expect(refunds[0].amount.toNumber()).toBe(1000);

    const billing = await prisma.billing.findUniqueOrThrow({ where: { id: billingAId } });
    expect(billing.paymentStatus).toBe('REFUNDED');
  });

  it('blocks cross-property channel sync access', async () => {
    await request(app.getHttpServer())
      .post(`/channels/${channelConnectionAId}/sync`)
      .set('Authorization', `Bearer ${adminBToken}`)
      .send({
        sync_type: 'INVENTORY',
        from: '2026-06-01',
        to: '2026-06-02',
      })
      .expect(403);
  });

  it('replays channel sync safely with the same idempotency key', async () => {
    const idempotencyKey = `${tag}-channel-sync`;

    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post(`/channels/${channelConnectionAId}/sync`)
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          sync_type: 'INVENTORY',
          from: '2026-06-01',
          to: '2026-06-02',
        }),
      request(app.getHttpServer())
        .post(`/channels/${channelConnectionAId}/sync`)
        .set('Authorization', `Bearer ${adminAToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          sync_type: 'INVENTORY',
          from: '2026-06-01',
          to: '2026-06-02',
        }),
    ]);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.id).toBe(second.body.id);
    expect(first.body.status).toBe('QUEUED');
    expect(second.body.status).toBe('QUEUED');

    const jobsBeforeProcessing = await request(app.getHttpServer())
      .get('/background-jobs')
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);

    expect(
      jobsBeforeProcessing.body.data.some(
        (job: { entity_id: string; status: string }) => job.entity_id === first.body.id && job.status === 'PENDING',
      ),
    ).toBe(true);

    expect(await backgroundJobService.processDueJobs()).toBeGreaterThan(0);

    const syncLogs = await prisma.channelSyncLog.findMany({
      where: { channelConnectionId: channelConnectionAId },
      orderBy: { createdAt: 'asc' },
    });
    expect(syncLogs).toHaveLength(1);
    expect(syncLogs[0].status).toBe('SUCCEEDED');
  });

  it('saves room and rate mappings together in one batch request', async () => {
    const roomCategory = await prisma.roomCategory.create({
      data: {
        propertyId: propertyAId,
        name: `${tag}-Batch-Category`,
        code: `${tag}-BATCH-CAT`,
        maxOccupancy: 2,
      },
    });

    const ratePlan = await prisma.ratePlan.create({
      data: {
        propertyId: propertyAId,
        roomCategoryId: roomCategory.id,
        name: `${tag}-Batch-Rate`,
        code: `${tag}-BATCH-RATE`,
        baseRate: '3200.00',
        currency: 'INR',
        isActive: true,
      },
    });

    const response = await request(app.getHttpServer())
      .post(`/channels/${channelConnectionAId}/mappings/batch`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        room_mappings: [
          {
            room_category_id: roomCategory.id,
            external_room_id: `${tag}-batch-room`,
            external_room_name: 'Batch Room',
          },
        ],
        rate_mappings: [
          {
            rate_plan_id: ratePlan.id,
            external_rate_id: `${tag}-batch-rate-id`,
            external_rate_name: 'Batch Rate Name',
          },
        ],
      })
      .expect(201);

    expect(response.body.room_mappings).toHaveLength(1);
    expect(response.body.rate_mappings).toHaveLength(1);
    expect(response.body.room_mappings[0].room_category_id).toBe(roomCategory.id);
    expect(response.body.rate_mappings[0].rate_plan_id).toBe(ratePlan.id);
    expect(response.body.rate_mappings[0].external_room_id).toBe(`${tag}-batch-room`);
    expect(response.body.rate_mappings[0].external_rate_id).toBe(`${tag}-batch-rate-id`);

    const persistedRoomMapping = await prisma.channelRoomMapping.findUniqueOrThrow({
      where: {
        channelConnectionId_roomCategoryId: {
          channelConnectionId: channelConnectionAId,
          roomCategoryId: roomCategory.id,
        },
      },
    });

    const persistedRateMapping = await prisma.channelRateMapping.findUniqueOrThrow({
      where: {
        channelConnectionId_ratePlanId: {
          channelConnectionId: channelConnectionAId,
          ratePlanId: ratePlan.id,
        },
      },
    });

    expect(persistedRoomMapping.externalRoomId).toBe(`${tag}-batch-room`);
    expect(persistedRateMapping.externalRoomId).toBe(`${tag}-batch-room`);
    expect(persistedRateMapping.externalRateId).toBe(`${tag}-batch-rate-id`);
  });

  it('builds daily inventory rows for channel sync payloads', async () => {
    const response = await request(app.getHttpServer())
      .post(`/channels/${channelConnectionAId}/sync`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        sync_type: 'INVENTORY',
        from: '2026-06-01',
        to: '2026-06-03',
      })
      .expect(201);

    const syncLog = await prisma.channelSyncLog.findUniqueOrThrow({
      where: { id: response.body.id },
    });

    const payload = syncLog.requestPayload as {
      inventory: Array<{
        date: string;
        external_room_id: string;
      }>;
    };

    expect(payload.inventory).toHaveLength(3);
    expect(payload.inventory.map((row) => row.date)).toEqual(['2026-06-01', '2026-06-02', '2026-06-03']);
    expect(new Set(payload.inventory.map((row) => row.external_room_id))).toEqual(new Set([`${tag}-ext-room`]));
  });

  it('reconciles current HMS inventory against the latest successful sync snapshot', async () => {
    const queuedSync = await request(app.getHttpServer())
      .post(`/channels/${channelConnectionAId}/sync`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        sync_type: 'INVENTORY',
        from: '2026-06-10',
        to: '2026-06-12',
      })
      .expect(201);

    expect(queuedSync.body.status).toBe('QUEUED');
    expect(await backgroundJobService.processDueJobs()).toBeGreaterThan(0);

    const inSync = await request(app.getHttpServer())
      .get(`/channels/${channelConnectionAId}/inventory-reconciliation`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);

    expect(inSync.body.status).toBe('IN_SYNC');
    expect(inSync.body.compared_window).toEqual({
      from: '2026-06-10',
      to: '2026-06-12',
    });
    expect(inSync.body.summary.drifted_rows).toBe(0);
    expect(inSync.body.summary.snapshot_only_rows).toBe(0);
    expect(inSync.body.summary.current_only_rows).toBe(0);
    expect(inSync.body.drift_rows).toHaveLength(0);

    await prisma.room.update({
      where: { id: roomAId },
      data: { status: 'MAINTENANCE' },
    });

    const drifted = await request(app.getHttpServer())
      .get(`/channels/${channelConnectionAId}/inventory-reconciliation`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);

    expect(drifted.body.status).toBe('DRIFT_DETECTED');
    expect(drifted.body.summary.drifted_rows).toBe(3);
    expect(drifted.body.summary.total_available_delta).toBe(-3);
    expect(drifted.body.drift_rows).toHaveLength(3);
    expect(drifted.body.drift_rows[0].status).toBe('DRIFTED');
    expect(drifted.body.drift_rows[0].last_pushed.available - drifted.body.drift_rows[0].current_expected.available).toBe(1);
  });

  it('retries only failed inventory rows from a partial sync log', async () => {
    const partialLog = await prisma.channelSyncLog.create({
      data: {
        channelConnectionId: channelConnectionAId,
        syncType: 'INVENTORY',
        status: 'PARTIAL_FAILED',
        requestPayload: {
          from: '2026-06-20',
          to: '2026-06-21',
          inventory: [
            {
              date: '2026-06-20',
              external_room_id: `${tag}-ext-room`,
              room_category_id: roomCategoryAId,
              room_category_code: `${tag}-STD`,
              total_inventory: 1,
              out_of_service: 0,
              booked: 0,
              available: 1,
            },
            {
              date: '2026-06-21',
              external_room_id: `${tag}-ext-room`,
              room_category_id: roomCategoryAId,
              room_category_code: `${tag}-STD`,
              total_inventory: 1,
              out_of_service: 0,
              booked: 0,
              available: 1,
            },
          ],
        },
        responsePayload: {
          summary: {
            total_rows: 2,
            succeeded_rows: 1,
            failed_rows: 1,
          },
          row_results: [
            {
              date: '2026-06-20',
              external_room_id: `${tag}-ext-room`,
              available: 1,
              status: 'SUCCEEDED',
            },
            {
              date: '2026-06-21',
              external_room_id: `${tag}-ext-room`,
              available: 1,
              status: 'FAILED',
              error_message: 'timeout',
            },
          ],
        },
        errorMessage: '1 inventory row failed while 1 succeeded.',
      },
    });

    const response = await request(app.getHttpServer())
      .post(`/channels/${channelConnectionAId}/sync-logs/${partialLog.id}/retry-failed-rows`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(201);

    expect(response.body.status).toBe('QUEUED');

    const queuedLog = await prisma.channelSyncLog.findUniqueOrThrow({
      where: { id: response.body.id },
    });
    const payload = queuedLog.requestPayload as {
      from: string;
      to: string;
      inventory: Array<{ date: string; external_room_id: string }>;
      retry_of_sync_log_id: string;
      trigger: string;
    };

    expect(payload.from).toBe('2026-06-21');
    expect(payload.to).toBe('2026-06-21');
    expect(payload.trigger).toBe('retry_failed_rows');
    expect(payload.retry_of_sync_log_id).toBe(partialLog.id);
    expect(payload.inventory).toEqual([
      expect.objectContaining({
        date: '2026-06-21',
        external_room_id: `${tag}-ext-room`,
      }),
    ]);
  });

  it('lists persisted inventory row failures for a channel connection', async () => {
    const syncLog = await prisma.channelSyncLog.create({
      data: {
        channelConnectionId: channelConnectionAId,
        syncType: 'INVENTORY',
        status: 'PARTIAL_FAILED',
      },
    });

    await prisma.inventorySyncRow.createMany({
      data: [
        {
          channelSyncLogId: syncLog.id,
          channelConnectionId: channelConnectionAId,
          syncDate: new Date('2026-06-25T00:00:00.000Z'),
          externalRoomId: `${tag}-ext-room`,
          available: 1,
          status: 'FAILED',
          errorMessage: 'timeout',
        },
        {
          channelSyncLogId: syncLog.id,
          channelConnectionId: channelConnectionAId,
          syncDate: new Date('2026-06-26T00:00:00.000Z'),
          externalRoomId: `${tag}-ext-room`,
          available: 2,
          status: 'SUCCEEDED',
        },
      ],
    });

    const response = await request(app.getHttpServer())
      .get(`/channels/${channelConnectionAId}/inventory-row-results`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);

    expect(response.body.summary.total_rows).toBeGreaterThanOrEqual(2);
    expect(response.body.summary.failed_rows).toBeGreaterThanOrEqual(1);
    expect(response.body.recent_failed_rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          external_room_id: `${tag}-ext-room`,
          sync_date: '2026-06-25',
          error_message: 'timeout',
        }),
      ]),
    );
    expect(response.body.grouped_failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          external_room_id: `${tag}-ext-room`,
        }),
      ]),
    );
  });

  it('rotates refresh tokens and rejects reuse of the old refresh token', async () => {
    const login = await loginAndGetSession(authUserEmail, authUserPassword);

    const refresh = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refresh_token: login.refresh_token })
      .expect(201);

    expect(refresh.body.access_token).toBeTruthy();
    expect(refresh.body.refresh_token).toBeTruthy();
    expect(refresh.body.refresh_token).not.toBe(login.refresh_token);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refresh_token: login.refresh_token })
      .expect(401);
  });

  it('revokes only the targeted session on logout with refresh token', async () => {
    const sessionA = await loginAndGetSession(authUserEmail, authUserPassword);
    const sessionB = await loginAndGetSession(authUserEmail, authUserPassword);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${sessionA.access_token}`)
      .send({ refresh_token: sessionA.refresh_token })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refresh_token: sessionA.refresh_token })
      .expect(401);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refresh_token: sessionB.refresh_token })
      .expect(201);
  });

  it('revokes all active sessions on logout without refresh token', async () => {
    const sessionA = await loginAndGetSession(authUserEmail, authUserPassword);
    const sessionB = await loginAndGetSession(authUserEmail, authUserPassword);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${sessionA.access_token}`)
      .send({})
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refresh_token: sessionA.refresh_token })
      .expect(401);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refresh_token: sessionB.refresh_token })
      .expect(401);
  });

  it('resets the password and revokes all existing sessions', async () => {
    const oldPassword = authUserPassword;
    const newPassword = 'Auth@54321';
    const sessionA = await loginAndGetSession(authUserEmail, oldPassword);
    const sessionB = await loginAndGetSession(authUserEmail, oldPassword);

    const resetRequest = await request(app.getHttpServer())
      .post('/auth/password-reset/request')
      .send({ email: authUserEmail })
      .expect(201);

    expect(resetRequest.body.reset_requested).toBe(true);
    expect(resetRequest.body.reset_token).toBeTruthy();

    await request(app.getHttpServer())
      .post('/auth/password-reset/confirm')
      .send({
        token: resetRequest.body.reset_token,
        password: newPassword,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refresh_token: sessionA.refresh_token })
      .expect(401);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refresh_token: sessionB.refresh_token })
      .expect(401);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: authUserEmail, password: oldPassword })
      .expect(401);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: authUserEmail, password: newPassword })
      .expect(201);

    authUserPassword = newPassword;
  });

  it('accepts a signed payment webhook and replays it safely', async () => {
    const payload = {
      event_id: `${tag}-payment-event`,
      event_type: 'payment.captured',
      property_id: propertyAId,
      amount: 1000,
      currency: 'INR',
    };
    const signature = signWebhook(paymentWebhookSecret, payload);

    const first = await request(app.getHttpServer())
      .post('/webhooks/payment/mockpay')
      .set('x-webhook-signature', signature)
      .set('x-event-id', payload.event_id)
      .set('x-event-type', payload.event_type)
      .send(payload)
      .expect(201);

    const second = await request(app.getHttpServer())
      .post('/webhooks/payment/mockpay')
      .set('x-webhook-signature', signature)
      .set('x-event-id', payload.event_id)
      .set('x-event-type', payload.event_type)
      .send(payload)
      .expect(200);

    expect(first.body.id).toBe(second.body.id);
    expect(first.body.status).toBe('RECEIVED');
    expect(first.body.duplicate).toBe(false);
    expect(second.body.duplicate).toBe(true);

    const jobsBeforeProcessing = await request(app.getHttpServer())
      .get('/background-jobs')
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);

    expect(jobsBeforeProcessing.body.data.some((job: { entity_id: string; status: string }) => job.entity_id === first.body.id && job.status === 'PENDING')).toBe(true);

    expect(await backgroundJobService.processDueJobs()).toBeGreaterThan(0);

    const processedEvent = await prisma.webhookEvent.findUniqueOrThrow({
      where: { id: first.body.id },
    });
    expect(processedEvent.status).toBe('PROCESSED');

    const webhookEvents = await prisma.webhookEvent.findMany({
      where: { dedupeKey: `PAYMENT:mockpay:${payload.event_id}` },
    });
    expect(webhookEvents).toHaveLength(1);
    expect(webhookEvents[0].status).toBe('PROCESSED');
  });

  it('rejects a webhook with an invalid signature', async () => {
    await request(app.getHttpServer())
      .post('/webhooks/payment/mockpay')
      .set('x-webhook-signature', 'invalid-signature')
      .send({
        event_id: `${tag}-invalid-webhook`,
        event_type: 'payment.failed',
        property_id: propertyAId,
      })
      .expect(401);
  });

  it('lists webhook events scoped to the admin property', async () => {
    const adminAEvents = await request(app.getHttpServer())
      .get('/webhook-events')
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);

    expect(adminAEvents.body.data.length).toBeGreaterThan(0);
    expect(adminAEvents.body.data.every((event: { property_id: string | null }) => event.property_id === propertyAId)).toBe(
      true,
    );

    const adminBEvents = await request(app.getHttpServer())
      .get('/webhook-events')
      .set('Authorization', `Bearer ${adminBToken}`)
      .expect(200);

    expect(adminBEvents.body.data).toHaveLength(0);
  });

  it('dead-letters a failing webhook processing job and allows retry', async () => {
    const missingWebhookId = '11111111-1111-4111-8111-111111111111';
    const job = await prisma.backgroundJob.create({
      data: {
        type: 'WEBHOOK_PROCESS',
        propertyId: propertyAId,
        entityType: 'webhook_event',
        entityId: missingWebhookId,
        payload: {
          webhook_event_id: missingWebhookId,
        },
        maxAttempts: 1,
      },
    });

    expect(await backgroundJobService.processDueJobs()).toBeGreaterThan(0);

    const deadLetter = await prisma.backgroundJob.findUniqueOrThrow({
      where: { id: job.id },
    });
    expect(deadLetter.status).toBe('DEAD_LETTER');
    expect(deadLetter.lastError).toContain('Webhook event not found');

    await request(app.getHttpServer())
      .post(`/background-jobs/${job.id}/retry`)
      .set('Authorization', `Bearer ${adminBToken}`)
      .expect(403);

    const retried = await request(app.getHttpServer())
      .post(`/background-jobs/${job.id}/retry`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(201);

    expect(retried.body.status).toBe('PENDING');

    const propertyAJobs = await request(app.getHttpServer())
      .get('/background-jobs')
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);

    expect(propertyAJobs.body.data.some((entry: { id: string }) => entry.id === job.id)).toBe(true);

    const propertyBJobs = await request(app.getHttpServer())
      .get('/background-jobs')
      .set('Authorization', `Bearer ${adminBToken}`)
      .expect(200);

    expect(propertyBJobs.body.data.some((entry: { id: string }) => entry.id === job.id)).toBe(false);
  });

  it('exposes Prometheus-style metrics output', async () => {
    const response = await request(app.getHttpServer()).get('/metrics').expect(200);

    expect(response.text).toContain('hms_payment_collect_total');
    expect(response.text).toContain('hms_background_jobs_current');
    expect(response.text).toContain('hms_notification_send_total');
    expect(response.text).toContain('hms_webhook_ingested_total');
  });

  it('exposes metrics summary for dashboards', async () => {
    const response = await request(app.getHttpServer()).get('/metrics/summary').expect(200);

    expect(response.body.counters).toEqual(expect.any(Array));
    expect(response.body.histograms).toEqual(expect.any(Array));
    expect(response.body.current.background_jobs).toEqual(expect.any(Array));
    expect(response.body.current.webhook_events).toEqual(expect.any(Array));
    expect(response.body.current.channel_sync_logs).toEqual(expect.any(Array));
  });

  async function loginAndGetAccessToken(email: string, password: string) {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(201);

    return response.body.access_token as string;
  }

  async function loginAndGetSession(email: string, password: string) {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(201);

    return {
      access_token: response.body.access_token as string,
      refresh_token: response.body.refresh_token as string,
    };
  }

  function signWebhook(secret: string, payload: Record<string, unknown>) {
    return createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
  }

  function summaryRoomId(summary: Record<string, unknown>) {
    const ids = summary.imported_reservation_room_ids as string[] | undefined;
    expect(ids?.length).toBeGreaterThan(0);
    return ids![0];
  }

  async function getDashboardSummary() {
    const response = await request(app.getHttpServer())
      .get('/dashboard/summary')
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);

    return response.body as {
      reservation_groups_today: number;
      active_reservation_groups: number;
      occupied_rooms: number;
      open_housekeeping_tasks: number;
      pending_balance_total: number;
      revenue_today: number;
    };
  }

  async function createZodomusWorkflowFixture(label: string) {
    const suffix = label.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
    const roomCategory = await prisma.roomCategory.create({
      data: {
        propertyId: propertyAId,
        name: `${tag}-${label}-Category`,
        code: `${tag}-${suffix}-CAT`.slice(0, 40),
        maxOccupancy: 2,
      },
    });
    const ratePlan = await prisma.ratePlan.create({
      data: {
        propertyId: propertyAId,
        roomCategoryId: roomCategory.id,
        name: `${tag}-${label}-Rate`,
        code: `${tag}-${suffix}-RATE`.slice(0, 40),
        baseRate: '2800.00',
        currency: 'INR',
        isActive: true,
      },
    });
    const room = await prisma.room.create({
      data: {
        propertyId: propertyAId,
        roomCategoryId: roomCategory.id,
        roomNumber: `${tag}${suffix}`.slice(0, 20),
      },
    });

    const externalRoomId = `${tag}-${label}-ext-room`;
    const externalRateId = `${tag}-${label}-ext-rate`;

    const connection = await request(app.getHttpServer())
      .post('/channels')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        property_id: propertyAId,
        provider: 'ZODOMUS',
        name: `${tag}-${label}-connection`,
        status: 'ACTIVE',
        external_hotel_id: `${tag}-${label}-hotel`,
        credentials: {
          ota_key: 'BOOKING_COM',
        },
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/channels/${connection.body.id}/room-mappings`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        room_category_id: roomCategory.id,
        external_room_id: externalRoomId,
        external_room_name: `${label} External Room`,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/channels/${connection.body.id}/rate-mappings`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        rate_plan_id: ratePlan.id,
        external_rate_id: externalRateId,
        external_rate_name: `${label} External Rate`,
      })
      .expect(201);

    return {
      connectionId: connection.body.id as string,
      roomCategoryId: roomCategory.id,
      ratePlanId: ratePlan.id,
      roomId: room.id,
      externalRoomId,
      externalRateId,
    };
  }

  function buildProviderReservationSyncPayload(input: {
    reservationId: string;
    roomReservationId: string;
    externalRoomId: string;
    externalRateId: string;
    arrivalDate: string;
    departureDate: string;
    totalAmount: string;
    guestName: string;
  }) {
    return {
      reservation_queue: {
        status: {
          returnCode: '200',
          returnMessage: 'OK',
        },
      },
      reservations: [
        {
          reservations: {
            reservation: {
              id: input.reservationId,
              status: 1,
              currencyCode: 'INR',
              totalPrice: input.totalAmount,
              bookedAt: providerTimestamp(input.arrivalDate),
              modifiedAt: providerTimestamp(input.departureDate),
              source: 'ZODOMUS',
            },
            customer: {
              firstName: input.guestName.split(' ')[0],
              lastName: input.guestName.split(' ').slice(1).join(' ') || 'Guest',
              phone: `+9177${Date.now().toString().slice(-8)}`,
              email: `${input.reservationId}@test.local`,
            },
            rooms: [
              {
                id: input.externalRoomId,
                roomReservationId: input.roomReservationId,
                guestName: input.guestName,
                arrivalDate: input.arrivalDate,
                departureDate: input.departureDate,
                totalPrice: input.totalAmount,
                prices: [
                  {
                    rateId: input.externalRateId,
                    price: input.totalAmount,
                    date: input.arrivalDate,
                  },
                ],
              },
            ],
          },
        },
      ],
    };
  }

  function serviceDateOffset(days: number) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(Date.now() + days * 24 * 60 * 60 * 1000));
  }

  function providerTimestamp(dateOnly: string) {
    return `${dateOnly} 00:00:00`;
  }
});
