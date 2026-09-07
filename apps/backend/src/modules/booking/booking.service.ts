import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditAction,
  BookingStatus,
  ChannelConnectionStatus,
  ChannelProvider,
  ChannelSyncType,
  HousekeepingPriority,
  HousekeepingStatus,
  PaymentStatus,
  PaymentProvider,
  PaymentTransactionStatus,
  Prisma,
  RoomStatus,
} from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { BackgroundJobService } from '../background-job/background-job.service';
import { paginatedResponse, paginationParams } from '../../common/pagination/paginated-response';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthenticatedUser } from '../auth/auth.guard';
import { assertCanAccessProperty, propertyIdFilter } from '../auth/property-scope';
import { InventoryService } from '../inventory/inventory.service';
import { PaymentProviderService } from '../payment/payment-provider.service';
import { PricingService } from '../pricing/pricing.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CheckInReservationRoomDto } from './dto/check-in-reservation-room.dto';
import { CreateDirectReservationDto } from './dto/create-direct-reservation.dto';
import { FindReservationFeedQueryDto } from './dto/find-reservation-feed-query.dto';
import { FindReservationGroupsQueryDto } from './dto/find-reservation-groups-query.dto';
import { UpdateDirectReservationDto } from './dto/update-direct-reservation.dto';

type ReservationGroupWithRelations = Prisma.ReservationGroupGetPayload<{
  include: {
    property: true;
    primaryGuest: true;
    channelConnection: true;
    rooms: {
      include: {
        roomCategory: true;
        ratePlan: true;
        room: true;
      };
    };
  };
}>;

