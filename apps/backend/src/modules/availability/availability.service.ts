import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, RoomStatus } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.guard';
import { assertCanAccessProperty } from '../auth/property-scope';
import { PricingService } from '../pricing/pricing.service';
import { PrismaService } from '../../prisma/prisma.service';
import { GetAvailabilityDto } from './dto/get-availability.dto';

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingService: PricingService,
  ) {}

  async getAvailability(query: GetAvailabilityDto, user?: AuthenticatedUser) {
    assertCanAccessProperty(user, query.property_id);

    const from = this.parseDateOnly(query.from);
    const to = this.parseDateOnly(query.to);

    if (to <= from) {
      throw new BadRequestException('to must be after from');
    }

    const property = await this.prisma.property.findUnique({
      where: { id: query.property_id },
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    const categories = await this.prisma.roomCategory.findMany({
      where: { propertyId: query.property_id },
      include: {
        rooms: true,
        ratePlans: {
          where: { isActive: true },
          include: {
            pricingRules: {
              where: { isActive: true },
              orderBy: { createdAt: 'asc' },
            },
          },
          orderBy: { baseRate: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    const bookings = await this.prisma.booking.findMany({
      where: {
        propertyId: query.property_id,
        status: {
          in: [BookingStatus.BOOKED, BookingStatus.CHECKED_IN],
        },
        checkInDate: { lt: to },
        checkOutDate: { gt: from },
      },
    });

    return {
      property_id: property.id,
      property_name: property.name,
      from: query.from,
      to: query.to,
      categories: await Promise.all(categories.map(async (category) => {
        const total_inventory = category.rooms.filter((room) => room.status !== RoomStatus.MAINTENANCE).length;
        const out_of_service = category.rooms.filter((room) => room.status === RoomStatus.MAINTENANCE).length;
        const booked = bookings.filter((booking) => booking.roomCategoryId === category.id).length;
        const available = Math.max(total_inventory - booked, 0);
        const lowestRate = await this.pricingService.calculateLowestNightlyRate({
          db: this.prisma,
          propertyId: query.property_id,
          roomCategoryId: category.id,
          date: from,
          ratePlans: category.ratePlans,
        });

        return {
          room_category_id: category.id,
          name: category.name,
          code: category.code,
          total_inventory,
          out_of_service,
          booked,
          available,
          lowest_rate: lowestRate?.toNumber() ?? null,
          currency: category.ratePlans[0]?.currency ?? null,
        };
      })),
    };
  }

  private parseDateOnly(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException('Dates must use YYYY-MM-DD format');
    }

    return new Date(`${value}T00:00:00.000Z`);
  }
}
