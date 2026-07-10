import { BadRequestException, Injectable } from '@nestjs/common';
import {
  BookingStatus,
  ChannelConnectionStatus,
  PaymentTransactionStatus,
  Prisma,
  RoomStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.guard';
import { assertCanAccessProperty, propertyIdFilter } from '../auth/property-scope';
import { DashboardService } from '../dashboard/dashboard.service';
import { GetOperationsBoardDto } from './dto/get-operations-board.dto';

@Injectable()
export class OperationsBoardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboardService: DashboardService,
  ) {}

  async getBoard(query: GetOperationsBoardDto, user?: AuthenticatedUser) {
    const boardDate = query.date ? this.parseDate(query.date, 'date') : this.startOfDay(new Date());
    const boardDateText = this.formatDate(boardDate);
    const requestedPropertyId = query.property_id && query.property_id !== 'ALL' ? query.property_id : undefined;
    if (requestedPropertyId) assertCanAccessProperty(user, requestedPropertyId);

    const scopedPropertyId = requestedPropertyId ?? propertyIdFilter(user);
    const accessiblePropertyFilter = propertyIdFilter(user);
    const propertyWhere: Prisma.PropertyWhereInput = accessiblePropertyFilter ? { id: accessiblePropertyFilter } : {};
    const reservationGroupVisibilityWhere = this.reservationGroupVisibilityWhere();
    const reservationRoomVisibilityWhere = this.reservationRoomVisibilityWhere();
    const lateArrivalStart = this.addDays(boardDate, -2);

    const operationalRoomWhere: Prisma.ReservationRoomWhereInput = {
      ...reservationRoomVisibilityWhere,
      propertyId: scopedPropertyId,
      OR: [
        {
          status: { in: [BookingStatus.BOOKED, BookingStatus.CHECKED_IN] },
          departureDate: { gte: lateArrivalStart },
        },
        {
          status: BookingStatus.CHECKED_OUT,
          departureDate: boardDate,
        },
      ],
    };

    const [dashboard, properties, reservationGroups, rooms, housekeepingTasks] = await Promise.all([
      this.dashboardService.getSummary(boardDate, user),
      this.prisma.property.findMany({
        where: propertyWhere,
        include: { images: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.reservationGroup.findMany({
        where: {
          ...reservationGroupVisibilityWhere,
          propertyId: scopedPropertyId,
          rooms: { some: operationalRoomWhere },
        },
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
            orderBy: { arrivalDate: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.room.findMany({
        where: {
          propertyId: scopedPropertyId,
          status: { in: [RoomStatus.AVAILABLE, RoomStatus.OCCUPIED] },
        },
        include: {
          property: { select: { id: true, name: true, code: true } },
          roomCategory: { select: { id: true, name: true, code: true } },
        },
        orderBy: { roomNumber: 'asc' },
      }),
      this.prisma.housekeepingTask.findMany({
        where: {
          propertyId: scopedPropertyId,
          OR: [
            { status: { in: ['DIRTY', 'CLEANING', 'OUT_OF_SERVICE'] } },
            { dueDate: boardDate },
          ],
        },
        include: {
          property: { select: { id: true, name: true, code: true } },
          room: {
            include: {
              roomCategory: { select: { id: true, name: true, code: true } },
            },
          },
          reservationRoom: {
            include: {
              reservationGroup: { select: { id: true, externalReservationId: true } },
            },
          },
        },
        orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      }),
    ]);

    const reservationRoomIds = reservationGroups.flatMap((group) => group.rooms.map((room) => room.id));
    const primaryGuestIds = reservationGroups.map((group) => group.primaryGuestId).filter((id): id is string => Boolean(id));
    const [billings, guests] = await Promise.all([
      reservationRoomIds.length === 0
        ? []
        : this.prisma.billing.findMany({
            where: { reservationRoomId: { in: reservationRoomIds } },
            include: {
              reservationRoom: {
                include: {
                  reservationGroup: {
                    include: {
                      property: { select: { id: true, name: true, code: true } },
                      primaryGuest: true,
                    },
                  },
                  roomCategory: true,
                  ratePlan: true,
                  room: true,
                },
              },
              extraCharges: true,
              payments: true,
            },
          }),
      primaryGuestIds.length === 0
        ? []
        : this.prisma.guest.findMany({
            where: { id: { in: Array.from(new Set(primaryGuestIds)) } },
          }),
    ]);

    return {
      billings: billings.map((billing) => this.toBillingResponse(billing)),
      dashboard,
      guests: guests.map((guest) => this.toGuestResponse(guest)),
      housekeeping: housekeepingTasks.map((task) => this.toHousekeepingResponse(task)),
      properties: properties.map((property) => this.toPropertyResponse(property)),
      rooms: rooms.map((room) => this.toRoomResponse(room)),
      reservationGroups: reservationGroups.map((group) => this.toReservationGroupResponse(group)),
      date: boardDateText,
    };
  }

  private toReservationGroupResponse(group: {
    id: string;
    propertyId: string;
    primaryGuestId: string | null;
    channelConnectionId: string | null;
    externalReservationId: string;
    externalReservationVersion: string | null;
    externalStatus: string | null;
    source: string | null;
    currency: string | null;
    totalAmount: Prisma.Decimal | null;
    status: BookingStatus;
    remarks: string | null;
    bookedAt: Date | null;
    modifiedAt: Date | null;
    rawPayload: Prisma.JsonValue | null;
    createdAt: Date;
    updatedAt: Date;
    property: { id: string; name: string; code: string };
    primaryGuest: { id: string; name: string; phone: string | null; email: string | null } | null;
    channelConnection: { provider: string; name: string } | null;
    rooms: Array<{
      id: string;
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
      room: { id: string; roomNumber: string; status: string } | null;
    }>;
  }) {
    const arrivalDates = group.rooms.map((room) => this.formatDate(room.arrivalDate)).sort();
    const departureDates = group.rooms.map((room) => this.formatDate(room.departureDate)).sort();
    const roomTotal = group.rooms.reduce((total, room) => total + (room.totalAmount?.toNumber() ?? 0), 0);
    const groupTotal = group.totalAmount?.toNumber();

    return {
      id: group.id,
      property_id: group.propertyId,
      primary_guest_id: group.primaryGuestId,
      channel_connection_id: group.channelConnectionId,
      external_reservation_id: group.externalReservationId,
      external_reservation_version: group.externalReservationVersion,
      external_status: group.externalStatus,
      source: this.connectionSourceLabel(group.channelConnection) ?? group.source,
      currency: group.currency,
      total_amount: groupTotal == null || groupTotal <= 0 ? roomTotal || null : groupTotal,
      reservation_status: group.status,
      remarks: group.remarks,
      booked_at: group.bookedAt?.toISOString() ?? null,
      modified_at: group.modifiedAt?.toISOString() ?? null,
      arrival_date: arrivalDates[0] ?? null,
      departure_date: departureDates[departureDates.length - 1] ?? null,
      import_blocked: this.isImportBlocked(group),
      import_error: this.importError(group),
      created_at: group.createdAt.toISOString(),
      updated_at: group.updatedAt.toISOString(),
      property: group.property,
      primary_guest: group.primaryGuest,
      rooms: group.rooms.map((room) => ({
        id: room.id,
        external_room_reservation_id: room.externalRoomReservationId,
        external_room_id: room.externalRoomId,
        arrival_date: this.formatDate(room.arrivalDate),
        departure_date: this.formatDate(room.departureDate),
        total_amount: room.totalAmount?.toNumber() ?? null,
        currency: room.currency,
        reservation_status: room.status,
        guest_name: room.guestName,
        adults: room.adults,
        children: room.children,
        checked_in_at: room.checkedInAt?.toISOString() ?? null,
        checked_out_at: room.checkedOutAt?.toISOString() ?? null,
        room_category: room.roomCategory,
        rate_plan: {
          id: room.ratePlan.id,
          name: room.ratePlan.name,
          code: room.ratePlan.code,
          base_rate: room.ratePlan.baseRate.toNumber(),
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

  private toBillingResponse(billing: {
    id: string;
    reservationRoomId: string | null;
    amount: Prisma.Decimal;
    tax: Prisma.Decimal;
    total: Prisma.Decimal;
    paymentStatus: string;
    createdAt: Date;
    updatedAt: Date;
    reservationRoom: {
      id: string;
      reservationGroupId: string;
      externalRoomReservationId: string;
      status: BookingStatus;
      arrivalDate: Date;
      departureDate: Date;
      guestName: string | null;
      reservationGroup: {
        externalReservationId: string;
        property: { id: string; name: string; code: string };
        primaryGuest: { id: string; name: string; phone: string | null; email: string | null } | null;
      };
      roomCategory: { id: string; name: string; code: string };
      ratePlan: { id: string; name: string; code: string; baseRate: Prisma.Decimal };
      room: { id: string; roomNumber: string } | null;
    } | null;
    extraCharges: Array<{ id: string; description: string; amount: Prisma.Decimal; createdAt: Date }>;
    payments: Array<{ id: string; provider: string; providerReference: string | null; amount: Prisma.Decimal; status: PaymentTransactionStatus; createdAt: Date }>;
  }) {
    if (!billing.reservationRoom || !billing.reservationRoomId) throw new BadRequestException('Invoice is missing a reservation room subject');
    const paidTotal = this.sumPayments(billing.payments, PaymentTransactionStatus.SUCCEEDED);
    const refundedTotal = this.sumPayments(billing.payments, PaymentTransactionStatus.REFUNDED);
    const balanceDue = Math.max(0, billing.total.toNumber() - paidTotal + refundedTotal);

    return {
      id: billing.id,
      reservation_room_id: billing.reservationRoomId,
      amount: billing.amount.toNumber(),
      tax: billing.tax.toNumber(),
      extra_charges_total: billing.extraCharges.reduce((total, charge) => total + charge.amount.toNumber(), 0),
      paid_total: paidTotal,
      refunded_total: refundedTotal,
      balance_due: balanceDue,
      total: billing.total.toNumber(),
      payment_status: billing.paymentStatus,
      reservation_room: {
        id: billing.reservationRoom.id,
        reservation_group_id: billing.reservationRoom.reservationGroupId,
        external_room_reservation_id: billing.reservationRoom.externalRoomReservationId,
        external_reservation_id: billing.reservationRoom.reservationGroup.externalReservationId,
        reservation_status: billing.reservationRoom.status,
        property: billing.reservationRoom.reservationGroup.property,
        check_in_date: this.formatDate(billing.reservationRoom.arrivalDate),
        check_out_date: this.formatDate(billing.reservationRoom.departureDate),
        guest: {
          id: billing.reservationRoom.reservationGroup.primaryGuest?.id ?? null,
          name: billing.reservationRoom.guestName ?? billing.reservationRoom.reservationGroup.primaryGuest?.name ?? 'Imported guest',
          phone: billing.reservationRoom.reservationGroup.primaryGuest?.phone ?? null,
          email: billing.reservationRoom.reservationGroup.primaryGuest?.email ?? null,
        },
        room_category: billing.reservationRoom.roomCategory,
        rate_plan: {
          id: billing.reservationRoom.ratePlan.id,
          name: billing.reservationRoom.ratePlan.name,
          code: billing.reservationRoom.ratePlan.code,
          base_rate: billing.reservationRoom.ratePlan.baseRate.toNumber(),
        },
        room: {
          id: billing.reservationRoom.room?.id ?? null,
          room_number: billing.reservationRoom.room?.roomNumber ?? null,
        },
      },
      extra_charges: billing.extraCharges.map((charge) => ({
        id: charge.id,
        description: charge.description,
        amount: charge.amount.toNumber(),
        created_at: charge.createdAt,
      })),
      payments: billing.payments.map((payment) => ({
        id: payment.id,
        provider: payment.provider,
        provider_reference: payment.providerReference,
        amount: payment.amount.toNumber(),
        status: payment.status,
        created_at: payment.createdAt,
      })),
      created_at: billing.createdAt,
      updated_at: billing.updatedAt,
    };
  }

  private toHousekeepingResponse(task: {
    id: string;
    propertyId: string;
    roomId: string;
    reservationRoomId: string | null;
    status: string;
    priority: string;
    notes: string | null;
    dueDate: Date | null;
    completedAt: Date | null;
    property: { id: string; name: string; code: string };
    room: { id: string; roomNumber: string; roomCategory: { id: string; name: string; code: string } };
    reservationRoom: { id: string; externalRoomReservationId: string; reservationGroup: { id: string; externalReservationId: string } } | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: task.id,
      property_id: task.propertyId,
      room_id: task.roomId,
      reservation_room_id: task.reservationRoomId,
      status: task.status,
      priority: task.priority,
      notes: task.notes,
      due_date: task.dueDate ? this.formatDate(task.dueDate) : null,
      completed_at: task.completedAt?.toISOString() ?? null,
      property: task.property,
      room: {
        id: task.room.id,
        room_number: task.room.roomNumber,
        room_category: task.room.roomCategory,
      },
      reservation_room: task.reservationRoom
        ? {
            id: task.reservationRoom.id,
            external_room_reservation_id: task.reservationRoom.externalRoomReservationId,
            reservation_group_id: task.reservationRoom.reservationGroup.id,
            external_reservation_id: task.reservationRoom.reservationGroup.externalReservationId,
          }
        : null,
      created_at: task.createdAt,
      updated_at: task.updatedAt,
    };
  }

  private toRoomResponse(room: {
    id: string;
    propertyId: string;
    roomCategoryId: string;
    roomNumber: string;
    status: RoomStatus;
    property: { id: string; name: string; code: string };
    roomCategory: { id: string; name: string; code: string };
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: room.id,
      property_id: room.propertyId,
      room_category_id: room.roomCategoryId,
      room_number: room.roomNumber,
      room_category: room.roomCategory,
      property: room.property,
      status: room.status,
      created_at: room.createdAt,
      updated_at: room.updatedAt,
    };
  }

  private toPropertyResponse(property: {
    id: string;
    name: string;
    code: string;
    phone: string | null;
    email: string | null;
    address: string;
    timezone: string;
    defaultCheckInTime: string;
    defaultCheckOutTime: string;
    isActive: boolean;
    images: Array<{ id: string; url: string; caption: string | null; sortOrder: number; isPrimary: boolean }>;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: property.id,
      name: property.name,
      code: property.code,
      phone: property.phone,
      email: property.email,
      address: property.address,
      timezone: property.timezone,
      default_check_in_time: property.defaultCheckInTime,
      default_check_out_time: property.defaultCheckOutTime,
      is_active: property.isActive,
      images: property.images.map((image) => ({
        id: image.id,
        image_url: image.url,
        alt_text: null,
        caption: image.caption,
        sort_order: image.sortOrder,
        is_primary: image.isPrimary,
      })),
      created_at: property.createdAt,
      updated_at: property.updatedAt,
    };
  }

  private toGuestResponse(guest: {
    id: string;
    propertyId: string;
    name: string;
    email: string | null;
    phone: string | null;
    idProof: string | null;
    address: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: guest.id,
      property_id: guest.propertyId,
      name: guest.name,
      email: guest.email,
      phone: guest.phone,
      id_proof: guest.idProof === 'CHANNEL_IMPORT' ? null : guest.idProof,
      address: guest.address,
      created_at: guest.createdAt,
      updated_at: guest.updatedAt,
    };
  }

  private reservationGroupVisibilityWhere(): Prisma.ReservationGroupWhereInput {
    if (this.shouldShowDetachedOtaReservationHistory()) return {};
    return {
      OR: [
        { channelConnection: { is: { status: ChannelConnectionStatus.ACTIVE } } },
        { channelConnectionId: null, source: { in: ['DIRECT', 'WALK_IN'] } },
      ],
    };
  }

  private reservationRoomVisibilityWhere(): Prisma.ReservationRoomWhereInput {
    if (this.shouldShowDetachedOtaReservationHistory()) return {};
    return { reservationGroup: this.reservationGroupVisibilityWhere() };
  }

  private parseDate(value: string, field: string) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime())) throw new BadRequestException(`${field} must be a valid date`);
    return date;
  }

  private startOfDay(value: Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }

  private addDays(value: Date, days: number) {
    const next = this.startOfDay(value);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  private formatDate(value: Date) {
    return value.toISOString().slice(0, 10);
  }

  private sumPayments(payments: Array<{ amount: Prisma.Decimal; status: PaymentTransactionStatus }>, status: PaymentTransactionStatus) {
    return payments.filter((payment) => payment.status === status).reduce((total, payment) => total + payment.amount.toNumber(), 0);
  }

  private connectionSourceLabel(connection: { provider: string; name: string } | null) {
    if (!connection) return null;
    return connection.name || connection.provider;
  }

  private isImportBlocked(group: { rawPayload?: Prisma.JsonValue | null }) {
    const rawPayload = this.asRecord(group.rawPayload);
    return rawPayload.importBlocked === true;
  }

  private importError(group: { rawPayload?: Prisma.JsonValue | null }) {
    const rawPayload = this.asRecord(group.rawPayload);
    return typeof rawPayload.importError === 'string' ? rawPayload.importError : null;
  }

  private asRecord(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  private shouldShowDetachedOtaReservationHistory() {
    return (
      process.env.SHOW_DETACHED_OTA_RESERVATION_HISTORY === 'true' ||
      process.env.ZODOMUS_ENVIRONMENT?.trim() === 'production'
    );
  }
}
