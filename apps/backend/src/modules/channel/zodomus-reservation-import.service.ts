import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditAction, BookingStatus, ChannelProvider, Prisma, PricingRuleType } from '@prisma/client';
import { InventoryService } from '../inventory/inventory.service';
import { MetricsService } from '../metrics/metrics.service';
import { PricingService } from '../pricing/pricing.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';

type NormalizedReservationRoom = {
  external_room_reservation_id: string;
  external_room_id: string;
  external_rate_id?: string | null;
  arrival_date: string;
  departure_date: string;
  total_amount?: number | null;
  currency?: string | null;
  guest_name?: string | null;
  adults?: number | null;
  children?: number | null;
  raw_payload: Prisma.InputJsonValue;
};

type NormalizedReservationGroup = {
  external_reservation_id: string;
  external_reservation_version?: string | null;
  external_status: string;
  total_amount?: number | null;
  currency?: string | null;
  remarks?: string | null;
  booked_at?: string | null;
  modified_at?: string | null;
  source?: string | null;
  guest_name: string;
  guest_phone?: string | null;
  guest_email?: string | null;
  raw_payload: Prisma.InputJsonValue;
  rooms: NormalizedReservationRoom[];
};

@Injectable()
export class ZodomusReservationImportService {
  private readonly logger = new Logger(ZodomusReservationImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly inventoryService: InventoryService,
    private readonly pricingService: PricingService,
    private readonly metricsService: MetricsService,
  ) {}

  async importFromSync(input: {
    channelConnectionId: string;
    propertyId: string;
    responsePayload: Prisma.JsonValue;
  }) {
    const payload = this.readObject(input.responsePayload);
    const reservations = this.extractReservations(payload);
    const summary = {
      discovered: reservations.length,
      created: 0,
      updated: 0,
      cancelled: 0,
      skipped: 0,
      failed: 0,
      imported_room_count: 0,
      imported_reservation_group_ids: [] as string[],
      imported_reservation_room_ids: [] as string[],
      created_reservation_group_ids: [] as string[],
      updated_reservation_group_ids: [] as string[],
      cancelled_reservation_group_ids: [] as string[],
      errors: [] as string[],
    };

    for (const reservation of reservations) {
      try {
        const outcome = await this.importReservation({
          channelConnectionId: input.channelConnectionId,
          propertyId: input.propertyId,
          reservation,
        });

        if (outcome.action === 'created') {
          summary.created += 1;
          summary.created_reservation_group_ids.push(outcome.reservationGroupId);
        } else if (outcome.action === 'updated') {
          summary.updated += 1;
          summary.updated_reservation_group_ids.push(outcome.reservationGroupId);
        } else if (outcome.action === 'cancelled') {
          summary.cancelled += 1;
          summary.cancelled_reservation_group_ids.push(outcome.reservationGroupId);
        } else {
          summary.skipped += 1;
        }

        summary.imported_reservation_group_ids.push(outcome.reservationGroupId);

        summary.imported_room_count += outcome.reservationRoomIds.length;
        summary.imported_reservation_room_ids.push(...outcome.reservationRoomIds);
      } catch (error) {
        summary.failed += 1;
        const message =
          error instanceof Error
            ? `${reservation.external_reservation_id}: ${error.message}`
            : `${reservation.external_reservation_id}: reservation import failed`;
        summary.errors.push(message);
        this.logger.warn(message);
      }
    }

    return summary satisfies Prisma.InputJsonObject;
  }

