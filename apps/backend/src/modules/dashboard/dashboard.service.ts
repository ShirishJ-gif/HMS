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

    const [totalBookingsToday, occupiedRooms, totalRooms, revenueToday] = await Promise.all([
      this.prisma.booking.count({
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
          booking: scopedPropertyId ? { propertyId: scopedPropertyId } : undefined,
          updatedAt: {
            gte: startOfDay,
            lt: endOfDay,
          },
        },
      }),
    ]);

    const occupancyRate = totalRooms === 0 ? 0 : (occupiedRooms / totalRooms) * 100;

    return {
      date: this.formatAsiaKolkataDate(referenceDate),
      total_bookings_today: totalBookingsToday,
      occupancy_rate: Number(occupancyRate.toFixed(2)),
      occupied_rooms: occupiedRooms,
      total_rooms: totalRooms,
      revenue_today: revenueToday._sum.total?.toNumber() ?? 0,
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