type DirectAdvancePaymentSummary = {
  amount: Prisma.Decimal;
  paymentCount: number;
  provider: string;
  providerReferences: string[];
};

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
  is_editable: boolean;
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
    id_proof?: string | null;
    address?: string | null;
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
    private readonly paymentProviderService: PaymentProviderService,
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

    const advanceAmount = dto.advance_amount ? new Prisma.Decimal(dto.advance_amount) : null;
    if (advanceAmount && advanceAmount.lte(0)) {
      throw new BadRequestException('Advance payment amount must be greater than zero');
    }
    const advanceProvider = dto.advance_payment_provider ?? PaymentProvider.CASH;
    const supportedAdvanceProviders: PaymentProvider[] = [
      PaymentProvider.MOCK,
      PaymentProvider.CASH,
      PaymentProvider.CARD,
      PaymentProvider.UPI,
    ];
    if (advanceAmount && !supportedAdvanceProviders.includes(advanceProvider)) {
      throw new BadRequestException('Walk-in advance payment supports CASH, CARD, UPI, or MOCK only');
    }

    let reservationGroup: ReservationGroupWithRelations;
    let advancePayment: DirectAdvancePaymentSummary | null = null;
    try {
      const result = await this.prisma.$transaction(
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
          const adults = dto.adults ?? 1;
          const children = dto.children ?? 0;

          await this.inventoryService.allocateInventory(tx, {
            propertyId: dto.property_id,
            roomCategoryId: roomCategory.id,
            checkInDate,
            checkOutDate,
            roomCount,
          });

          const reservationReference = await this.generateDirectReservationReference(tx, property.code);
          const totalAmount = pricing.totalAmount.mul(new Prisma.Decimal(roomCount));
          if (advanceAmount && advanceAmount.gt(totalAmount)) {
            throw new BadRequestException('Advance payment amount exceeds reservation total');
          }

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
                adults,
                children,
                check_in_time: dto.check_in_time ?? property.defaultCheckInTime,
                check_out_time: dto.check_out_time ?? property.defaultCheckOutTime,
              } satisfies Prisma.InputJsonObject,
            },
          });

          let remainingAdvance = advanceAmount;
          const providerReferences: string[] = [];
          let paymentCount = 0;

          for (let index = 0; index < roomCount; index += 1) {
            const reservationRoom = await tx.reservationRoom.create({
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
                adults,
                children,
                rawPayload: {
                  mode: 'direct_reservation_room',
                  line_number: index + 1,
                  adults,
                  children,
                  check_in_time: dto.check_in_time ?? property.defaultCheckInTime,
                  check_out_time: dto.check_out_time ?? property.defaultCheckOutTime,
                } satisfies Prisma.InputJsonObject,
              },
            });

            if (advanceAmount) {
              const allocation =
                remainingAdvance && remainingAdvance.gt(0)
                  ? remainingAdvance.lessThan(pricing.totalAmount)
                    ? remainingAdvance
                    : pricing.totalAmount
                  : null;
              if (!allocation) {
                continue;
              }

              const billing = await tx.billing.create({
                data: {
                  reservationRoomId: reservationRoom.id,
                  amount: allocation,
                  tax: new Prisma.Decimal(0),
                  total: allocation,
                  paymentStatus: PaymentStatus.PAID,
                },
              });

              const providerResult = await this.paymentProviderService.collect({
                amount: allocation.toFixed(2),
                provider: advanceProvider,
                providerReference: dto.advance_payment_reference
                  ? `${dto.advance_payment_reference}:${group.id}:${index + 1}`
                  : undefined,
              });

              await tx.paymentTransaction.create({
                data: {
                  billingId: billing.id,
                  amount: allocation,
                  provider: advanceProvider,
                  providerReference: providerResult.provider_reference,
                  status: providerResult.status,
                  metadata: {
                    ...providerResult.metadata,
                    mode: 'direct_reservation_advance',
                    reservation_group_id: group.id,
                  },
                },
              });

              if (providerResult.status !== PaymentTransactionStatus.SUCCEEDED) {
                await tx.billing.update({
                  where: { id: billing.id },
                  data: { paymentStatus: PaymentStatus.PENDING },
                });
              }

              paymentCount += 1;
              providerReferences.push(providerResult.provider_reference);
              remainingAdvance = remainingAdvance!.sub(allocation);
            }
          }

          const reservationGroup = await tx.reservationGroup.findUniqueOrThrow({
            where: { id: group.id },
            include: {
              property: true,
              primaryGuest: true,
              channelConnection: true,
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

          return {
            reservationGroup,
            advancePayment: advanceAmount
              ? {
                  amount: advanceAmount,
                  paymentCount,
                  provider: advanceProvider,
                  providerReferences,
                }
              : null,
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      reservationGroup = result.reservationGroup;
      advancePayment = result.advancePayment;
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

    if (advancePayment) {
      await this.auditLogService.record({
        action: AuditAction.PAYMENT_COLLECT,
        entityType: 'reservation_group_folio',
        entityId: reservationGroup.id,
        propertyId: reservationGroup.propertyId,
        summary: `Collected advance ${advancePayment.amount.toString()} against ${reservationGroup.externalReservationId}`,
        metadata: {
          reservation_group_id: reservationGroup.id,
          external_reservation_id: reservationGroup.externalReservationId,
          payment_count: advancePayment.paymentCount,
          provider: advancePayment.provider,
          provider_references: advancePayment.providerReferences,
        },
        user,
      });
    }

    await this.queueDirectReservationNotifications(reservationGroup);
    await this.backgroundJobService.queueInventorySyncsForProperty(reservationGroup.propertyId, {
      trigger: 'direct_reservation_created',
      from: this.formatDateOnly(checkInDate),
      to: this.formatDateOnly(this.addDays(checkOutDate, -1)),
    });

    return this.toReservationGroupResponse(reservationGroup);
  }

  async updateDirectReservation(id: string, dto: UpdateDirectReservationDto, user?: AuthenticatedUser) {
    assertCanAccessProperty(user, dto.property_id);
    const checkInDate = this.parseDateOnly(dto.check_in_date, 'check_in_date');
    const checkOutDate = this.parseDateOnly(dto.check_out_date, 'check_out_date');
    if (checkOutDate <= checkInDate) throw new ConflictException('check_out_date must be after check_in_date');

    const updated = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.reservationGroup.findUnique({
        where: { id },
        include: {
          property: true,
          primaryGuest: true,
          channelConnection: true,
          rooms: {
            include: { roomCategory: true, ratePlan: true, room: true },
            orderBy: [{ arrivalDate: 'asc' }, { createdAt: 'asc' }],
          },
        },
      });
      if (!existing) throw new NotFoundException('Reservation not found');
      assertCanAccessProperty(user, existing.propertyId);
      if (!this.isEditableDirectReservation(existing)) {
        throw new ConflictException('Only manually created direct reservations can be edited');
      }
      if (existing.propertyId !== dto.property_id) {
        throw new ConflictException('Reservation property cannot be changed');
      }
      if (existing.status !== BookingStatus.BOOKED || existing.rooms.some((room) => room.status !== BookingStatus.BOOKED)) {
        throw new ConflictException('Only booked direct reservations can be edited before check-in');
      }

      const requestedRoomCount = dto.room_count ?? existing.rooms.length;
      if (requestedRoomCount !== existing.rooms.length) {
        throw new ConflictException('Room count cannot be changed after creation yet');
      }

      const [roomCategory, ratePlan] = await Promise.all([
        tx.roomCategory.findUnique({ where: { id: dto.room_category_id } }),
        tx.ratePlan.findUnique({
          where: { id: dto.rate_plan_id },
          include: { pricingRules: { where: { isActive: true }, orderBy: { createdAt: 'asc' } } },
        }),
      ]);
      if (!roomCategory || roomCategory.propertyId !== dto.property_id) throw new NotFoundException('Room category not found for this property');
      if (!ratePlan || ratePlan.propertyId !== dto.property_id || ratePlan.roomCategoryId !== roomCategory.id) {
        throw new NotFoundException('Rate plan not found for this room category');
      }

      for (const room of existing.rooms) {
        await this.inventoryService.releaseInventory(tx, {
          propertyId: existing.propertyId,
          roomCategoryId: room.roomCategoryId,
          checkInDate: room.arrivalDate,
          checkOutDate: room.departureDate,
          roomCount: 1,
        });
      }

      await this.inventoryService.allocateInventory(tx, {
        propertyId: dto.property_id,
        roomCategoryId: roomCategory.id,
        checkInDate,
        checkOutDate,
        roomCount: existing.rooms.length,
      });

      const guest = await this.resolveUpdatedDirectGuest(tx, existing.primaryGuestId, dto);
      const pricing = await this.pricingService.calculateStayPricing({
        db: tx,
        propertyId: dto.property_id,
        roomCategoryId: roomCategory.id,
        ratePlan,
        checkInDate,
        checkOutDate,
      });
      const adults = dto.adults ?? 1;
      const children = dto.children ?? 0;
      const groupTotal = pricing.totalAmount.mul(new Prisma.Decimal(existing.rooms.length));

      await tx.reservationGroup.update({
        where: { id },
        data: {
          primaryGuestId: guest.id,
          currency: pricing.currency,
          totalAmount: groupTotal,
          remarks: dto.remarks?.trim() || null,
          modifiedAt: new Date(),
          rawPayload: {
            ...(this.readObject(existing.rawPayload) as Prisma.InputJsonObject),
            edited_at: new Date().toISOString(),
            edited_by_user_id: user?.sub ?? null,
          },
        },
      });

      for (const [index, room] of existing.rooms.entries()) {
        await tx.reservationRoom.update({
          where: { id: room.id },
          data: {
            externalRoomId: `DIRECT:${roomCategory.code}`,
            roomCategoryId: roomCategory.id,
            ratePlanId: ratePlan.id,
            arrivalDate: checkInDate,
            departureDate: checkOutDate,
            totalAmount: pricing.totalAmount,
            currency: pricing.currency,
            guestName: guest.name,
            adults,
            children,
            rawPayload: {
              mode: 'direct_reservation_room',
              line_number: index + 1,
              adults,
              children,
              check_in_time: dto.check_in_time ?? existing.property.defaultCheckInTime,
              check_out_time: dto.check_out_time ?? existing.property.defaultCheckOutTime,
              edited_at: new Date().toISOString(),
            } satisfies Prisma.InputJsonObject,
          },
        });
      }

      return tx.reservationGroup.findUniqueOrThrow({
        where: { id },
        include: {
          property: true,
          primaryGuest: true,
          channelConnection: true,
          rooms: { include: { roomCategory: true, ratePlan: true, room: true }, orderBy: [{ arrivalDate: 'asc' }, { createdAt: 'asc' }] },
        },
      });
    });

    await this.auditLogService.record({
      action: AuditAction.UPDATE,
      entityType: 'reservation_group',
      entityId: updated.id,
      propertyId: updated.propertyId,
      summary: `Updated direct reservation ${updated.externalReservationId}`,
      metadata: { source: updated.source, room_count: updated.rooms.length },
      user,
    });

    await this.backgroundJobService.queueInventorySyncsForProperty(updated.propertyId, {
      trigger: 'direct_reservation_updated',
      from: this.formatDateOnly(checkInDate),
      to: this.formatDateOnly(this.addDays(checkOutDate, -1)),
    });

    return this.toReservationGroupResponse(updated);
  }

  async findReservationGroups(query: FindReservationGroupsQueryDto, user?: AuthenticatedUser) {
    const { page, limit, skip, take } = paginationParams(query);
    const scopedPropertyId = propertyIdFilter(user);
    if (query.property_id) {
      assertCanAccessProperty(user, query.property_id);
    }

    const effectivePropertyId = query.property_id ?? scopedPropertyId ?? null;
    const search = query.search?.trim();
    const dateWindow = this.reservationFeedDateWindow(query.date_from, query.date_to);
    const roomFilters: Prisma.ReservationRoomWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...this.reservationRoomDateWindowWhere(dateWindow),
    };
    const where: Prisma.ReservationGroupWhereInput = {
      ...(effectivePropertyId ? { propertyId: effectivePropertyId } : {}),
      ...(Object.keys(roomFilters).length > 0 ? { rooms: { some: roomFilters } } : {}),
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
          channelConnection: true,
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
    const includeCancelled = query.include_cancelled ?? false;
    const dateWindow = this.reservationFeedDateWindow(query.date_from, query.date_to);
    const importedWhere = this.reservationFeedImportedWhere(effectivePropertyId, search, statusFilter, includeCancelled, dateWindow);
    const importedTake = page * limit;

    const [groups, importedTotal] = await this.prisma.$transaction([
      this.prisma.reservationGroup.findMany({
        where: importedWhere,
        include: {
          property: true,
          primaryGuest: true,
          channelConnection: true,
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
    const providerOnlyResponses = this.shouldShowProviderOnlyReservationFailures()
      ? await this.findProviderOnlyReservationFailures(
          effectivePropertyId,
          importedReservationIds,
          search,
          statusFilter,
          includeCancelled,
          dateWindow,
        )
      : [];

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

  async checkInReservationRoom(id: string, dto: CheckInReservationRoomDto, user?: AuthenticatedUser) {
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

      await this.inventoryService.acquireInventoryAllocationLock(
        tx,
        existingRoomLine.propertyId,
        existingRoomLine.roomCategoryId,
      );

      const roomAvailabilityWhere = {
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
      } satisfies Prisma.RoomWhereInput;

      const assignedRoom = dto.room_id
        ? await tx.room.findFirst({
            where: {
              ...roomAvailabilityWhere,
              id: dto.room_id,
            },
          })
        : existingRoomLine.room ??
          (await tx.room.findFirst({
            where: roomAvailabilityWhere,
            orderBy: {
              roomNumber: 'asc',
            },
          }));

      if (!assignedRoom) {
        throw new ConflictException(
          dto.room_id
            ? 'Selected room is not available to assign for this room stay'
            : 'No physical room available to assign for this imported room stay',
        );
      }

      const claimedRoom = await tx.room.updateMany({
        where: {
          id: assignedRoom.id,
          status: RoomStatus.AVAILABLE,
        },
        data: {
          status: RoomStatus.OCCUPIED,
        },
      });
      if (claimedRoom.count !== 1) {
        throw new ConflictException('Physical room was assigned by another check-in. Please retry.');
      }

      const updated = await tx.reservationRoom.update({
        where: { id },
        data: {
          status: BookingStatus.CHECKED_IN,
          roomId: assignedRoom.id,
          checkedInAt: new Date(),
          checkedOutAt: null,
        },
        include: {
          reservationGroup: true,
          roomCategory: true,
          ratePlan: true,
          room: true,
        },
      });

      await this.recomputeReservationGroupStatus(tx, updated.reservationGroupId);
      await this.ensureReservationRoomBilling(tx, updated);

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
          checkedOutAt: new Date(),
        },
        include: {
          reservationGroup: true,
          roomCategory: true,
          ratePlan: true,
          room: true,
        },
      });

      await this.ensureReservationRoomBilling(tx, updated);

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

  private async queueDirectReservationNotifications(reservationGroup: ReservationGroupWithRelations) {
    const firstRoom = reservationGroup.rooms[0];
    if (!firstRoom) {
      return;
    }

    const lastDeparture = reservationGroup.rooms.reduce<Date>(
      (latest, room) => (room.departureDate > latest ? room.departureDate : latest),
      firstRoom.departureDate,
    );

    await this.enqueueNotification(
      reservationGroup.propertyId,
      `direct-owner-reservation:${reservationGroup.id}`,
      'owner_reservation_notification',
      {
        owner_phone: reservationGroup.property.phone,
        property_name: reservationGroup.property.name,
        guest_name: reservationGroup.primaryGuest?.name ?? 'Guest',
        guest_phone: reservationGroup.primaryGuest?.phone ?? 'Guest phone unavailable',
        room_category_name: this.describeDirectReservationRooms(reservationGroup),
        check_in_date: firstRoom.arrivalDate.toISOString(),
        check_out_date: lastDeparture.toISOString(),
        total_amount: reservationGroup.totalAmount?.toString() ?? '0.00',
      },
    );
  }

  private describeDirectReservationRooms(reservationGroup: ReservationGroupWithRelations) {
    const firstCategoryName = reservationGroup.rooms[0]?.roomCategory.name?.trim();
    const baseLabel = firstCategoryName || 'Room';
    return reservationGroup.rooms.length > 1 ? `${baseLabel} x${reservationGroup.rooms.length}` : baseLabel;
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

  private async resolveUpdatedDirectGuest(
    tx: Prisma.TransactionClient,
    existingGuestId: string | null,
    dto: UpdateDirectReservationDto,
  ) {
    if (dto.guest_id) return this.resolveDirectGuest(tx, dto);
    if (!dto.guest) throw new ConflictException('guest is required when guest_id is not provided');

    if (existingGuestId) {
      const existingGuest = await tx.guest.findUnique({ where: { id: existingGuestId } });
      if (existingGuest?.propertyId === dto.property_id) {
        return tx.guest.update({
          where: { id: existingGuestId },
          data: {
            name: dto.guest.name.trim(),
            phone: dto.guest.phone.trim(),
            email: dto.guest.email?.trim() || null,
            idProof: dto.guest.id_proof.trim(),
            address: dto.guest.address.trim(),
          },
        });
      }
    }

    return this.resolveDirectGuest(tx, dto);
  }

  private async generateDirectReservationReference(tx: Prisma.TransactionClient, propertyCode?: string | null) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const candidate = this.buildDirectReservationReference(propertyCode);
      const existing = await tx.reservationGroup.findFirst({
        where: {
          channelConnectionId: null,
          externalReservationId: candidate,
        },
        select: { id: true },
      });
      if (!existing) {
        return candidate;
      }
    }

    throw new ConflictException('Unable to generate a unique direct reservation reference');
  }

  private buildDirectReservationReference(propertyCode?: string | null, now = new Date()) {
    const code = this.normalizeDirectReservationPropertyCode(propertyCode);
    const date = this.formatDirectReservationReferenceDate(now);
    const suffix = this.generateDirectReservationSuffix();
    return `${code}-D-${date}-${suffix}`;
  }

  private normalizeDirectReservationPropertyCode(propertyCode?: string | null) {
    const normalized = propertyCode?.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 4);
    return normalized || 'DIR';
  }

  private formatDirectReservationReferenceDate(value: Date) {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      year: '2-digit',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(value);
    const day = parts.find((part) => part.type === 'day')?.value ?? '00';
    const month = parts.find((part) => part.type === 'month')?.value ?? '00';
    const year = parts.find((part) => part.type === 'year')?.value ?? '00';
    return `${year}${month}${day}`;
  }

  private generateDirectReservationSuffix() {
    return randomBytes(3).toString('hex').toUpperCase().slice(0, 4);
  }

  private parseDateOnly(value: string, field: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new ConflictException(`${field} must use YYYY-MM-DD format`);
    }

    return new Date(`${value}T00:00:00.000Z`);
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  private formatDateOnly(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private toReservationGroupResponse(group: ReservationGroupWithRelations) {
    const roomsForStayWindow = this.roomsForStayWindow(group.rooms);
    const roomArrivalDates = roomsForStayWindow.map((room) => room.arrivalDate.toISOString().slice(0, 10)).sort();
    const roomDepartureDates = roomsForStayWindow.map((room) => room.departureDate.toISOString().slice(0, 10)).sort();
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
      source: this.reservationSourceLabel(group),
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
      is_editable: this.isEditableDirectReservation(group),
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
            id_proof: group.primaryGuest.idProof,
            address: group.primaryGuest.address,
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
        checked_in_at: room.checkedInAt?.toISOString() ?? null,
        checked_out_at: room.checkedOutAt?.toISOString() ?? null,
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

  private reservationSourceLabel(group: ReservationGroupWithRelations) {
    return this.connectionSourceLabel(group.channelConnection) ?? group.source;
  }

  private isEditableDirectReservation(group: ReservationGroupWithRelations) {
    const rawPayload = this.readObject(group.rawPayload);
    return (
      !group.channelConnectionId &&
      (group.source === 'DIRECT' || group.source === 'WALK_IN') &&
      rawPayload.mode === 'direct_reservation'
    );
  }

  private connectionSourceLabel(
    connection: {
      id?: string | null;
      propertyId?: string | null;
      provider?: ChannelProvider | null;
      name?: string | null;
      credentials?: Prisma.JsonValue | null;
    } | null,
  ) {
    if (!connection) {
      return null;
    }

    if (connection.provider && connection.provider !== ChannelProvider.ZODOMUS) {
      return connection.name || connection.provider;
    }

    const credentials = this.readObject(connection.credentials ?? null);
    const otaName = this.firstString(credentials, 'ota_name');
    return otaName ?? connection.name ?? connection.provider ?? null;
  }

  private async findProviderOnlyReservationFailures(
    scopedPropertyId: string | Prisma.StringFilter | null,
    importedReservationIds: Set<string>,
    search: string,
    statusFilter?: BookingStatus,
    includeCancelled = false,
    dateWindow?: { from?: Date; toExclusive?: Date },
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

        if (!statusFilter && !includeCancelled && response.reservation_status === BookingStatus.CANCELLED) {
          continue;
        }

        if (dateWindow && !this.reservationGroupOverlapsDateWindow(response, dateWindow)) {
          continue;
        }

        providerOnlyReservations.push(response);
      }
    }

    return providerOnlyReservations;
  }

  private reservationGroupOverlapsDateWindow(
    group: ReservationGroupResponse,
    dateWindow: { from?: Date; toExclusive?: Date },
  ) {
    const roomsForWindow = this.responseRoomsForStayWindow(group.rooms);
    return roomsForWindow.some((room) => {
      const arrival = this.parseFeedDateOnly(room.arrival_date);
      const departure = this.parseFeedDateOnly(room.departure_date);
      return (!dateWindow.toExclusive || arrival < dateWindow.toExclusive) && (!dateWindow.from || departure > dateWindow.from);
    });
  }

  private reservationFeedImportedWhere(
    propertyId: string | Prisma.StringFilter | null,
    search: string,
    status?: BookingStatus,
    includeCancelled = false,
    dateWindow?: { from?: Date; toExclusive?: Date },
  ): Prisma.ReservationGroupWhereInput {
    const where: Prisma.ReservationGroupWhereInput = {
      ...(propertyId ? { propertyId } : {}),
      ...(status ? { status } : includeCancelled ? {} : { status: { not: BookingStatus.CANCELLED } }),
      ...(dateWindow?.from || dateWindow?.toExclusive
        ? {
            rooms: {
              some: {
                ...(includeCancelled || status === BookingStatus.CANCELLED ? {} : { status: { not: BookingStatus.CANCELLED } }),
                ...this.reservationRoomDateWindowWhere(dateWindow),
              },
            },
          }
        : {}),
    };

    const andFilters: Prisma.ReservationGroupWhereInput[] = [];
    const visibilityWhere = this.reservationFeedConnectionVisibilityWhere();
    if (Object.keys(visibilityWhere).length > 0) {
      andFilters.push(visibilityWhere);
    }

    if (search) {
      andFilters.push({
        OR: [
          { externalReservationId: { contains: search, mode: 'insensitive' } },
          { property: { name: { contains: search, mode: 'insensitive' } } },
          { primaryGuest: { name: { contains: search, mode: 'insensitive' } } },
          { rooms: { some: { guestName: { contains: search, mode: 'insensitive' } } } },
          { rooms: { some: { externalRoomId: { contains: search, mode: 'insensitive' } } } },
          { rooms: { some: { roomCategory: { name: { contains: search, mode: 'insensitive' } } } } },
        ],
      });
    }

    return andFilters.length > 0 ? { ...where, AND: andFilters } : where;
  }

  private reservationFeedConnectionVisibilityWhere(): Prisma.ReservationGroupWhereInput {
    if (this.shouldShowDetachedOtaReservationHistory()) {
      return {};
    }

    return {
      OR: [
        { channelConnection: { is: { status: ChannelConnectionStatus.ACTIVE } } },
        {
          channelConnectionId: null,
          source: { in: ['DIRECT', 'WALK_IN'] },
        },
      ],
    };
  }

  private reservationRoomDateWindowWhere(dateWindow?: { from?: Date; toExclusive?: Date }): Prisma.ReservationRoomWhereInput {
    if (!dateWindow?.from && !dateWindow?.toExclusive) return {};

    return {
      OR: [
        {
          ...(dateWindow.toExclusive ? { arrivalDate: { lt: dateWindow.toExclusive } } : {}),
          ...(dateWindow.from ? { departureDate: { gt: dateWindow.from } } : {}),
        },
        {
          checkedInAt: {
            ...(dateWindow.from ? { gte: dateWindow.from } : {}),
            ...(dateWindow.toExclusive ? { lt: dateWindow.toExclusive } : {}),
          },
        },
        {
          checkedOutAt: {
            ...(dateWindow.from ? { gte: dateWindow.from } : {}),
            ...(dateWindow.toExclusive ? { lt: dateWindow.toExclusive } : {}),
          },
        },
      ],
    };
  }

  private shouldShowDetachedOtaReservationHistory() {
    return (
      process.env.SHOW_DETACHED_OTA_RESERVATION_HISTORY === 'true' ||
      process.env.ZODOMUS_ENVIRONMENT?.trim() === 'production'
    );
  }

  private shouldShowProviderOnlyReservationFailures() {
    return (
      process.env.SHOW_PROVIDER_ONLY_RESERVATION_FAILURES === 'true' ||
      process.env.ZODOMUS_ENVIRONMENT?.trim() === 'production'
    );
  }

  private roomsForStayWindow<T extends { status: BookingStatus }>(rooms: T[]) {
    const nonCancelledRooms = rooms.filter((room) => room.status !== BookingStatus.CANCELLED);
    return nonCancelledRooms.length > 0 ? nonCancelledRooms : rooms;
  }

  private responseRoomsForStayWindow<T extends { reservation_status: BookingStatus }>(rooms: T[]) {
    const nonCancelledRooms = rooms.filter((room) => room.reservation_status !== BookingStatus.CANCELLED);
    return nonCancelledRooms.length > 0 ? nonCancelledRooms : rooms;
  }

  private reservationFeedDateWindow(dateFrom?: string, dateTo?: string) {
    const from = dateFrom ? this.parseFeedDateOnly(dateFrom) : undefined;
    const toExclusive = dateTo ? this.addUtcDays(this.parseFeedDateOnly(dateTo), 1) : undefined;
    if (!from && !toExclusive) {
      return undefined;
    }

    return { from, toExclusive };
  }

  private parseFeedDateOnly(value: string) {
    return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  }

  private addUtcDays(date: Date, days: number) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
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
      source: this.connectionSourceLabel(input.connection) ?? 'ZODOMUS',
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
      is_editable: false,
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

  private async ensureReservationRoomBilling(
    tx: Prisma.TransactionClient,
    reservationRoom: {
      id: string;
      totalAmount: Prisma.Decimal | null;
    },
  ) {
    const existingBilling = await tx.billing.findUnique({
      where: { reservationRoomId: reservationRoom.id },
      include: {
        payments: true,
      },
    });

    const amount = reservationRoom.totalAmount ?? new Prisma.Decimal(0);

    if (existingBilling) {
      const succeededTotal = existingBilling.payments
        .filter((payment) => payment.status === PaymentTransactionStatus.SUCCEEDED)
        .reduce((total, payment) => total.add(payment.amount), new Prisma.Decimal(0));
      const refundedTotal = existingBilling.payments
        .filter((payment) => payment.status === PaymentTransactionStatus.REFUNDED)
        .reduce((total, payment) => total.add(payment.amount), new Prisma.Decimal(0));
      const netPaid = succeededTotal.sub(refundedTotal);

      return tx.billing.update({
        where: { id: existingBilling.id },
        data: {
          amount,
          total: amount.add(existingBilling.tax),
          paymentStatus: netPaid.lte(0)
            ? PaymentStatus.PENDING
            : netPaid.gte(amount.add(existingBilling.tax))
              ? PaymentStatus.PAID
              : PaymentStatus.PARTIAL,
        },
      });
    }

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
    checkedInAt: Date | null;
    checkedOutAt: Date | null;
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
      checked_in_at: room.checkedInAt?.toISOString() ?? null,
      checked_out_at: room.checkedOutAt?.toISOString() ?? null,
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
