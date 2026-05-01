import { Injectable } from '@nestjs/common';
import { BookingStatus, Prisma, PricingRuleType, RoomStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type DbClient = PrismaService | Prisma.TransactionClient;

type ActivePricingRule = {
  id: string;
  name: string;
  type: PricingRuleType;
  adjustmentPercent: Prisma.Decimal;
  startDate: Date | null;
  endDate: Date | null;
  occupancyThreshold: number | null;
  isActive: boolean;
};

type RatePlanForPricing = {
  id: string;
  baseRate: Prisma.Decimal;
  currency: string;
  pricingRules?: ActivePricingRule[];
};

type OccupancySnapshot = {
  totalInventory: number;
  bookedInventory: number;
  occupancyPercent: number;
};

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  async calculateStayPricing(input: {
    db?: DbClient;
    propertyId: string;
    roomCategoryId: string;
    ratePlan: RatePlanForPricing;
    checkInDate: Date;
    checkOutDate: Date;
  }) {
    const db = input.db ?? this.prisma;
    const rules = await this.loadRules(db, input.ratePlan);
    const occupancyCache = new Map<string, OccupancySnapshot>();
    let totalAmount = new Prisma.Decimal(0);

    for (const date of this.eachNight(input.checkInDate, input.checkOutDate)) {
      const occupancySnapshot = await this.loadOccupancySnapshot(
        db,
        input.propertyId,
        input.roomCategoryId,
        date,
        occupancyCache,
      );
      const nightlyRate = this.calculateNightlyRate({
        ratePlan: input.ratePlan,
        rules,
        date,
        occupancySnapshot,
      });
      totalAmount = totalAmount.add(nightlyRate);
    }

    return {
      totalAmount,
      currency: input.ratePlan.currency,
    };
  }

  async calculateLowestNightlyRate(input: {
    db?: DbClient;
    propertyId: string;
    roomCategoryId: string;
    date: Date;
    ratePlans: RatePlanForPricing[];
  }) {
    if (input.ratePlans.length === 0) {
      return null;
    }

    const db = input.db ?? this.prisma;
    const occupancyCache = new Map<string, OccupancySnapshot>();
    let lowestRate: Prisma.Decimal | null = null;

    for (const ratePlan of input.ratePlans) {
      const rules = await this.loadRules(db, ratePlan);
      const occupancySnapshot = await this.loadOccupancySnapshot(
        db,
        input.propertyId,
        input.roomCategoryId,
        input.date,
        occupancyCache,
      );
      const nightlyRate = this.calculateNightlyRate({
        ratePlan,
        rules,
        date: input.date,
        occupancySnapshot,
      });

      if (!lowestRate || nightlyRate.lessThan(lowestRate)) {
        lowestRate = nightlyRate;
      }
    }

    return lowestRate;
  }

  private async loadRules(db: DbClient, ratePlan: RatePlanForPricing) {
    if (ratePlan.pricingRules) {
      return ratePlan.pricingRules.filter((rule) => rule.isActive);
    }

    return db.pricingRule.findMany({
      where: {
        ratePlanId: ratePlan.id,
        isActive: true,
      },
      orderBy: [{ createdAt: 'asc' }],
    });
  }

  private calculateNightlyRate(input: {
    ratePlan: RatePlanForPricing;
    rules: ActivePricingRule[];
    date: Date;
    occupancySnapshot: OccupancySnapshot;
  }) {
    let nightlyRate = input.ratePlan.baseRate;

    for (const rule of input.rules) {
      if (!this.isRuleApplicable(rule, input.date, input.occupancySnapshot)) {
        continue;
      }

      nightlyRate = nightlyRate.add(
        input.ratePlan.baseRate.mul(rule.adjustmentPercent).div(new Prisma.Decimal(100)),
      );
    }

    return nightlyRate;
  }

  private isRuleApplicable(rule: ActivePricingRule, date: Date, occupancySnapshot: OccupancySnapshot) {
    switch (rule.type) {
      case PricingRuleType.WEEKEND:
        return this.isWeekend(date);
      case PricingRuleType.DATE_RANGE:
        return !!rule.startDate && !!rule.endDate && date >= rule.startDate && date <= rule.endDate;
      case PricingRuleType.OCCUPANCY:
        return (
          typeof rule.occupancyThreshold === 'number' &&
          occupancySnapshot.occupancyPercent >= rule.occupancyThreshold
        );
      default:
        return false;
    }
  }

  private async loadOccupancySnapshot(
    db: DbClient,
    propertyId: string,
    roomCategoryId: string,
    date: Date,
    cache: Map<string, OccupancySnapshot>,
  ) {
    const key = `${propertyId}:${roomCategoryId}:${date.toISOString().slice(0, 10)}`;
    const cached = cache.get(key);
    if (cached) {
      return cached;
    }

    const [totalInventory, bookedInventory] = await Promise.all([
      db.room.count({
        where: {
          propertyId,
          roomCategoryId,
          status: {
            not: RoomStatus.MAINTENANCE,
          },
        },
      }),
      db.booking.count({
        where: {
          propertyId,
          roomCategoryId,
          status: {
            in: [BookingStatus.BOOKED, BookingStatus.CHECKED_IN],
          },
          checkInDate: {
            lte: date,
          },
          checkOutDate: {
            gt: date,
          },
        },
      }),
    ]);

    const snapshot = {
      totalInventory,
      bookedInventory,
      occupancyPercent: totalInventory === 0 ? 0 : (bookedInventory / totalInventory) * 100,
    };
    cache.set(key, snapshot);
    return snapshot;
  }

  private *eachNight(checkInDate: Date, checkOutDate: Date) {
    for (let cursor = new Date(checkInDate); cursor < checkOutDate; cursor = this.addDays(cursor, 1)) {
      yield cursor;
    }
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  private isWeekend(date: Date) {
    const day = date.getUTCDay();
    return day === 0 || day === 6;
  }
}
