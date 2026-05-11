import { Prisma } from '@prisma/client';
import { RateSyncPayloadService } from './rate-sync-payload.service';

describe('RateSyncPayloadService', () => {
  const pricingService = {
    calculateNightlyRate: jest.fn(),
  };

  let service: RateSyncPayloadService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RateSyncPayloadService(pricingService as never);
  });

  it('builds one nightly rate row per mapped rate per date', async () => {
    pricingService.calculateNightlyRate
      .mockResolvedValueOnce(new Prisma.Decimal(5000))
      .mockResolvedValueOnce(new Prisma.Decimal(6200));

    const rows = await service.buildDailyRateRows(
      'property-1',
      [
        {
          externalRoomId: 'ext-room-1',
          externalRateId: 'ext-rate-1',
          ratePlanId: 'rate-plan-1',
          ratePlanCode: 'BAR',
          roomCategoryId: 'cat-1',
          roomCategoryCode: 'DELUXE',
          ratePlan: {
            id: 'rate-plan-1',
            baseRate: new Prisma.Decimal(4500),
            currency: 'INR',
          },
        },
      ],
      {
        from: '2026-06-01',
        to: '2026-06-02',
      },
    );

    expect(pricingService.calculateNightlyRate).toHaveBeenNthCalledWith(1, {
      propertyId: 'property-1',
      roomCategoryId: 'cat-1',
      ratePlan: {
        id: 'rate-plan-1',
        baseRate: new Prisma.Decimal(4500),
        currency: 'INR',
      },
      date: new Date('2026-06-01T00:00:00.000Z'),
    });
    expect(pricingService.calculateNightlyRate).toHaveBeenNthCalledWith(2, {
      propertyId: 'property-1',
      roomCategoryId: 'cat-1',
      ratePlan: {
        id: 'rate-plan-1',
        baseRate: new Prisma.Decimal(4500),
        currency: 'INR',
      },
      date: new Date('2026-06-02T00:00:00.000Z'),
    });
    expect(rows).toEqual([
      {
        date: '2026-06-01',
        external_room_id: 'ext-room-1',
        external_rate_id: 'ext-rate-1',
        rate_plan_id: 'rate-plan-1',
        rate_plan_code: 'BAR',
        room_category_id: 'cat-1',
        room_category_code: 'DELUXE',
        base_rate: 5000,
        currency: 'INR',
      },
      {
        date: '2026-06-02',
        external_room_id: 'ext-room-1',
        external_rate_id: 'ext-rate-1',
        rate_plan_id: 'rate-plan-1',
        rate_plan_code: 'BAR',
        room_category_id: 'cat-1',
        room_category_code: 'DELUXE',
        base_rate: 6200,
        currency: 'INR',
      },
    ]);
  });

  it('returns no rate rows when no rate mappings are provided', async () => {
    const rows = await service.buildDailyRateRows(
      'property-1',
      [],
      {
        from: '2026-06-01',
        to: '2026-06-02',
      },
    );

    expect(pricingService.calculateNightlyRate).not.toHaveBeenCalled();
    expect(rows).toEqual([]);
  });
});