  private async importReservation(input: {
    channelConnectionId: string;
    propertyId: string;
    reservation: NormalizedReservationGroup;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT COUNT(*)::int
        FROM (
          SELECT pg_advisory_xact_lock(hashtext(${input.channelConnectionId}), hashtext(${input.reservation.external_reservation_id}))
        ) AS reservation_group_import_lock
      `;

      const guest = await this.upsertImportedGuest(tx, {
        propertyId: input.propertyId,
        name: input.reservation.guest_name,
        phone: input.reservation.guest_phone,
        email: input.reservation.guest_email,
      });

      const reservationStatus = this.mapExternalStatus(input.reservation.external_status);
      const existing = await tx.reservationGroup.findUnique({
        where: {
          channelConnectionId_externalReservationId: {
            channelConnectionId: input.channelConnectionId,
            externalReservationId: input.reservation.external_reservation_id,
          },
        },
        include: {
          rooms: true,
        },
      });
      const existingRoomMap = new Map(
        (existing?.rooms ?? []).map((room) => [room.externalRoomReservationId, room]),
      );

      const groupTotalAmount = this.toDecimal(input.reservation.total_amount);
      const reservationGroup = existing
        ? await tx.reservationGroup.update({
            where: { id: existing.id },
            data: {
              primaryGuestId: guest.id,
              externalReservationVersion: input.reservation.external_reservation_version ?? null,
              externalStatus: input.reservation.external_status,
              source: input.reservation.source ?? ChannelProvider.ZODOMUS,
              currency: input.reservation.currency ?? null,
              totalAmount: groupTotalAmount,
              status: existing.status,
              remarks: input.reservation.remarks ?? null,
              bookedAt: this.parseTimestamp(input.reservation.booked_at),
              modifiedAt: this.parseTimestamp(input.reservation.modified_at),
              rawPayload: input.reservation.raw_payload,
            },
          })
        : await tx.reservationGroup.create({
            data: {
              propertyId: input.propertyId,
              primaryGuestId: guest.id,
              channelConnectionId: input.channelConnectionId,
              externalReservationId: input.reservation.external_reservation_id,
              externalReservationVersion: input.reservation.external_reservation_version ?? null,
              externalStatus: input.reservation.external_status,
              source: input.reservation.source ?? ChannelProvider.ZODOMUS,
              currency: input.reservation.currency ?? null,
              totalAmount: groupTotalAmount,
              status: reservationStatus,
              remarks: input.reservation.remarks ?? null,
              bookedAt: this.parseTimestamp(input.reservation.booked_at),
              modifiedAt: this.parseTimestamp(input.reservation.modified_at),
              rawPayload: input.reservation.raw_payload,
            },
          });

      const importedRoomIds: string[] = [];
      const seenExternalRoomReservationIds = new Set<string>();

      for (const room of input.reservation.rooms) {
        const roomMapping = await this.resolveRoomMapping(tx, input.channelConnectionId, room.external_room_id);
        const rateMapping = await this.resolveRateMapping(
          tx,
          input.channelConnectionId,
          room.external_room_id,
          room.external_rate_id,
        );
        const checkInDate = this.parseDateOnly(room.arrival_date);
        const checkOutDate = this.parseDateOnly(room.departure_date);
        this.calculateNights(checkInDate, checkOutDate);

        const ratePlan = await tx.ratePlan.findUnique({
          where: { id: rateMapping.ratePlanId },
          include: {
            pricingRules: {
              where: { isActive: true },
              orderBy: { createdAt: 'asc' },
            },
          },
        });

        if (
          !ratePlan ||
          ratePlan.propertyId !== input.propertyId ||
          ratePlan.roomCategoryId !== roomMapping.roomCategoryId
        ) {
          throw new NotFoundException('Mapped rate plan is not available for this property');
        }

        const existingRoom = existingRoomMap.get(room.external_room_reservation_id);
        const roomStatus = this.resolveImportedRoomStatus(existingRoom?.status, reservationStatus);
        const totalAmount = await this.resolveRoomTotalAmount(tx, {
          reservation: room,
          propertyId: input.propertyId,
          roomCategoryId: roomMapping.roomCategoryId,
          ratePlan,
          checkInDate,
          checkOutDate,
        });

        await this.reconcileInventoryForRoom(tx, {
          propertyId: input.propertyId,
          existingRoom,
          nextRoomCategoryId: roomMapping.roomCategoryId,
          nextCheckInDate: checkInDate,
          nextCheckOutDate: checkOutDate,
          nextStatus: roomStatus,
        });

        const reservationRoom = await tx.reservationRoom.upsert({
          where: {
            reservationGroupId_externalRoomReservationId: {
              reservationGroupId: reservationGroup.id,
              externalRoomReservationId: room.external_room_reservation_id,
            },
          },
          create: {
            reservationGroupId: reservationGroup.id,
            propertyId: input.propertyId,
            externalRoomReservationId: room.external_room_reservation_id,
            externalRoomId: room.external_room_id,
            roomCategoryId: roomMapping.roomCategoryId,
            ratePlanId: rateMapping.ratePlanId,
            arrivalDate: checkInDate,
            departureDate: checkOutDate,
            totalAmount,
            currency: room.currency ?? input.reservation.currency ?? null,
            status: roomStatus,
            guestName: room.guest_name ?? guest.name,
            adults: room.adults ?? null,
            children: room.children ?? null,
            rawPayload: room.raw_payload,
          },
          update: {
            externalRoomId: room.external_room_id,
            roomCategoryId: roomMapping.roomCategoryId,
            ratePlanId: rateMapping.ratePlanId,
            arrivalDate: checkInDate,
            departureDate: checkOutDate,
            totalAmount,
            currency: room.currency ?? input.reservation.currency ?? null,
            status: roomStatus,
            guestName: room.guest_name ?? guest.name,
            adults: room.adults ?? null,
            children: room.children ?? null,
            rawPayload: room.raw_payload,
          },
        });

        importedRoomIds.push(reservationRoom.id);
        seenExternalRoomReservationIds.add(room.external_room_reservation_id);
      }

      if (existing) {
        const staleRooms = existing.rooms.filter(
          (room) => !seenExternalRoomReservationIds.has(room.externalRoomReservationId),
        );
        const staleRoomIds = staleRooms.map((room) => room.id);

        for (const staleRoom of staleRooms) {
          if (this.isInventoryActiveStatus(staleRoom.status)) {
            await this.inventoryService.releaseInventory(tx, {
              propertyId: input.propertyId,
              roomCategoryId: staleRoom.roomCategoryId,
              checkInDate: staleRoom.arrivalDate,
              checkOutDate: staleRoom.departureDate,
              roomCount: 1,
            });
          }
        }

        if (staleRoomIds.length > 0) {
          await tx.reservationRoom.updateMany({
            where: {
              id: { in: staleRoomIds },
            },
            data: {
              status: BookingStatus.CANCELLED,
            },
          });
        }
      }

      await this.recomputeReservationGroupStatus(tx, reservationGroup.id, reservationStatus);

      await this.auditLogService.record({
        action: existing ? AuditAction.UPDATE : AuditAction.CREATE,
        entityType: 'reservation_group',
        entityId: reservationGroup.id,
        propertyId: input.propertyId,
        summary: `${existing ? 'Updated' : 'Imported'} Zodomus reservation ${input.reservation.external_reservation_id}`,
        metadata: {
          provider: ChannelProvider.ZODOMUS,
          external_reservation_id: input.reservation.external_reservation_id,
          room_count: input.reservation.rooms.length,
        },
      });

      return {
        action:
          reservationStatus === BookingStatus.CANCELLED
            ? ('cancelled' as const)
            : existing
              ? ('updated' as const)
              : ('created' as const),
        reservationGroupId: reservationGroup.id,
        reservationRoomIds: importedRoomIds,
      };
    });
  }

  private async reconcileInventoryForRoom(
    tx: Prisma.TransactionClient,
    input: {
      propertyId: string;
      existingRoom?: {
        roomCategoryId: string;
        arrivalDate: Date;
        departureDate: Date;
        status: BookingStatus;
      };
      nextRoomCategoryId: string;
      nextCheckInDate: Date;
      nextCheckOutDate: Date;
      nextStatus: BookingStatus;
    },
  ) {
    const hadActiveInventory = input.existingRoom && this.isInventoryActiveStatus(input.existingRoom.status);
    const needsActiveInventory = this.isInventoryActiveStatus(input.nextStatus);

    if (hadActiveInventory) {
      const sameAllocation =
        needsActiveInventory &&
        input.existingRoom!.roomCategoryId === input.nextRoomCategoryId &&
        this.sameDate(input.existingRoom!.arrivalDate, input.nextCheckInDate) &&
        this.sameDate(input.existingRoom!.departureDate, input.nextCheckOutDate);

      if (!sameAllocation) {
        await this.inventoryService.releaseInventory(tx, {
          propertyId: input.propertyId,
          roomCategoryId: input.existingRoom!.roomCategoryId,
          checkInDate: input.existingRoom!.arrivalDate,
          checkOutDate: input.existingRoom!.departureDate,
          roomCount: 1,
        });
      }
    }

    if (needsActiveInventory) {
      const alreadyAllocated =
        hadActiveInventory &&
        input.existingRoom!.roomCategoryId === input.nextRoomCategoryId &&
        this.sameDate(input.existingRoom!.arrivalDate, input.nextCheckInDate) &&
        this.sameDate(input.existingRoom!.departureDate, input.nextCheckOutDate);

      if (!alreadyAllocated) {
        await this.inventoryService.allocateInventory(tx, {
          propertyId: input.propertyId,
          roomCategoryId: input.nextRoomCategoryId,
          checkInDate: input.nextCheckInDate,
          checkOutDate: input.nextCheckOutDate,
          roomCount: 1,
        });
      }
    }
  }

  private resolveImportedRoomStatus(
    existingStatus: BookingStatus | undefined,
    externalStatus: BookingStatus,
  ) {
    if (externalStatus === BookingStatus.CANCELLED) {
      return BookingStatus.CANCELLED;
    }

    if (existingStatus === BookingStatus.CHECKED_IN || existingStatus === BookingStatus.CHECKED_OUT) {
      return existingStatus;
    }

    return BookingStatus.BOOKED;
  }

  private isInventoryActiveStatus(status?: BookingStatus) {
    return status === BookingStatus.BOOKED || status === BookingStatus.CHECKED_IN;
  }

  private async recomputeReservationGroupStatus(
    tx: Prisma.TransactionClient,
    reservationGroupId: string,
    fallbackStatus: BookingStatus,
  ) {
    const rooms = await tx.reservationRoom.findMany({
      where: { reservationGroupId },
      select: { status: true },
    });

    if (rooms.length === 0) {
      await tx.reservationGroup.update({
        where: { id: reservationGroupId },
        data: { status: fallbackStatus },
      });
      return;
    }

    const statuses = rooms.map((room) => room.status);
    let nextStatus: BookingStatus = BookingStatus.BOOKED;
    const settledStatuses = new Set<BookingStatus>([BookingStatus.CHECKED_OUT, BookingStatus.CANCELLED]);

    if (statuses.every((status) => status === BookingStatus.CANCELLED)) {
      nextStatus = BookingStatus.CANCELLED;
    } else if (statuses.every((status) => settledStatuses.has(status))) {
      nextStatus = BookingStatus.CHECKED_OUT;
    } else if (statuses.some((status) => status === BookingStatus.CHECKED_IN)) {
      nextStatus = BookingStatus.CHECKED_IN;
    }

    await tx.reservationGroup.update({
      where: { id: reservationGroupId },
      data: { status: nextStatus },
    });
  }

  private async resolveRoomMapping(
    tx: Prisma.TransactionClient,
    channelConnectionId: string,
    externalRoomId?: string | null,
  ) {
    if (!externalRoomId) {
      throw new NotFoundException('Reservation room is missing external room ID');
    }

    const mapping = await tx.channelRoomMapping.findUnique({
      where: {
        channelConnectionId_externalRoomId: {
          channelConnectionId,
          externalRoomId,
        },
      },
    });

    if (!mapping) {
      throw new NotFoundException(`No room mapping found for external room ID ${externalRoomId}`);
    }

    return mapping;
  }

  private async resolveRateMapping(
    tx: Prisma.TransactionClient,
    channelConnectionId: string,
    externalRoomId?: string | null,
    externalRateId?: string | null,
  ) {
    if (!externalRateId) {
      throw new NotFoundException('Reservation room is missing external rate ID');
    }

    const mapping =
      (externalRoomId
        ? await tx.channelRateMapping.findUnique({
            where: {
              channelConnectionId_externalRoomId_externalRateId: {
                channelConnectionId,
                externalRoomId,
                externalRateId,
              },
            },
          })
        : null) ??
      (await tx.channelRateMapping.findFirst({
        where: {
          channelConnectionId,
          externalRateId,
          externalRoomId: null,
        },
      }));

    if (!mapping) {
      if (externalRoomId) {
        throw new NotFoundException(
          `No rate mapping found for external room ID ${externalRoomId} and external rate ID ${externalRateId}`,
        );
      }

      throw new NotFoundException(`No rate mapping found for external rate ID ${externalRateId}`);
    }

    return mapping;
  }

  private async upsertImportedGuest(
    tx: Prisma.TransactionClient,
    input: {
      propertyId: string;
      name: string;
      phone?: string | null;
      email?: string | null;
    },
  ) {
    const phone = this.normalizeOptional(input.phone);
    const email = this.normalizeOptional(input.email);
    const name = input.name.trim() || 'Channel Guest';

    const existing =
      (phone
        ? await tx.guest.findFirst({
            where: {
              propertyId: input.propertyId,
              phone,
            },
          })
        : null) ??
      (email
        ? await tx.guest.findFirst({
            where: {
              propertyId: input.propertyId,
              email,
            },
          })
        : null) ??
      (name
        ? await tx.guest.findFirst({
            where: {
              propertyId: input.propertyId,
              name,
            },
          })
        : null);

    if (existing) {
      return tx.guest.update({
        where: { id: existing.id },
        data: {
          name,
          phone: phone ?? existing.phone,
          email: email ?? existing.email,
          idProof: existing.idProof,
          address: existing.address,
        },
      });
    }

    return tx.guest.create({
      data: {
        propertyId: input.propertyId,
        name,
        phone: phone ?? `unknown-${Date.now()}`,
        email,
        idProof: 'CHANNEL_IMPORT',
        address: 'Imported from Zodomus',
      },
    });
  }

  private async resolveRoomTotalAmount(
    tx: Prisma.TransactionClient,
    input: {
      reservation: NormalizedReservationRoom;
      propertyId: string;
      roomCategoryId: string;
      ratePlan: {
        id: string;
        baseRate: Prisma.Decimal;
        currency: string;
        pricingRules?: Array<{
          id: string;
          name: string;
          type: PricingRuleType;
          adjustmentPercent: Prisma.Decimal;
          startDate: Date | null;
          endDate: Date | null;
          occupancyThreshold: number | null;
          isActive: boolean;
        }>;
      };
      checkInDate: Date;
      checkOutDate: Date;
    },
  ) {
    const explicitAmount = this.normalizeNumber(input.reservation.total_amount);
    if (explicitAmount !== null) {
      return new Prisma.Decimal(explicitAmount);
    }

    const pricing = await this.pricingService.calculateStayPricing({
      db: tx,
      propertyId: input.propertyId,
      roomCategoryId: input.roomCategoryId,
      ratePlan: input.ratePlan,
      checkInDate: input.checkInDate,
      checkOutDate: input.checkOutDate,
    });

    return pricing.totalAmount;
  }

  private mapExternalStatus(status: string) {
    const normalized = status.trim().toLowerCase();

    if (['cancelled', 'canceled', 'void', 'closed'].includes(normalized)) {
      return BookingStatus.CANCELLED;
    }

    return BookingStatus.BOOKED;
  }

  private extractReservations(payload: Record<string, Prisma.JsonValue>) {
    const detailedReservations = this.readArray(payload.reservations);
    const queueItems =
      detailedReservations.length > 0
        ? detailedReservations
        : this.firstNonEmptyArray(
            this.readArray(payload.reservation_queue),
            this.readArray(payload.queue),
            this.readArray(payload.data),
          );

    return queueItems
      .map((item) => this.normalizeReservationGroup(item))
      .filter((item): item is NormalizedReservationGroup => item !== null);
  }

  private normalizeReservationGroup(value: Prisma.JsonValue): NormalizedReservationGroup | null {
    const record = this.readObject(value);
    const envelope = this.readObject(record.reservations);
    const reservationRecord =
      this.readObject(envelope.reservation) ||
      this.readObject(record.reservation) ||
      this.readObject(record.booking) ||
      record;
    const customerRecord =
      this.readObject(envelope.customer) ||
      this.readObject(record.customer) ||
      this.readObject(record.guest) ||
      this.readObject(record.contact);
    const roomRecords =
      this.readArray(envelope.rooms).length > 0
        ? this.readArray(envelope.rooms)
        : this.readArray(record.rooms);

    const externalReservationId = this.firstString(
      reservationRecord,
      'reservation_id',
      'reservationId',
      'id',
      'booking_id',
      'bookingId',
      'code',
    );
    const guestName =
      this.firstString(customerRecord, 'name', 'full_name') ??
      ([
        this.firstString(customerRecord, 'firstName', 'first_name'),
        this.firstString(customerRecord, 'lastName', 'last_name'),
      ]
        .filter(Boolean)
        .join(' ')
        .trim() || 'Channel Guest');

    const normalizedRooms = roomRecords
      .map((item, index) => this.normalizeReservationRoom(item, index, externalReservationId, guestName, reservationRecord))
      .filter((item): item is NormalizedReservationRoom => item !== null);

    if (!externalReservationId || normalizedRooms.length === 0) {
      return null;
    }

    return {
      external_reservation_id: externalReservationId,
      external_reservation_version:
        this.firstString(reservationRecord, 'modifiedAt', 'modified_at', 'updated_at', 'version', 'revision') ?? null,
      external_status: this.coerceString(reservationRecord.status) ?? 'booked',
      total_amount: this.firstNumber(reservationRecord, 'totalPrice', 'total_amount', 'total', 'amount'),
      currency:
        this.firstString(reservationRecord, 'currencyCode', 'currency_code', 'currency') ?? null,
      remarks: this.firstString(reservationRecord, 'remarks', 'note', 'notes') ?? null,
      booked_at: this.firstString(reservationRecord, 'bookedAt', 'booked_at', 'created_at') ?? null,
      modified_at: this.firstString(reservationRecord, 'modifiedAt', 'modified_at', 'updated_at') ?? null,
      source: this.firstString(reservationRecord, 'source') ?? ChannelProvider.ZODOMUS,
      guest_name: guestName,
      guest_phone:
        this.firstString(customerRecord, 'phone', 'mobile', 'telephone') ??
        this.firstString(record, 'guest_phone', 'phone') ??
        null,
      guest_email:
        this.firstString(customerRecord, 'email', 'mail') ??
        this.firstString(record, 'guest_email', 'email') ??
        null,
      raw_payload: JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue,
      rooms: normalizedRooms,
    };
  }

  private normalizeReservationRoom(
    value: Prisma.JsonValue,
    index: number,
    reservationId: string | null,
    defaultGuestName: string,
    reservationRecord: Record<string, Prisma.JsonValue>,
  ): NormalizedReservationRoom | null {
    const record = this.readObject(value);
    const priceEntries = this.readArray(record.prices);
    const firstPriceRecord = this.readObject(priceEntries[0]);
    const externalRoomId = this.firstString(record, 'id', 'roomId', 'room_id', 'external_room_id');
    const arrivalDate = this.firstDateString(record, 'arrivalDate', 'arrival_date', 'arrival');
    const departureDate = this.firstDateString(record, 'departureDate', 'departure_date', 'departure');

    if (!externalRoomId || !arrivalDate || !departureDate) {
      return null;
    }

    return {
      external_room_reservation_id:
        this.firstString(record, 'roomReservationId', 'room_reservation_id', 'reservationRoomId') ??
        `${reservationId ?? 'reservation'}:${index + 1}`,
      external_room_id: externalRoomId,
      external_rate_id:
        this.firstString(firstPriceRecord, 'rateId', 'rate_id', 'id') ??
        this.firstString(record, 'rateId', 'rate_id', 'external_rate_id') ??
        null,
      arrival_date: arrivalDate,
      departure_date: departureDate,
      total_amount:
        this.firstNumber(record, 'totalPrice', 'total_amount', 'amount') ??
        this.sumPrices(priceEntries),
      currency:
        this.firstString(record, 'currencyCode', 'currency_code', 'currency') ??
        this.firstString(reservationRecord, 'currencyCode', 'currency_code', 'currency') ??
        null,
      guest_name: this.firstString(record, 'guestName', 'guest_name') ?? defaultGuestName,
      adults:
        this.firstNumber(record, 'numberOfAdults', 'adults') ??
        this.sumGuestCount(record, true),
      children:
        this.firstNumber(record, 'numberOfChildren', 'numberOChildren', 'children') ??
        this.sumGuestCount(record, false),
      raw_payload: JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue,
    };
  }

  private parseDateOnly(value: string) {
    return new Date(`${value}T00:00:00.000Z`);
  }

  private sameDate(left: Date, right: Date) {
    return left.toISOString().slice(0, 10) === right.toISOString().slice(0, 10);
  }

  private parseTimestamp(value?: string | null) {
    const normalized = value?.trim();
    if (!normalized) {
      return null;
    }

    const direct = new Date(normalized.replace(' ', 'T').endsWith('Z') ? normalized.replace(' ', 'T') : `${normalized.replace(' ', 'T')}Z`);
    return Number.isNaN(direct.getTime()) ? null : direct;
  }

  private calculateNights(checkInDate: Date, checkOutDate: Date) {
    const millisecondsPerNight = 24 * 60 * 60 * 1000;
    const nights = (checkOutDate.getTime() - checkInDate.getTime()) / millisecondsPerNight;

    if (!Number.isInteger(nights) || nights < 1) {
      throw new NotFoundException('Imported reservation has an invalid date range');
    }

    return nights;
  }

  private readObject(value: Prisma.JsonValue | null | undefined) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, Prisma.JsonValue>)
      : {};
  }

  private readArray(value: Prisma.JsonValue | null | undefined) {
    if (Array.isArray(value)) {
      return value;
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const record = value as Record<string, Prisma.JsonValue>;
      if (Array.isArray(record.items)) {
        return record.items;
      }
      if (Array.isArray(record.reservations)) {
        return record.reservations;
      }
      if (Array.isArray(record.data)) {
        return record.data;
      }
    }

    return [];
  }

  private firstString(record: Record<string, Prisma.JsonValue>, ...keys: string[]) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return null;
  }

  private coerceString(value: Prisma.JsonValue | undefined) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }

    return null;
  }

  private firstNumber(record: Record<string, Prisma.JsonValue>, ...keys: string[]) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string' && value.trim() && !Number.isNaN(Number(value))) {
        return Number(value);
      }
    }

    return null;
  }

  private firstDateString(record: Record<string, Prisma.JsonValue>, ...keys: string[]) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value !== 'string' || !value.trim()) {
        continue;
      }

      const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  private normalizeOptional(value?: string | null) {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private normalizeNumber(value?: number | null) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private toDecimal(value?: number | null) {
    const normalized = this.normalizeNumber(value);
    return normalized === null ? null : new Prisma.Decimal(normalized);
  }

  private firstNonEmptyArray(...candidates: Prisma.JsonValue[][]) {
    for (const candidate of candidates) {
      if (candidate.length > 0) {
        return candidate;
      }
    }

    return [];
  }

  private sumPrices(entries: Prisma.JsonValue[]) {
    const amounts = entries
      .map((entry) => this.readObject(entry))
      .map((entry) => this.firstNumber(entry, 'price', 'amount'))
      .filter((value): value is number => value !== null);

    if (amounts.length === 0) {
      return null;
    }

    return amounts.reduce((sum, value) => sum + value, 0);
  }

  private sumGuestCount(record: Record<string, Prisma.JsonValue>, adults: boolean) {
    const guestCounts = this.readArray(record.guestCount);
    if (guestCounts.length === 0) {
      return null;
    }

    let total = 0;

    for (const item of guestCounts) {
      const guestCount = this.readObject(item);
      const isAdult = this.firstNumber(guestCount, 'adult');
      const count = this.firstNumber(guestCount, 'count');
      if (isAdult === null || count === null) {
        continue;
      }

      if ((adults && isAdult > 0) || (!adults && isAdult === 0)) {
        total += count;
      }
    }

    return total > 0 ? total : null;
  }
}
