import { Prisma } from '@prisma/client';
import { RateSyncPayloadService } from './rate-sync-payload.service';

describe('RateSyncPayloadService', () => {
  const pricingService = {
    calculateNightlyRate: jest.fn(),
  };
  const inventoryService = {
    rebuildCalendarRange: jest.fn(),
  };

  let service: RateSyncPayloadService;

  beforeEach(() => {
    jest.clearAllMocks();
    inventoryService.rebuildCalendarRange.mockResolvedValue([]);
    service = new RateSyncPayloadService(pricingService as never, inventoryService as never);
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
          roomCategoryMaxOccupancy: 2,
          pricingConfig: {
            single_price: 4500,
          },
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
    expect(inventoryService.rebuildCalendarRange).toHaveBeenCalledWith({
      propertyId: 'property-1',
      roomCategoryIds: ['cat-1'],
      from: new Date('2026-06-01T00:00:00.000Z'),
      to: new Date('2026-06-02T00:00:00.000Z'),
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
        room_category_max_occupancy: 2,
        pricing_config: {
          single_price: 4500,
        },
        closed: false,
        closed_to_arrival: false,
        closed_to_departure: false,
        min_stay: null,
        max_stay: null,
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
        room_category_max_occupancy: 2,
        pricing_config: {
          single_price: 4500,
        },
        closed: false,
        closed_to_arrival: false,
        closed_to_departure: false,
        min_stay: null,
        max_stay: null,
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
    expect(inventoryService.rebuildCalendarRange).not.toHaveBeenCalled();
    expect(rows).toEqual([]);
  });

  it('adds inventory restrictions to rate rows', async () => {
    pricingService.calculateNightlyRate.mockResolvedValue(new Prisma.Decimal(5000));
    inventoryService.rebuildCalendarRange.mockResolvedValue([
      {
        roomCategoryId: 'cat-1',
        stayDate: new Date('2026-06-01T00:00:00.000Z'),
        stopSell: true,
        closedToArrival: true,
        closedToDeparture: false,
        minStay: 2,
        maxStay: 5,
      },
    ]);

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
          roomCategoryMaxOccupancy: 2,
          pricingConfig: null,
          ratePlan: {
            id: 'rate-plan-1',
            baseRate: new Prisma.Decimal(4500),
            currency: 'INR',
          },
        },
      ],
      {
        from: '2026-06-01',
        to: '2026-06-01',
      },
    );

    expect(rows[0]).toEqual(expect.objectContaining({
      closed: true,
      closed_to_arrival: true,
      closed_to_departure: false,
      min_stay: 2,
      max_stay: 5,
    }));
  });
});
