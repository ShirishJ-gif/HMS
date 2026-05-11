import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PricingService } from '../pricing/pricing.service';

type RateSyncMapping = {
  externalRoomId: string;
  externalRateId: string;
  ratePlanId: string;
  ratePlanCode: string;
  roomCategoryId: string;
  roomCategoryCode: string;
  ratePlan: {
    id: string;
    baseRate: Prisma.Decimal;
    currency: string;
  };
};

type RateWindow = {
  from: string;
  to: string;
};

@Injectable()
export class RateSyncPayloadService {
  constructor(private readonly pricingService: PricingService) {}

  async buildDailyRateRows(
    propertyId: string,
    rateMappings: RateSyncMapping[],
    window: RateWindow,
  ) {
    if (rateMappings.length === 0) {
      return [];
    }

    const dates = this.expandWindow(window);
    const rows: Array<{
      date: string;
      external_room_id: string;
      external_rate_id: string;
      rate_plan_id: string;
      rate_plan_code: string;
      room_category_id: string;
      room_category_code: string;
      base_rate: number;
      currency: string;
    }> = [];

    for (const mapping of rateMappings) {
      for (const date of dates) {
        const nightlyRate = await this.pricingService.calculateNightlyRate({
          propertyId,
          roomCategoryId: mapping.roomCategoryId,
          ratePlan: {
            id: mapping.ratePlan.id,
            baseRate: mapping.ratePlan.baseRate,
            currency: mapping.ratePlan.currency,
          },
          date,
        });

        rows.push({
          date: this.formatDateOnly(date),
          external_room_id: mapping.externalRoomId,
          external_rate_id: mapping.externalRateId,
          rate_plan_id: mapping.ratePlanId,
          rate_plan_code: mapping.ratePlanCode,
          room_category_id: mapping.roomCategoryId,
          room_category_code: mapping.roomCategoryCode,
          base_rate: nightlyRate.toNumber(),
          currency: mapping.ratePlan.currency,
        });
      }
    }

    return rows;
  }

  private expandWindow(window: RateWindow) {
    const from = this.parseDateOnly(window.from);
    const to = this.parseDateOnly(window.to);

    if (to < from) {
      throw new BadRequestException('to must be on or after from');
    }

    const dates: Date[] = [];
    const current = new Date(from);
    while (current <= to) {
      dates.push(new Date(current));
      current.setUTCDate(current.getUTCDate() + 1);
    }

    return dates;
  }

  private parseDateOnly(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException('Dates must use YYYY-MM-DD format');
    }

    return new Date(`${value}T00:00:00.000Z`);
  }

  private formatDateOnly(value: Date) {
    return value.toISOString().slice(0, 10);
  }
}
