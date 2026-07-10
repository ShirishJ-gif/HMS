import { Injectable } from '@nestjs/common';
import { BookingStatus, ChannelConnectionStatus, PaymentStatus, Prisma, RoomStatus } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.guard';
import { propertyIdFilter } from '../auth/property-scope';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(referenceDate = new Date(), user?: AuthenticatedUser) {
    const { startOfDay, endOfDay } = this.getAsiaKolkataDayWindow(referenceDate);
    const scopedPropertyId = propertyIdFilter(user);
    const serviceDate = this.formatAsiaKolkataDate(referenceDate);
    const reservationGroupVisibilityWhere = this.reservationGroupVisibilityWhere();
    const reservationRoomVisibilityWhere = this.reservationRoomVisibilityWhere();

    const [
      reservationGroupsToday,
      occupiedRooms,
      totalRooms,
      revenueToday,
      reservationRoomArrivalsToday,
      reservationRoomDeparturesToday,
      activeReservationGroups,
      openHousekeepingTasks,
      pendingBalance,
      revenueByOtaBillings,
    ] = await Promise.all([
      this.prisma.reservationGroup.count({
        where: {
          ...reservationGroupVisibilityWhere,
          propertyId: scopedPropertyId,
          createdAt: {
            gte: startOfDay,
            lt: endOfDay,
          },
        },
      }),
      this.prisma.room.count({
        where: {
          propertyId: scopedPropertyId,
          status: RoomStatus.OCCUPIED,
          ...this.occupiedRoomVisibilityWhere(),
        },
      }),
      this.prisma.room.count({
        where: {
          propertyId: scopedPropertyId,
        },
      }),
      this.prisma.billing.aggregate({
        _sum: {
          total: true,
        },
        where: {
          paymentStatus: PaymentStatus.PAID,
          reservationRoom: {
            ...reservationRoomVisibilityWhere,
            ...(scopedPropertyId ? { propertyId: scopedPropertyId } : {}),
          },
          updatedAt: {
            gte: startOfDay,
            lt: endOfDay,
          },
        },
      }),
      this.prisma.reservationRoom.count({
        where: {
          ...reservationRoomVisibilityWhere,
          propertyId: scopedPropertyId,
          status: { in: [BookingStatus.BOOKED, BookingStatus.CHECKED_IN] },
          arrivalDate: new Date(`${serviceDate}T00:00:00.000Z`),
        },
      }),
      this.prisma.reservationRoom.count({
        where: {
          ...reservationRoomVisibilityWhere,
          propertyId: scopedPropertyId,
          status: { in: [BookingStatus.CHECKED_IN, BookingStatus.CHECKED_OUT] },
          departureDate: new Date(`${serviceDate}T00:00:00.000Z`),
        },
      }),
      this.prisma.reservationGroup.count({
        where: {
          ...reservationGroupVisibilityWhere,
          propertyId: scopedPropertyId,
          status: { in: [BookingStatus.BOOKED, BookingStatus.CHECKED_IN] },
        },
      }),
      this.prisma.housekeepingTask.count({
        where: {
          propertyId: scopedPropertyId,
          status: { in: ['DIRTY', 'CLEANING', 'OUT_OF_SERVICE'] },
        },
      }),
      this.prisma.billing.aggregate({
        _sum: {
          total: true,
        },
        where: {
          paymentStatus: { in: [PaymentStatus.PENDING, PaymentStatus.PARTIAL] },
          reservationRoom: {
            ...reservationRoomVisibilityWhere,
            ...(scopedPropertyId ? { propertyId: scopedPropertyId } : {}),
          },
        },
      }),
      this.prisma.billing.findMany({
        where: {
          reservationRoom: {
            ...reservationRoomVisibilityWhere,
            ...(scopedPropertyId ? { propertyId: scopedPropertyId } : {}),
          },
        },
        include: {
          reservationRoom: {
            select: {
              reservationGroup: {
                select: {
                  source: true,
                  channelConnection: {
                    select: {
                      provider: true,
                      name: true,
                      credentials: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    const occupancyRate = totalRooms === 0 ? 0 : (occupiedRooms / totalRooms) * 100;

    return {
      date: this.formatAsiaKolkataDate(referenceDate),
      reservation_groups_today: reservationGroupsToday,
      occupancy_rate: Number(occupancyRate.toFixed(2)),
      occupied_rooms: occupiedRooms,
      total_rooms: totalRooms,
      revenue_today: revenueToday._sum.total?.toNumber() ?? 0,
      reservation_room_arrivals_today: reservationRoomArrivalsToday,
      reservation_room_departures_today: reservationRoomDeparturesToday,
      active_reservation_groups: activeReservationGroups,
      open_housekeeping_tasks: openHousekeepingTasks,
      pending_balance_total: pendingBalance._sum.total?.toNumber() ?? 0,
      revenue_by_ota: this.revenueByOta(revenueByOtaBillings),
    };
  }

  private revenueByOta(
    billings: Array<{
      total: Prisma.Decimal;
      reservationRoom: {
        reservationGroup: {
          source: string | null;
          channelConnection: { provider: string; name: string; credentials: Prisma.JsonValue | null } | null;
        };
      } | null;
    }>,
  ) {
    const rows = new Map<string, number>();
    for (const billing of billings) {
      const label = this.otaRevenueLabel(billing.reservationRoom?.reservationGroup);
      rows.set(label, (rows.get(label) ?? 0) + billing.total.toNumber());
    }

    return Array.from(rows.entries())
      .map(([label, amount]) => ({ label, amount }))
      .sort((a, b) => b.amount - a.amount);
  }

  private otaRevenueLabel(group?: {
    source: string | null;
    channelConnection: { provider: string; name: string; credentials: Prisma.JsonValue | null } | null;
  } | null) {
    const connection = group?.channelConnection;
    if (!connection) return this.formatSourceLabel(group?.source ?? 'Direct');
    const credentials = this.asRecord(connection.credentials);
    const otaName = typeof credentials.ota_name === 'string' && credentials.ota_name.trim().length > 0
      ? credentials.ota_name.trim()
      : null;
    return this.displayOtaLabel(otaName ?? connection.name ?? this.formatSourceLabel(connection.provider));
  }

  private displayOtaLabel(value: string) {
    return value.trim().toLowerCase() === 'booking.com' ? 'Booking' : value;
  }

  private formatSourceLabel(value: string) {
    return value
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ') || 'Direct';
  }

  private asRecord(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  private getAsiaKolkataDayWindow(referenceDate: Date) {
    const date = this.formatAsiaKolkataDate(referenceDate);
    const startOfDay = new Date(`${date}T00:00:00.000+05:30`);
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    return { startOfDay, endOfDay };
  }

  private reservationGroupVisibilityWhere(): Prisma.ReservationGroupWhereInput {
    if (this.shouldShowDetachedOtaReservationHistory()) {
      return {};
    }

    return {
      OR: [
        { channelConnection: { is: { status: ChannelConnectionStatus.ACTIVE } } },
        { channelConnectionId: null, source: { in: ['DIRECT', 'WALK_IN'] } },
      ],
    };
  }

  private reservationRoomVisibilityWhere(): Prisma.ReservationRoomWhereInput {
    if (this.shouldShowDetachedOtaReservationHistory()) {
      return {};
    }

    return {
      reservationGroup: this.reservationGroupVisibilityWhere(),
    };
  }

  private occupiedRoomVisibilityWhere(): Prisma.RoomWhereInput {
    if (this.shouldShowDetachedOtaReservationHistory()) {
      return {};
    }

    return {
      reservationRooms: {
        some: {
          status: BookingStatus.CHECKED_IN,
          reservationGroup: this.reservationGroupVisibilityWhere(),
        },
      },
    };
  }

  private shouldShowDetachedOtaReservationHistory() {
    return (
      process.env.SHOW_DETACHED_OTA_RESERVATION_HISTORY === 'true' ||
      process.env.ZODOMUS_ENVIRONMENT?.trim() === 'production'
    );
  }

  private formatAsiaKolkataDate(date: Date) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }
}
