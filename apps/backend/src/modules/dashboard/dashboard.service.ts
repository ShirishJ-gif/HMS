import { Injectable } from '@nestjs/common';
import { BookingStatus, PaymentStatus, RoomStatus } from '@prisma/client';
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
    ] = await Promise.all([
      this.prisma.reservationGroup.count({
        where: {
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
          reservationRoom: scopedPropertyId ? { propertyId: scopedPropertyId } : undefined,
          updatedAt: {
            gte: startOfDay,
            lt: endOfDay,
          },
        },
      }),
      this.prisma.reservationRoom.count({
        where: {
          propertyId: scopedPropertyId,
          status: { in: [BookingStatus.BOOKED, BookingStatus.CHECKED_IN] },
          arrivalDate: new Date(`${serviceDate}T00:00:00.000Z`),
        },
      }),
      this.prisma.reservationRoom.count({
        where: {
          propertyId: scopedPropertyId,
          status: { in: [BookingStatus.CHECKED_IN, BookingStatus.CHECKED_OUT] },
          departureDate: new Date(`${serviceDate}T00:00:00.000Z`),
        },
      }),
      this.prisma.reservationGroup.count({
        where: {
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
          reservationRoom: scopedPropertyId ? { propertyId: scopedPropertyId } : undefined,
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
    };
  }

  private getAsiaKolkataDayWindow(referenceDate: Date) {
    const date = this.formatAsiaKolkataDate(referenceDate);
    const startOfDay = new Date(`${date}T00:00:00.000+05:30`);
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    return { startOfDay, endOfDay };
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
