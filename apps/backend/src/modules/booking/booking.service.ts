import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, BookingStatus, PaymentStatus, Prisma, RoomStatus } from '@prisma/client';
import { BackgroundJobService } from '../background-job/background-job.service';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginatedResponse, paginationParams } from '../../common/pagination/paginated-response';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthenticatedUser } from '../auth/auth.guard';
import { assertCanAccessProperty, propertyIdFilter } from '../auth/property-scope';
import { PricingService } from '../pricing/pricing.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBookingDto } from './dto/create-booking.dto';

type BookingWithRelations = Prisma.BookingGetPayload<{
  include: {
    property: true;
    guest: true;
    roomCategory: true;
    ratePlan: true;
    room: true;
  };
}>;

@Injectable()
export class BookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly backgroundJobService: BackgroundJobService,
    private readonly auditLogService: AuditLogService,
    private readonly pricingService: PricingService,
  ) {}

  async create(createBookingDto: CreateBookingDto, user?: AuthenticatedUser) {
    assertCanAccessProperty(user, createBookingDto.property_id);

    const checkInDate = this.parseDateOnly(createBookingDto.check_in_date);
    const checkOutDate = this.parseDateOnly(createBookingDto.check_out_date);
    this.calculateNights(checkInDate, checkOutDate);

    const booking = await this.prisma.$transaction(async (tx) => {
      await this.acquireInventoryLock(tx, createBookingDto.property_id, createBookingDto.room_category_id);

      const guest = await tx.guest.findUnique({
        where: { id: createBookingDto.guest_id },
      });

      if (!guest || guest.propertyId !== createBookingDto.property_id) {
        throw new NotFoundException('Guest not found');
      }

      const roomCategory = await tx.roomCategory.findUnique({
        where: { id: createBookingDto.room_category_id },
      });

      if (!roomCategory || roomCategory.propertyId !== createBookingDto.property_id) {
        throw new NotFoundException('Room category not found');
      }

      const ratePlan = await tx.ratePlan.findUnique({
        where: { id: createBookingDto.rate_plan_id },
        include: {
          pricingRules: {
            where: { isActive: true },
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (
        !ratePlan ||
        ratePlan.propertyId !== createBookingDto.property_id ||
        ratePlan.roomCategoryId !== createBookingDto.room_category_id
      ) {
        throw new NotFoundException('Rate plan not found');
      }

      if (!ratePlan.isActive) {
        throw new ConflictException('Rate plan is inactive');
      }

      const physicalInventory = await tx.room.count({
        where: {
          propertyId: createBookingDto.property_id,
          roomCategoryId: createBookingDto.room_category_id,
          status: {
            not: RoomStatus.MAINTENANCE,
          },
        },
      });

      const overlappingBookings = await tx.booking.count({
        where: {
          propertyId: createBookingDto.property_id,
          roomCategoryId: createBookingDto.room_category_id,
          status: {
            in: [BookingStatus.BOOKED, BookingStatus.CHECKED_IN],
          },
          checkInDate: {
            lt: checkOutDate,
          },
          checkOutDate: {
            gt: checkInDate,
          },
        },
      });

      if (overlappingBookings >= physicalInventory) {
        throw new ConflictException('No room inventory available for the selected category and dates');
      }

      const pricing = await this.pricingService.calculateStayPricing({
        db: tx,
        propertyId: createBookingDto.property_id,
        roomCategoryId: createBookingDto.room_category_id,
        ratePlan,
        checkInDate,
        checkOutDate,
      });

      return tx.booking.create({
        data: {
          propertyId: createBookingDto.property_id,
          guestId: createBookingDto.guest_id,
          roomCategoryId: createBookingDto.room_category_id,
          ratePlanId: createBookingDto.rate_plan_id,
          checkInDate,
          checkOutDate,
          totalAmount: pricing.totalAmount,
          status: BookingStatus.BOOKED,
        },
        include: this.includeRelations(),
      });
    });

    await this.enqueueNotification(
      booking.propertyId,
      `booking-confirmation:${booking.id}`,
      'booking_confirmation',
      {
        guest_name: booking.guest.name,
        phone: booking.guest.phone,
        room_number: booking.room?.roomNumber ?? `${booking.roomCategory.name} category`,
        check_in_date: booking.checkInDate.toISOString(),
        check_out_date: booking.checkOutDate.toISOString(),
      },
    );
    await this.enqueueNotification(
      booking.propertyId,
      `owner-booking-notification:${booking.id}`,
      'owner_booking_notification',
      {
        owner_phone: booking.property.phone,
        property_name: booking.property.name,
        guest_name: booking.guest.name,
        guest_phone: booking.guest.phone,
        room_category_name: booking.roomCategory.name,
        check_in_date: booking.checkInDate.toISOString(),
        check_out_date: booking.checkOutDate.toISOString(),
        total_amount: booking.totalAmount.toString(),
      },
    );

    await this.auditLogService.record({
      action: AuditAction.CREATE,
      entityType: 'booking',
      entityId: booking.id,
      propertyId: booking.propertyId,
      summary: `Created booking for ${booking.guest.name}`,
      metadata: {
        check_in_date: booking.checkInDate.toISOString().slice(0, 10),
        check_out_date: booking.checkOutDate.toISOString().slice(0, 10),
        total_amount: booking.totalAmount.toString(),
      },
      user,
    });

    return this.toBookingResponse(booking);
  }

  private async acquireInventoryLock(
    tx: Prisma.TransactionClient,
    propertyId: string,
    roomCategoryId: string,
  ) {
    // Serialize booking creation per property/category so concurrent requests cannot oversell the last slot.
    await tx.$queryRaw`
      SELECT COUNT(*)::int
      FROM (
        SELECT pg_advisory_xact_lock(hashtext(${propertyId}), hashtext(${roomCategoryId}))
      ) AS inventory_lock
    `;
  }

  async findAll(query: PaginationQueryDto, user?: AuthenticatedUser) {
    const { page, limit, skip, take } = paginationParams(query);
    const scopedPropertyId = propertyIdFilter(user);
    const search = query.search?.trim();
    const where: Prisma.BookingWhereInput = {
      ...(scopedPropertyId ? { propertyId: scopedPropertyId } : {}),
      ...(search
        ? {
            OR: [
              { guest: { name: { contains: search, mode: 'insensitive' } } },
              { guest: { phone: { contains: search, mode: 'insensitive' } } },
              { property: { name: { contains: search, mode: 'insensitive' } } },
              { roomCategory: { name: { contains: search, mode: 'insensitive' } } },
              { room: { roomNumber: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [bookings, total] = await this.prisma.$transaction([
      this.prisma.booking.findMany({
        where,
        include: this.includeRelations(),
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take,
      }),
      this.prisma.booking.count({ where }),
    ]);

    return paginatedResponse(bookings.map((booking) => this.toBookingResponse(booking)), total, page, limit);
  }

  async checkIn(id: string, user?: AuthenticatedUser) {
    const booking = await this.prisma.$transaction(async (tx) => {
      const existingBooking = await tx.booking.findUnique({
        where: { id },
        include: {
          property: true,
          guest: true,
          roomCategory: true,
          ratePlan: true,
          room: true,
        },
      });

      if (!existingBooking) {
        throw new NotFoundException('Booking not found');
      }

      assertCanAccessProperty(user, existingBooking.propertyId);

      if (existingBooking.status !== BookingStatus.BOOKED) {
        throw new ConflictException('Only booked reservations can be checked in');
      }

      const assignedRoom =
        existingBooking.room ??
        (await tx.room.findFirst({
          where: {
            propertyId: existingBooking.propertyId,
            roomCategoryId: existingBooking.roomCategoryId,
            status: RoomStatus.AVAILABLE,
            bookings: {
              none: {
                id: {
                  not: existingBooking.id,
                },
                status: {
                  in: [BookingStatus.BOOKED, BookingStatus.CHECKED_IN],
                },
                checkInDate: {
                  lt: existingBooking.checkOutDate,
                },
                checkOutDate: {
                  gt: existingBooking.checkInDate,
                },
              },
            },
          },
          orderBy: {
            roomNumber: 'asc',
          },
        }));

      if (!assignedRoom) {
        throw new ConflictException('No physical room available to assign at check-in');
      }

      await tx.room.update({
        where: { id: assignedRoom.id },
        data: {
          status: RoomStatus.OCCUPIED,
        },
      });

      return tx.booking.update({
        where: { id },
        data: {
          status: BookingStatus.CHECKED_IN,
          roomId: assignedRoom.id,
        },
        include: this.includeRelations(),
      });
    });

    await this.auditLogService.record({
      action: AuditAction.CHECK_IN,
      entityType: 'booking',
      entityId: booking.id,
      propertyId: booking.propertyId,
      summary: `Checked in ${booking.guest.name}`,
      metadata: {
        room_id: booking.roomId,
        room_number: booking.room?.roomNumber,
      },
      user,
    });

    return this.toBookingResponse(booking);
  }

  async checkOut(id: string, user?: AuthenticatedUser) {
    const booking = await this.prisma.$transaction(async (tx) => {
      const existingBooking = await tx.booking.findUnique({
        where: { id },
        include: {
          property: true,
          guest: true,
          roomCategory: true,
          ratePlan: true,
          room: true,
        },
      });

      if (!existingBooking) {
        throw new NotFoundException('Booking not found');
      }

      assertCanAccessProperty(user, existingBooking.propertyId);

      if (existingBooking.status !== BookingStatus.CHECKED_IN) {
        throw new ConflictException('Only checked-in reservations can be checked out');
      }

      if (existingBooking.roomId) {
        await tx.room.update({
          where: { id: existingBooking.roomId },
          data: {
            status: RoomStatus.AVAILABLE,
          },
        });
      }

      const checkedOutBooking = await tx.booking.update({
        where: { id },
        data: {
          status: BookingStatus.CHECKED_OUT,
        },
        include: this.includeRelations(),
      });

      await tx.billing.upsert({
        where: { bookingId: checkedOutBooking.id },
        update: {},
        create: {
          bookingId: checkedOutBooking.id,
          amount: checkedOutBooking.totalAmount,
          tax: new Prisma.Decimal(0),
          total: checkedOutBooking.totalAmount,
          paymentStatus: PaymentStatus.PENDING,
        },
      });

      return checkedOutBooking;
    });

    await this.auditLogService.record({
      action: AuditAction.CHECK_OUT,
      entityType: 'booking',
      entityId: booking.id,
      propertyId: booking.propertyId,
      summary: `Checked out ${booking.guest.name}`,
      metadata: {
        room_id: booking.roomId,
        room_number: booking.room?.roomNumber,
        total_amount: booking.totalAmount.toString(),
      },
      user,
    });

    return this.toBookingResponse(booking);
  }

  async sendCheckInReminder(id: string, user?: AuthenticatedUser) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: {
        property: true,
        guest: true,
        roomCategory: true,
        ratePlan: true,
        room: true,
      },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    assertCanAccessProperty(user, booking.propertyId);

    await this.enqueueNotification(
      booking.propertyId,
      `check-in-reminder:${booking.id}:${booking.checkInDate.toISOString().slice(0, 10)}`,
      'check_in_reminder',
      {
        guest_name: booking.guest.name,
        phone: booking.guest.phone,
        room_number: booking.room?.roomNumber ?? `${booking.roomCategory.name} category`,
        check_in_date: booking.checkInDate.toISOString(),
        check_out_date: booking.checkOutDate.toISOString(),
      },
    );

    return { id, reminder_queued: true };
  }

  private async enqueueNotification(
    propertyId: string,
    dedupeKey: string,
    template: 'booking_confirmation' | 'owner_booking_notification' | 'check_in_reminder',
    payload: Prisma.InputJsonObject,
  ) {
    await this.backgroundJobService.enqueue({
      type: 'NOTIFICATION_SEND',
      propertyId,
      dedupeKey: `notification:${dedupeKey}`,
      entityType: 'notification',
      entityId: dedupeKey,
      payload: {
        template,
        ...payload,
      },
      maxAttempts: 3,
    });
  }

  private parseDateOnly(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException('Dates must use YYYY-MM-DD format');
    }

    return new Date(`${value}T00:00:00.000Z`);
  }

  private calculateNights(checkInDate: Date, checkOutDate: Date) {
    const millisecondsPerNight = 24 * 60 * 60 * 1000;
    const nights = (checkOutDate.getTime() - checkInDate.getTime()) / millisecondsPerNight;

    if (!Number.isInteger(nights) || nights < 1) {
      throw new BadRequestException('check_out_date must be after check_in_date');
    }

    return nights;
  }

  private includeRelations() {
    return {
      property: true,
      guest: true,
      roomCategory: true,
      ratePlan: true,
      room: true,
    } satisfies Prisma.BookingInclude;
  }

  private toBookingResponse(booking: BookingWithRelations) {
    return {
      id: booking.id,
      property_id: booking.propertyId,
      guest_id: booking.guestId,
      room_category_id: booking.roomCategoryId,
      rate_plan_id: booking.ratePlanId,
      room_id: booking.roomId,
      check_in_date: booking.checkInDate.toISOString().slice(0, 10),
      check_out_date: booking.checkOutDate.toISOString().slice(0, 10),
      total_amount: booking.totalAmount.toNumber(),
      booking_status: booking.status,
      guest: {
        id: booking.guest.id,
        name: booking.guest.name,
        phone: booking.guest.phone,
        email: booking.guest.email,
      },
      property: {
        id: booking.property.id,
        name: booking.property.name,
        code: booking.property.code,
      },
      room_category: {
        id: booking.roomCategory.id,
        name: booking.roomCategory.name,
        code: booking.roomCategory.code,
      },
      rate_plan: {
        id: booking.ratePlan.id,
        name: booking.ratePlan.name,
        code: booking.ratePlan.code,
        base_rate: booking.ratePlan.baseRate.toNumber(),
        currency: booking.ratePlan.currency,
      },
      room: {
        id: booking.room?.id ?? null,
        room_number: booking.room?.roomNumber ?? null,
        status: booking.room?.status ?? null,
      },
      created_at: booking.createdAt,
      updated_at: booking.updatedAt,
    };
  }
}
