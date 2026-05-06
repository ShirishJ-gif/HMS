import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthenticatedUser } from '../auth/auth.guard';
import { assertCanAccessProperty } from '../auth/property-scope';
import { InventoryService } from '../inventory/inventory.service';
import { PricingService } from '../pricing/pricing.service';
import { PrismaService } from '../../prisma/prisma.service';
import { GetAvailabilityDto } from './dto/get-availability.dto';

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
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

    const inventoryRows = (await this.inventoryService.rebuildCalendarRange({
      propertyId: query.property_id,
      from,
      to: new Date(to.getTime() - 24 * 60 * 60 * 1000),
    })) as Array<{
      roomCategoryId: string;
      totalRooms: number;
      blockedRooms: number;
      reservedRooms: number;
      availableRooms: number;
    }>;

    return {
      property_id: property.id,
      property_name: property.name,
      from: query.from,
      to: query.to,
      categories: await Promise.all(categories.map(async (category) => {
        const categoryRows = inventoryRows.filter((row) => row.roomCategoryId === category.id);
        const total_inventory = categoryRows.reduce((max, row) => Math.max(max, row.totalRooms), 0);
        const out_of_service = categoryRows.reduce((max, row) => Math.max(max, row.blockedRooms), 0);
        const reservedRoomStays = categoryRows.reduce((max, row) => Math.max(max, row.reservedRooms), 0);
        const available = categoryRows.reduce((min, row) => Math.min(min, row.availableRooms), total_inventory);
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
          reserved_room_stays: reservedRoomStays,
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
