import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditAction,
  BookingStatus,
  ChannelProvider,
  ChannelSyncType,
  HousekeepingPriority,
  HousekeepingStatus,
  PaymentStatus,
  Prisma,
  RoomStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { BackgroundJobService } from '../background-job/background-job.service';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginatedResponse, paginationParams } from '../../common/pagination/paginated-response';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthenticatedUser } from '../auth/auth.guard';
import { assertCanAccessProperty, propertyIdFilter } from '../auth/property-scope';
import { InventoryService } from '../inventory/inventory.service';
import { PricingService } from '../pricing/pricing.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDirectReservationDto } from './dto/create-direct-reservation.dto';
import { FindReservationFeedQueryDto } from './dto/find-reservation-feed-query.dto';

type ReservationGroupWithRelations = Prisma.ReservationGroupGetPayload<{
  include: {
    property: true;
    primaryGuest: true;
    rooms: {
      include: {
        roomCategory: true;
        ratePlan: true;
        room: true;
      };
    };
  };
}>;

type ReservationGroupResponse = {
  id: string;
  property_id: string;
  primary_guest_id: string | null;
  channel_connection_id: string | null;
  external_reservation_id: string;
  external_reservation_version: string | null;
  external_status: string | null;
  source: string | null;
  currency: string | null;
  total_amount: number | null;
  reservation_status: BookingStatus;
  remarks: string | null;
  booked_at: string | null;
  modified_at: string | null;
  arrival_date: string | null;
  departure_date: string | null;
  import_blocked: boolean;
  import_error: string | null;
  created_at: string;
  updated_at: string;
  property: {
    id: string;
    name: string;
    code: string;
  };
  primary_guest: {
    id: string | null;
    name: string;
    phone: string | null;
    email: string | null;
  } | null;
  rooms: Array<{
    id: string;
    external_room_reservation_id: string;
    external_room_id: string;
    arrival_date: string;
    departure_date: string;
    total_amount: number | null;
    currency: string | null;
    reservation_status: BookingStatus;
    guest_name: string | null;
    adults: number | null;
    children: number | null;
    room_category: {
      id: string;
      name: string;
      code: string;
    };
    rate_plan: {
      id: string;
      name: string;
      code: string;
      base_rate: number;
      currency: string;
    };
    room: {
      id: string | null;
      room_number: string | null;
      status: RoomStatus | null;
    };
  }>;
};

