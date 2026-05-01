import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, UserRole } from '@prisma/client';
import { createHmac } from 'node:crypto';
import * as request from 'supertest';
import { AppModule } from '../app.module';
import { BackgroundJobService } from '../modules/background-job/background-job.service';
import { PasswordService } from '../modules/auth/password.service';
import { PrismaService } from '../prisma/prisma.service';

describe('App integration', () => {
  const tag = `it${Date.now().toString().slice(-8)}`;
  const adminPassword = 'Admin@12345';

  let app: INestApplication;
  let prisma: PrismaService;
  let passwordService: PasswordService;
  let backgroundJobService: BackgroundJobService;

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
  let paymentBookingId: string;
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

    const paymentBooking = await prisma.booking.create({
      data: {
        propertyId: propertyA.id,
        guestId: guestA3.id,
        roomCategoryId: categoryA.id,
        ratePlanId: ratePlanA.id,
        checkInDate: new Date('2026-06-10T00:00:00.000Z'),
        checkOutDate: new Date('2026-06-11T00:00:00.000Z'),
        totalAmount: '3000.00',
        status: 'BOOKED',
      },
    });
    paymentBookingId = paymentBooking.id;

    const billing = await prisma.billing.create({
      data: {
        bookingId: paymentBooking.id,
        amount: '3000.00',
        tax: '0.00',
        total: '3000.00',
        paymentStatus: 'PENDING',
      },
    });
    billingAId = billing.id;

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
        externalRateId: `${tag}-ext-rate`,
        externalRateName: 'External Flex',
      },
    });

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

  afterAll(async () => {
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
    await prisma.channelSyncLog.deleteMany({
      where: {
        channelConnectionId: channelConnectionAId,
      },
    });
    await prisma.channelRateMapping.deleteMany({
      where: {
        channelConnectionId: channelConnectionAId,
      },
    });
    await prisma.channelRoomMapping.deleteMany({
      where: {
        channelConnectionId: channelConnectionAId,
      },
    });
    await prisma.channelConnection.deleteMany({
      where: {
        id: channelConnectionAId,
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
    await prisma.billingExtraCharge.deleteMany({
      where: {
        billing: {
          booking: {
            propertyId: { in: [propertyAId, propertyBId].filter(Boolean) as string[] },
          },
        },
      },
    });
    await prisma.paymentTransaction.deleteMany({
      where: {
        billing: {
          booking: {
            propertyId: { in: [propertyAId, propertyBId].filter(Boolean) as string[] },
          },
        },
      },
    });
    await prisma.billing.deleteMany({
      where: {
        booking: {
          propertyId: { in: [propertyAId, propertyBId].filter(Boolean) as string[] },
        },
      },
    });
    await prisma.booking.deleteMany({
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

  it('prevents overselling the last available slot under concurrent booking requests', async () => {
    const payloadBase = {
      property_id: propertyAId,
      room_category_id: roomCategoryAId,
      rate_plan_id: ratePlanAId,
      check_in_date: '2026-06-01',
      check_out_date: '2026-06-02',
    };

    const [resultA, resultB] = await Promise.all([
      request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${adminAToken}`)
        .send({ ...payloadBase, guest_id: guestA1Id }),
      request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${adminAToken}`)
        .send({ ...payloadBase, guest_id: guestA2Id }),
    ]);

    const statuses = [resultA.status, resultB.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);

    const bookingCount = await prisma.booking.count({
      where: {
        propertyId: propertyAId,
        roomCategoryId: roomCategoryAId,
        checkInDate: new Date('2026-06-01T00:00:00.000Z'),
        checkOutDate: new Date('2026-06-02T00:00:00.000Z'),
      },
    });

    expect(bookingCount).toBe(1);
  });

  it('queues booking notifications and processes them through the background worker', async () => {
    const createBooking = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        property_id: propertyAId,
        guest_id: guestA3Id,
        room_category_id: roomCategoryAId,
        rate_plan_id: ratePlanAId,
        check_in_date: '2026-06-12',
        check_out_date: '2026-06-13',
      })
      .expect(201);

    const bookingId = createBooking.body.id as string;

    const queuedJobs = await prisma.backgroundJob.findMany({
      where: {
        propertyId: propertyAId,
        type: 'NOTIFICATION_SEND',
        dedupeKey: {
          in: [
            `notification:booking-confirmation:${bookingId}`,
            `notification:owner-booking-notification:${bookingId}`,
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

  it('completes check-in, check-out, and invoice generation for a booking workflow', async () => {
    const createBooking = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        property_id: propertyAId,
        guest_id: guestA3Id,
        room_category_id: roomCategoryAId,
        rate_plan_id: ratePlanAId,
        check_in_date: '2026-06-20',
        check_out_date: '2026-06-21',
      })
      .expect(201);

    const bookingId = createBooking.body.id as string;

    await request(app.getHttpServer())
      .put(`/bookings/${bookingId}/checkin`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);

    let booking = await prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
    });
    expect(booking.status).toBe('CHECKED_IN');
    expect(booking.roomId).toBe(roomAId);

    let room = await prisma.room.findUniqueOrThrow({
      where: { id: roomAId },
    });
    expect(room.status).toBe('OCCUPIED');

    await request(app.getHttpServer())
      .put(`/bookings/${bookingId}/checkout`)
      .set('Authorization', `Bearer ${adminAToken}`)
      .expect(200);

    booking = await prisma.booking.findUniqueOrThrow({
      where: { id: bookingId },
    });
    expect(booking.status).toBe('CHECKED_OUT');

    room = await prisma.room.findUniqueOrThrow({
      where: { id: roomAId },
    });
    expect(room.status).toBe('AVAILABLE');

    const billing = await prisma.billing.findUniqueOrThrow({
      where: { bookingId: bookingId },
    });
    expect(billing.total.toNumber()).toBe(3000);
    expect(billing.paymentStatus).toBe('PENDING');

    await request(app.getHttpServer())
      .post('/billings')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        booking_id: bookingId,
        tax: '0.00',
      })
      .expect(409);
  });

  it('applies weekend, date-range, and occupancy pricing rules to bookings and availability', async () => {
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

    await prisma.booking.createMany({
      data: [
        {
          propertyId: propertyAId,
          guestId: guestA1Id,
          roomCategoryId: roomCategoryAId,
          ratePlanId: ratePlanAId,
          checkInDate: new Date('2026-06-13T00:00:00.000Z'),
          checkOutDate: new Date('2026-06-14T00:00:00.000Z'),
          totalAmount: '3000.00',
          status: 'BOOKED',
        },
        {
          propertyId: propertyAId,
          guestId: guestA2Id,
          roomCategoryId: roomCategoryAId,
          ratePlanId: ratePlanAId,
          checkInDate: new Date('2026-06-13T00:00:00.000Z'),
          checkOutDate: new Date('2026-06-14T00:00:00.000Z'),
          totalAmount: '3000.00',
          status: 'BOOKED',
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

    const booking = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${adminAToken}`)
      .send({
        property_id: propertyAId,
        guest_id: guestA3Id,
        room_category_id: roomCategoryAId,
        rate_plan_id: ratePlanAId,
        check_in_date: '2026-06-13',
        check_out_date: '2026-06-14',
      })
      .expect(201);

    expect(booking.body.total_amount).toBe(6000);

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
});