@Injectable()
export class BookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly backgroundJobService: BackgroundJobService,
    private readonly auditLogService: AuditLogService,
    private readonly inventoryService: InventoryService,
    private readonly pricingService: PricingService,
  ) {}

  async createDirectReservation(dto: CreateDirectReservationDto, user?: AuthenticatedUser) {
    assertCanAccessProperty(user, dto.property_id);
    const checkInDate = this.parseDateOnly(dto.check_in_date, 'check_in_date');
    const checkOutDate = this.parseDateOnly(dto.check_out_date, 'check_out_date');
    if (checkOutDate <= checkInDate) {
      throw new ConflictException('check_out_date must be after check_in_date');
    }

    const roomCount = dto.room_count ?? 1;

    let reservationGroup: ReservationGroupWithRelations;
    try {
      reservationGroup = await this.prisma.$transaction(
        async (tx) => {
          const [property, roomCategory, ratePlan] = await Promise.all([
            tx.property.findUnique({ where: { id: dto.property_id } }),
            tx.roomCategory.findUnique({ where: { id: dto.room_category_id } }),
            tx.ratePlan.findUnique({
              where: { id: dto.rate_plan_id },
              include: {
                pricingRules: {
                  where: { isActive: true },
                  orderBy: { createdAt: 'asc' },
                },
              },
            }),
          ]);

          if (!property) {
            throw new NotFoundException('Property not found');
          }
          if (!roomCategory || roomCategory.propertyId !== dto.property_id) {
            throw new NotFoundException('Room category not found for this property');
          }
          if (!ratePlan || ratePlan.propertyId !== dto.property_id) {
            throw new NotFoundException('Rate plan not found for this property');
          }
          if (ratePlan.roomCategoryId !== roomCategory.id) {
            throw new ConflictException('Rate plan does not belong to the selected room category');
          }

          const guest = await this.resolveDirectGuest(tx, dto);
          const pricing = await this.pricingService.calculateStayPricing({
            db: tx,
            propertyId: dto.property_id,
            roomCategoryId: roomCategory.id,
            ratePlan,
            checkInDate,
            checkOutDate,
          });

          await this.inventoryService.allocateInventory(tx, {
            propertyId: dto.property_id,
            roomCategoryId: roomCategory.id,
            checkInDate,
            checkOutDate,
            roomCount,
          });

          const reservationReference = `DIRECT-${randomUUID()}`;
          const totalAmount = pricing.totalAmount.mul(new Prisma.Decimal(roomCount));
          const group = await tx.reservationGroup.create({
            data: {
              propertyId: dto.property_id,
              primaryGuestId: guest.id,
              channelConnectionId: null,
              externalReservationId: reservationReference,
              externalReservationVersion: '1',
              externalStatus: 'CONFIRMED',
              source: dto.source?.trim() || 'DIRECT',
              currency: pricing.currency,
              totalAmount,
              status: BookingStatus.BOOKED,
              remarks: dto.remarks?.trim() || null,
              bookedAt: new Date(),
              modifiedAt: new Date(),
              rawPayload: {
                mode: 'direct_reservation',
                room_count: roomCount,
              } satisfies Prisma.InputJsonObject,
            },
          });

          for (let index = 0; index < roomCount; index += 1) {
            await tx.reservationRoom.create({
              data: {
                reservationGroupId: group.id,
                propertyId: dto.property_id,
                externalRoomReservationId: `${reservationReference}-${index + 1}`,
                externalRoomId: `DIRECT:${roomCategory.code}`,
                roomCategoryId: roomCategory.id,
                ratePlanId: ratePlan.id,
                arrivalDate: checkInDate,
                departureDate: checkOutDate,
                totalAmount: pricing.totalAmount,
                currency: pricing.currency,
                status: BookingStatus.BOOKED,
                guestName: guest.name,
                adults: null,
                children: null,
                rawPayload: {
                  mode: 'direct_reservation_room',
                  line_number: index + 1,
                } satisfies Prisma.InputJsonObject,
              },
            });
          }

          return tx.reservationGroup.findUniqueOrThrow({
            where: { id: group.id },
            include: {
              property: true,
              primaryGuest: true,
              rooms: {
                include: {
                  roomCategory: true,
                  ratePlan: true,
                  room: true,
                },
                orderBy: [{ arrivalDate: 'asc' }, { createdAt: 'asc' }],
              },
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new ConflictException('Concurrent inventory update detected. Please retry the reservation.');
      }

      throw error;
    }

    await this.auditLogService.record({
      action: AuditAction.CREATE,
      entityType: 'reservation_group',
      entityId: reservationGroup.id,
      propertyId: reservationGroup.propertyId,
      summary: `Created direct reservation ${reservationGroup.externalReservationId}`,
      metadata: {
        source: reservationGroup.source,
        room_count: reservationGroup.rooms.length,
        currency: reservationGroup.currency,
      },
      user,
    });

    await this.backgroundJobService.queueInventorySyncsForProperty(reservationGroup.propertyId, {
      trigger: 'direct_reservation_created',
    });

    return this.toReservationGroupResponse(reservationGroup);
  }

  async findReservationGroups(query: PaginationQueryDto, user?: AuthenticatedUser) {
    const { page, limit, skip, take } = paginationParams(query);
    const scopedPropertyId = propertyIdFilter(user);
    const search = query.search?.trim();
    const where: Prisma.ReservationGroupWhereInput = {
      ...(scopedPropertyId ? { propertyId: scopedPropertyId } : {}),
      ...(search
        ? {
            OR: [
              { externalReservationId: { contains: search, mode: 'insensitive' } },
              { property: { name: { contains: search, mode: 'insensitive' } } },
              { primaryGuest: { name: { contains: search, mode: 'insensitive' } } },
              { rooms: { some: { guestName: { contains: search, mode: 'insensitive' } } } },
              { rooms: { some: { externalRoomId: { contains: search, mode: 'insensitive' } } } },
              { rooms: { some: { roomCategory: { name: { contains: search, mode: 'insensitive' } } } } },
            ],
          }
        : {}),
    };

    const [groups, total] = await this.prisma.$transaction([
      this.prisma.reservationGroup.findMany({
        where,
        include: {
          property: true,
          primaryGuest: true,
          rooms: {
            include: {
              roomCategory: true,
              ratePlan: true,
              room: true,
            },
            orderBy: [{ arrivalDate: 'asc' }, { createdAt: 'asc' }],
          },
        },
        orderBy: [{ modifiedAt: 'desc' }, { createdAt: 'desc' }],
        skip,
        take,
      }),
      this.prisma.reservationGroup.count({ where }),
    ]);

    return paginatedResponse(groups.map((group) => this.toReservationGroupResponse(group)), total, page, limit);
  }

  async findReservationFeed(query: FindReservationFeedQueryDto, user?: AuthenticatedUser) {
    const { page, limit } = paginationParams(query);
    const search = query.search?.trim().toLowerCase() ?? '';
    const scopedPropertyId = propertyIdFilter(user);
    const effectivePropertyId = scopedPropertyId ?? query.property_id ?? null;
    const statusFilter = query.status;
    const importedWhere = this.reservationFeedImportedWhere(effectivePropertyId, search, statusFilter);
    const importedTake = page * limit;

    const [groups, importedTotal] = await this.prisma.$transaction([
      this.prisma.reservationGroup.findMany({
        where: importedWhere,
        include: {
          property: true,
          primaryGuest: true,
          rooms: {
            include: {
              roomCategory: true,
              ratePlan: true,
              room: true,
            },
            orderBy: [{ arrivalDate: 'asc' }, { createdAt: 'asc' }],
          },
        },
        orderBy: [{ modifiedAt: 'desc' }, { createdAt: 'desc' }],
        take: importedTake,
      }),
      this.prisma.reservationGroup.count({
        where: importedWhere,
      }),
    ]);

    const importedResponses = groups.map((group) => this.toReservationGroupResponse(group));
    const importedReservationIds = new Set(importedResponses.map((group) => group.external_reservation_id));
    const providerOnlyResponses = await this.findProviderOnlyReservationFailures(
      effectivePropertyId,
      importedReservationIds,
      search,
      statusFilter,
    );

    const merged = [...importedResponses, ...providerOnlyResponses]
      .sort((left, right) => {
        const leftDate = left.modified_at ?? left.booked_at ?? left.created_at;
        const rightDate = right.modified_at ?? right.booked_at ?? right.created_at;
        return rightDate.localeCompare(leftDate);
      });

    const total = importedTotal + providerOnlyResponses.length;
    const start = (page - 1) * limit;
    const data = merged.slice(start, start + limit);

    return paginatedResponse(data, total, page, limit);
  }

  async checkInReservationRoom(id: string, user?: AuthenticatedUser) {
    const reservationRoom = await this.prisma.$transaction(async (tx) => {
      const existingRoomLine = await tx.reservationRoom.findUnique({
        where: { id },
        include: {
          reservationGroup: true,
          roomCategory: true,
          ratePlan: true,
          room: true,
        },
      });

      if (!existingRoomLine) {
        throw new NotFoundException('Reservation room not found');
      }

      assertCanAccessProperty(user, existingRoomLine.propertyId);

      if (existingRoomLine.status !== BookingStatus.BOOKED) {
        throw new ConflictException('Only booked imported room stays can be checked in');
      }

      const assignedRoom =
        existingRoomLine.room ??
        (await tx.room.findFirst({
          where: {
            propertyId: existingRoomLine.propertyId,
            roomCategoryId: existingRoomLine.roomCategoryId,
            status: RoomStatus.AVAILABLE,
            reservationRooms: {
              none: {
                id: {
                  not: existingRoomLine.id,
                },
                status: {
                  in: [BookingStatus.BOOKED, BookingStatus.CHECKED_IN],
                },
                arrivalDate: {
                  lt: existingRoomLine.departureDate,
                },
                departureDate: {
                  gt: existingRoomLine.arrivalDate,
                },
              },
            },
          },
          orderBy: {
            roomNumber: 'asc',
          },
        }));

      if (!assignedRoom) {
        throw new ConflictException('No physical room available to assign for this imported room stay');
      }

      await tx.room.update({
        where: { id: assignedRoom.id },
        data: {
          status: RoomStatus.OCCUPIED,
        },
      });

      const updated = await tx.reservationRoom.update({
        where: { id },
        data: {
          status: BookingStatus.CHECKED_IN,
          roomId: assignedRoom.id,
        },
        include: {
          reservationGroup: true,
          roomCategory: true,
          ratePlan: true,
          room: true,
        },
      });

      await this.recomputeReservationGroupStatus(tx, updated.reservationGroupId);

      return updated;
    });

    await this.auditLogService.record({
      action: AuditAction.CHECK_IN,
      entityType: 'reservation_room',
      entityId: reservationRoom.id,
      propertyId: reservationRoom.propertyId,
      summary: `Checked in imported room stay ${reservationRoom.externalRoomReservationId}`,
      metadata: {
        reservation_group_id: reservationRoom.reservationGroupId,
        room_id: reservationRoom.roomId,
        room_number: reservationRoom.room?.roomNumber,
      },
      user,
    });

    return this.toReservationRoomActionResponse(reservationRoom);
  }

  async checkOutReservationRoom(id: string, user?: AuthenticatedUser) {
    const reservationRoom = await this.prisma.$transaction(async (tx) => {
      const existingRoomLine = await tx.reservationRoom.findUnique({
        where: { id },
        include: {
          reservationGroup: true,
          roomCategory: true,
          ratePlan: true,
          room: true,
        },
      });

      if (!existingRoomLine) {
        throw new NotFoundException('Reservation room not found');
      }

      assertCanAccessProperty(user, existingRoomLine.propertyId);

      if (existingRoomLine.status !== BookingStatus.CHECKED_IN) {
        throw new ConflictException('Only checked-in imported room stays can be checked out');
      }

      if (existingRoomLine.roomId) {
        await tx.room.update({
          where: { id: existingRoomLine.roomId },
          data: {
            status: RoomStatus.AVAILABLE,
          },
        });
      }

      const updated = await tx.reservationRoom.update({
        where: { id },
        data: {
          status: BookingStatus.CHECKED_OUT,
        },
        include: {
          reservationGroup: true,
          roomCategory: true,
          ratePlan: true,
          room: true,
        },
      });

      await this.ensureCheckoutBilling(tx, updated);

      if (updated.roomId) {
        await this.createCheckoutHousekeepingTask(tx, {
          propertyId: updated.propertyId,
          roomId: updated.roomId,
          reservationRoomId: updated.id,
          dueDate: updated.departureDate,
          notes: `Post check-out turnover for imported room stay ${updated.externalRoomReservationId}.`,
        });
      }

      await this.recomputeReservationGroupStatus(tx, updated.reservationGroupId);

      return updated;
    });

    await this.auditLogService.record({
      action: AuditAction.CHECK_OUT,
      entityType: 'reservation_room',
      entityId: reservationRoom.id,
      propertyId: reservationRoom.propertyId,
      summary: `Checked out imported room stay ${reservationRoom.externalRoomReservationId}`,
      metadata: {
        reservation_group_id: reservationRoom.reservationGroupId,
        room_id: reservationRoom.roomId,
        room_number: reservationRoom.room?.roomNumber,
      },
      user,
    });

    return this.toReservationRoomActionResponse(reservationRoom);
  }

  async sendReservationRoomCheckInReminder(id: string, user?: AuthenticatedUser) {
    const reservationRoom = await this.prisma.reservationRoom.findUnique({
      where: { id },
      include: {
        reservationGroup: {
          include: {
            primaryGuest: true,
          },
        },
        roomCategory: true,
        room: true,
      },
    });

    if (!reservationRoom) {
      throw new NotFoundException('Reservation room not found');
    }

    assertCanAccessProperty(user, reservationRoom.propertyId);

    const guestName =
      reservationRoom.guestName ??
      reservationRoom.reservationGroup.primaryGuest?.name ??
      'Imported guest';
    const phone = reservationRoom.reservationGroup.primaryGuest?.phone;

    if (!phone) {
      throw new ConflictException('Imported reservation room has no guest phone for reminders');
    }

    await this.enqueueNotification(
      reservationRoom.propertyId,
      `check-in-reminder:reservation-room:${reservationRoom.id}:${reservationRoom.arrivalDate.toISOString().slice(0, 10)}`,
      'check_in_reminder',
      {
        guest_name: guestName,
        phone,
        room_number:
          reservationRoom.room?.roomNumber ??
          `${reservationRoom.roomCategory.name} · ${reservationRoom.externalRoomReservationId}`,
        check_in_date: reservationRoom.arrivalDate.toISOString(),
        check_out_date: reservationRoom.departureDate.toISOString(),
      },
    );

    return { id, reminder_queued: true };
  }

  private async enqueueNotification(
    propertyId: string,
    dedupeKey: string,
    template: 'reservation_confirmation' | 'owner_reservation_notification' | 'check_in_reminder',
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

  private async recomputeReservationGroupStatus(tx: Prisma.TransactionClient, reservationGroupId: string) {
    const rooms = await tx.reservationRoom.findMany({
      where: { reservationGroupId },
      select: { status: true },
    });

    const statuses = rooms.map((room) => room.status);
    let nextStatus: BookingStatus = BookingStatus.BOOKED;
    const settledStatuses = new Set<BookingStatus>([BookingStatus.CHECKED_OUT, BookingStatus.CANCELLED]);

    if (statuses.length > 0 && statuses.every((status) => status === BookingStatus.CANCELLED)) {
      nextStatus = BookingStatus.CANCELLED;
    } else if (statuses.length > 0 && statuses.every((status) => settledStatuses.has(status))) {
      nextStatus = BookingStatus.CHECKED_OUT;
    } else if (statuses.some((status) => status === BookingStatus.CHECKED_IN)) {
      nextStatus = BookingStatus.CHECKED_IN;
    }

    await tx.reservationGroup.update({
      where: { id: reservationGroupId },
      data: {
        status: nextStatus,
      },
    });
  }

  private async createCheckoutHousekeepingTask(
    tx: Prisma.TransactionClient,
    input: {
      propertyId: string;
      roomId: string;
      reservationRoomId?: string;
      dueDate: Date;
      notes: string;
    },
  ) {
    await tx.housekeepingTask.create({
      data: {
        propertyId: input.propertyId,
        roomId: input.roomId,
        reservationRoomId: input.reservationRoomId,
        status: HousekeepingStatus.DIRTY,
        priority: HousekeepingPriority.HIGH,
        dueDate: input.dueDate,
        notes: input.notes,
      },
    });
  }

  private async resolveDirectGuest(tx: Prisma.TransactionClient, dto: CreateDirectReservationDto) {
    if (dto.guest_id) {
      const guest = await tx.guest.findUnique({
        where: { id: dto.guest_id },
      });

      if (!guest || guest.propertyId !== dto.property_id) {
        throw new NotFoundException('Guest not found for this property');
      }

      return guest;
    }

    if (!dto.guest) {
      throw new ConflictException('guest is required when guest_id is not provided');
    }

    return tx.guest.create({
      data: {
        propertyId: dto.property_id,
        name: dto.guest.name.trim(),
        phone: dto.guest.phone.trim(),
        email: dto.guest.email?.trim() || null,
        idProof: dto.guest.id_proof.trim(),
        address: dto.guest.address.trim(),
      },
    });
  }

  private parseDateOnly(value: string, field: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new ConflictException(`${field} must use YYYY-MM-DD format`);
    }

    return new Date(`${value}T00:00:00.000Z`);
  }

  private toReservationGroupResponse(group: ReservationGroupWithRelations) {
    const roomArrivalDates = group.rooms.map((room) => room.arrivalDate.toISOString().slice(0, 10)).sort();
    const roomDepartureDates = group.rooms.map((room) => room.departureDate.toISOString().slice(0, 10)).sort();
    const storedGroupTotalAmount = group.totalAmount == null ? null : Number(group.totalAmount);
    const summedRoomTotalAmount = group.rooms.reduce((sum, room) => sum + (room.totalAmount == null ? 0 : Number(room.totalAmount)), 0);
    const effectiveGroupTotalAmount =
      (storedGroupTotalAmount == null || storedGroupTotalAmount <= 0) && summedRoomTotalAmount > 0
        ? summedRoomTotalAmount
        : storedGroupTotalAmount;

    return {
      id: group.id,
      property_id: group.propertyId,
      primary_guest_id: group.primaryGuestId,
      channel_connection_id: group.channelConnectionId,
      external_reservation_id: group.externalReservationId,
      external_reservation_version: group.externalReservationVersion,
      external_status: group.externalStatus,
      source: group.source,
      currency: group.currency,
      total_amount: effectiveGroupTotalAmount,
      reservation_status: group.status,
      remarks: group.remarks,
      booked_at: group.bookedAt?.toISOString() ?? null,
      modified_at: group.modifiedAt?.toISOString() ?? null,
      arrival_date: roomArrivalDates[0] ?? null,
      departure_date: roomDepartureDates[roomDepartureDates.length - 1] ?? null,
      import_blocked: false,
      import_error: null,
      created_at: group.createdAt.toISOString(),
      updated_at: group.updatedAt.toISOString(),
      property: {
        id: group.property.id,
        name: group.property.name,
        code: group.property.code,
      },
      primary_guest: group.primaryGuest
        ? {
            id: group.primaryGuest.id,
            name: group.primaryGuest.name,
            phone: group.primaryGuest.phone,
            email: group.primaryGuest.email,
          }
        : null,
      rooms: group.rooms.map((room) => ({
        id: room.id,
        external_room_reservation_id: room.externalRoomReservationId,
        external_room_id: room.externalRoomId,
        arrival_date: room.arrivalDate.toISOString().slice(0, 10),
        departure_date: room.departureDate.toISOString().slice(0, 10),
        total_amount: room.totalAmount == null ? null : Number(room.totalAmount),
        currency: room.currency,
        reservation_status: room.status,
        guest_name: room.guestName,
        adults: room.adults,
        children: room.children,
        room_category: {
          id: room.roomCategory.id,
          name: room.roomCategory.name,
          code: room.roomCategory.code,
        },
        rate_plan: {
          id: room.ratePlan.id,
          name: room.ratePlan.name,
          code: room.ratePlan.code,
          base_rate: Number(room.ratePlan.baseRate),
          currency: room.ratePlan.currency,
        },
        room: {
          id: room.room?.id ?? null,
          room_number: room.room?.roomNumber ?? null,
          status: room.room?.status ?? null,
        },
      })),
    };
  }

  private async findProviderOnlyReservationFailures(
    scopedPropertyId: string | null,
    importedReservationIds: Set<string>,
    search: string,
    statusFilter?: BookingStatus,
  ) {
    const syncLogs = await this.prisma.channelSyncLog.findMany({
      where: {
        syncType: ChannelSyncType.BOOKINGS,
        channelConnection: {
          provider: ChannelProvider.ZODOMUS,
          ...(scopedPropertyId ? { propertyId: scopedPropertyId } : {}),
        },
      },
      include: {
        channelConnection: {
          include: {
            property: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 50,
    });

    const latestLogByConnection = new Map<string, (typeof syncLogs)[number]>();
    for (const log of syncLogs) {
      if (!latestLogByConnection.has(log.channelConnectionId)) {
        latestLogByConnection.set(log.channelConnectionId, log);
      }
    }

    const providerOnlyReservations: ReservationGroupResponse[] = [];

    for (const log of latestLogByConnection.values()) {
      const payload = this.readObject(log.responsePayload);
      const importSummary = this.readObject(payload.import_summary);
      const errorEntries = this.readStringArray(importSummary.errors);
      const errorMap = new Map(
        errorEntries.map((entry) => {
          const divider = entry.indexOf(':');
          if (divider === -1) {
            return [entry.trim(), 'Import blocked'] as const;
          }

          return [entry.slice(0, divider).trim(), entry.slice(divider + 1).trim()] as const;
        }),
      );

      const detailedReservations = this.readArray(payload.reservations);
      for (const value of detailedReservations) {
        const detail = this.readObject(value);
        const envelope = this.readObject(detail.reservations);
        const reservationRecord = this.readObject(envelope.reservation);
        const reservationId = this.firstString(reservationRecord, 'id', 'reservation_id', 'reservationId');

        if (!reservationId || importedReservationIds.has(reservationId)) {
          continue;
        }

        const importError = errorMap.get(reservationId);
        if (!importError) {
          continue;
        }

        const response = this.toProviderOnlyReservationGroupResponse({
          connection: log.channelConnection,
          detail,
          importError,
          createdAt: log.createdAt,
          updatedAt: log.updatedAt,
        });

        if (!this.matchesReservationFeedSearch(response, search)) {
          continue;
        }

        if (statusFilter && response.reservation_status !== statusFilter) {
          continue;
        }

        providerOnlyReservations.push(response);
      }
    }

    return providerOnlyReservations;
  }

  private reservationFeedImportedWhere(
    propertyId: string | null,
    search: string,
    status?: BookingStatus,
  ): Prisma.ReservationGroupWhereInput {
    return {
      ...(propertyId ? { propertyId } : {}),
      ...(status ? { reservationStatus: status } : {}),
      ...(search
        ? {
            OR: [
              { externalReservationId: { contains: search, mode: 'insensitive' } },
              { property: { name: { contains: search, mode: 'insensitive' } } },
              { primaryGuest: { name: { contains: search, mode: 'insensitive' } } },
              { rooms: { some: { guestName: { contains: search, mode: 'insensitive' } } } },
              { rooms: { some: { externalRoomId: { contains: search, mode: 'insensitive' } } } },
              { rooms: { some: { roomCategory: { name: { contains: search, mode: 'insensitive' } } } } },
            ],
          }
        : {}),
    };
  }

  private toProviderOnlyReservationGroupResponse(input: {
    connection: {
      id: string;
      propertyId: string;
      property: { id: string; name: string; code: string };
    };
    detail: Record<string, unknown>;
    importError: string;
    createdAt: Date;
    updatedAt: Date;
  }): ReservationGroupResponse {
    const envelope = this.readObject(input.detail.reservations);
    const reservationRecord = this.readObject(envelope.reservation);
    const customerRecord = this.readObject(envelope.customer);
    const roomRecords = this.readArray(envelope.rooms).map((value) => this.readObject(value));
    const roomResponses = roomRecords.map((room, index) => {
      const prices = this.readArray(room.prices).map((value) => this.readObject(value));
      const rateId = this.firstString(prices[0] ?? {}, 'rateId', 'rate_id') ?? 'UNMAPPED-RATE';
      const arrivalDate = this.firstString(room, 'arrivalDate', 'arrival_date') ?? null;
      const departureDate = this.firstString(room, 'departureDate', 'departure_date') ?? null;
      const externalRoomReservationId =
        this.firstString(room, 'roomReservationId', 'room_reservation_id', 'reservationRoomId') ??
        `provider-room-line-${index + 1}`;
      const externalRoomId = this.firstString(room, 'id', 'roomId', 'room_id') ?? `provider-room-${index + 1}`;

      return {
        id: `provider-only:${input.connection.id}:${externalRoomReservationId}`,
        external_room_reservation_id: externalRoomReservationId,
        external_room_id: externalRoomId,
        arrival_date: arrivalDate ?? '-',
        departure_date: departureDate ?? '-',
        total_amount: this.firstNumber(room, 'totalPrice', 'total_amount', 'total'),
        currency:
          this.firstString(reservationRecord, 'currencyCode', 'currency_code', 'currency') ??
          null,
        reservation_status: this.mapExternalBookingStatus(this.firstStringOrNumber(reservationRecord, 'status') ?? '1'),
        guest_name:
          this.firstString(room, 'guestName', 'guest_name') ??
          this.composeGuestName(customerRecord) ??
          'Provider guest',
        adults: this.firstInteger(room, 'numberOfAdults', 'adults'),
        children: this.firstInteger(room, 'numberOChildren', 'numberOfChildren', 'children'),
        room_category: {
          id: `provider-room:${externalRoomId}`,
          name: `Provider room ${externalRoomId}`,
          code: externalRoomId,
        },
        rate_plan: {
          id: `provider-rate:${rateId}`,
          name: `Provider rate ${rateId}`,
          code: rateId,
          base_rate: this.firstNumber(prices[0] ?? {}, 'price') ?? 0,
          currency:
            this.firstString(reservationRecord, 'currencyCode', 'currency_code', 'currency') ??
            '',
        },
        room: {
          id: null,
          room_number: null,
          status: null,
        },
      };
    });

    const arrivalDates = roomResponses.map((room) => room.arrival_date).filter((value) => value && value !== '-').sort();
    const departureDates = roomResponses.map((room) => room.departure_date).filter((value) => value && value !== '-').sort();
    const totalAmount =
      this.firstNumber(reservationRecord, 'totalPrice', 'total_amount', 'total') ??
      roomResponses.reduce((sum, room) => sum + (room.total_amount ?? 0), 0);
    const guestName = this.composeGuestName(customerRecord);

    return {
      id: `provider-only:${input.connection.id}:${this.firstString(reservationRecord, 'id', 'reservation_id', 'reservationId') ?? 'reservation'}`,
      property_id: input.connection.propertyId,
      primary_guest_id: null,
      channel_connection_id: input.connection.id,
      external_reservation_id:
        this.firstString(reservationRecord, 'id', 'reservation_id', 'reservationId') ?? 'provider-only',
      external_reservation_version:
        this.firstString(reservationRecord, 'modifiedAt', 'modified_at', 'updated_at', 'version') ?? null,
      external_status: this.firstStringOrNumber(reservationRecord, 'status')?.toString() ?? null,
      source: 'ZODOMUS',
      currency: this.firstString(reservationRecord, 'currencyCode', 'currency_code', 'currency') ?? null,
      total_amount: totalAmount,
      reservation_status: this.mapExternalBookingStatus(this.firstStringOrNumber(reservationRecord, 'status') ?? '1'),
      remarks: input.importError,
      booked_at: this.normalizeProviderTimestamp(this.firstString(reservationRecord, 'bookedAt', 'booked_at')),
      modified_at: this.normalizeProviderTimestamp(this.firstString(reservationRecord, 'modifiedAt', 'modified_at')),
      arrival_date: arrivalDates[0] ?? null,
      departure_date: departureDates[departureDates.length - 1] ?? null,
      import_blocked: true,
      import_error: input.importError,
      created_at: input.createdAt.toISOString(),
      updated_at: input.updatedAt.toISOString(),
      property: input.connection.property,
      primary_guest: guestName
        ? {
            id: null,
            name: guestName,
            phone: this.firstString(customerRecord, 'phone') ?? null,
            email: this.firstString(customerRecord, 'email') ?? null,
          }
        : null,
      rooms: roomResponses,
    };
  }

  private matchesReservationFeedSearch(group: ReservationGroupResponse, search: string) {
    if (!search) {
      return true;
    }

    const haystack = [
      group.external_reservation_id,
      group.property.name,
      group.primary_guest?.name ?? '',
      group.primary_guest?.phone ?? '',
      group.remarks ?? '',
      group.import_error ?? '',
      ...group.rooms.map((room) => room.guest_name ?? ''),
      ...group.rooms.map((room) => room.external_room_id),
      ...group.rooms.map((room) => room.room_category.name),
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(search);
  }

  private readObject(value: unknown) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private readArray(value: unknown) {
    if (Array.isArray(value)) {
      return value;
    }

    const record = this.readObject(value);
    if (Array.isArray(record.items)) return record.items;
    if (Array.isArray(record.reservations)) return record.reservations;
    if (Array.isArray(record.data)) return record.data;
    if (Array.isArray(record.rooms)) return record.rooms;
    return [];
  }

  private readStringArray(value: unknown) {
    return this.readArray(value).flatMap((entry) => (typeof entry === 'string' ? [entry] : []));
  }

  private firstString(record: Record<string, unknown>, ...keys: string[]) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return null;
  }

  private firstStringOrNumber(record: Record<string, unknown>, ...keys: string[]) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
    }

    return null;
  }

  private firstNumber(record: Record<string, unknown>, ...keys: string[]) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }

    return null;
  }

  private firstInteger(record: Record<string, unknown>, ...keys: string[]) {
    const value = this.firstNumber(record, ...keys);
    return value == null ? null : Math.trunc(value);
  }

  private composeGuestName(customerRecord: Record<string, unknown>) {
    const parts = [
      this.firstString(customerRecord, 'firstName', 'first_name'),
      this.firstString(customerRecord, 'middleName', 'middle_name'),
      this.firstString(customerRecord, 'lastName', 'last_name'),
    ].filter((value): value is string => Boolean(value));

    return parts.length > 0 ? parts.join(' ') : null;
  }

  private mapExternalBookingStatus(value: string | number) {
    const normalized = String(value).trim();
    if (normalized === '3') {
      return BookingStatus.CANCELLED;
    }

    return BookingStatus.BOOKED;
  }

  private normalizeProviderTimestamp(value: string | null) {
    if (!value || value.startsWith('0000-00-00')) {
      return null;
    }

    const normalized = value.includes('T') ? value : value.replace(' ', 'T');
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  private async ensureCheckoutBilling(
    tx: Prisma.TransactionClient,
    reservationRoom: {
      id: string;
      totalAmount: Prisma.Decimal | null;
    },
  ) {
    const existingBilling = await tx.billing.findUnique({
      where: { reservationRoomId: reservationRoom.id },
    });

    if (existingBilling) {
      return existingBilling;
    }

    const amount = reservationRoom.totalAmount ?? new Prisma.Decimal(0);

    return tx.billing.create({
      data: {
        reservationRoomId: reservationRoom.id,
        amount,
        tax: new Prisma.Decimal(0),
        total: amount,
        paymentStatus: PaymentStatus.PENDING,
      },
    });
  }

  private toReservationRoomActionResponse(room: {
    id: string;
    reservationGroupId: string;
    propertyId: string;
    externalRoomReservationId: string;
    externalRoomId: string;
    arrivalDate: Date;
    departureDate: Date;
    totalAmount: Prisma.Decimal | null;
    currency: string | null;
    status: BookingStatus;
    guestName: string | null;
    adults: number | null;
    children: number | null;
    roomCategory: { id: string; name: string; code: string };
    ratePlan: { id: string; name: string; code: string; baseRate: Prisma.Decimal; currency: string };
    room: { id: string; roomNumber: string; status: RoomStatus } | null;
  }) {
    return {
      id: room.id,
      reservation_group_id: room.reservationGroupId,
      property_id: room.propertyId,
      external_room_reservation_id: room.externalRoomReservationId,
      external_room_id: room.externalRoomId,
      arrival_date: room.arrivalDate.toISOString().slice(0, 10),
      departure_date: room.departureDate.toISOString().slice(0, 10),
      total_amount: room.totalAmount == null ? null : Number(room.totalAmount),
      currency: room.currency,
      reservation_status: room.status,
      guest_name: room.guestName,
      adults: room.adults,
      children: room.children,
      room_category: {
        id: room.roomCategory.id,
        name: room.roomCategory.name,
        code: room.roomCategory.code,
      },
      rate_plan: {
        id: room.ratePlan.id,
        name: room.ratePlan.name,
        code: room.ratePlan.code,
        base_rate: Number(room.ratePlan.baseRate),
        currency: room.ratePlan.currency,
      },
      room: {
        id: room.room?.id ?? null,
        room_number: room.room?.roomNumber ?? null,
        status: room.room?.status ?? null,
      },
    };
  }

}
