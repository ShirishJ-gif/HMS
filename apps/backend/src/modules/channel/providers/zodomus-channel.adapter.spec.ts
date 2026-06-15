import { ChannelProvider, ChannelSyncType } from '@prisma/client';
import { ZodomusChannelAdapter } from './zodomus-channel.adapter';
import { ZodomusClient } from './zodomus-client';

describe('ZodomusChannelAdapter', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      ZODOMUS_API_USER: 'test-user',
      ZODOMUS_API_PASSWORD: 'test-password',
      ZODOMUS_ENVIRONMENT: 'sandbox',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('posts contiguous inventory segments through availability-multiple', async () => {
    const adapter = new ZodomusChannelAdapter();
    const pushAvailabilityMultiple = jest
      .spyOn(ZodomusClient.prototype, 'pushAvailabilityMultiple')
      .mockResolvedValue({ status: { returnCode: 200, returnMessage: 'OK' } } as never);

    const response = await adapter.push({
      provider: ChannelProvider.ZODOMUS,
      sync_type: ChannelSyncType.INVENTORY,
      property_id: 'property-id',
      external_hotel_id: '100',
      credentials: {
        ota_key: 'BOOKING_COM',
      },
      from: '2026-06-01',
      to: '2026-06-03',
      inventory: [
        {
          date: '2026-06-01',
          external_room_id: '10001',
          available: 2,
        },
        {
          date: '2026-06-02',
          external_room_id: '10001',
          available: 2,
        },
        {
          date: '2026-06-03',
          external_room_id: '10001',
          available: 1,
        },
      ],
    });

    expect(pushAvailabilityMultiple).toHaveBeenCalledTimes(1);
    expect(pushAvailabilityMultiple).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: 1,
        propertyId: '100',
        roomIds: [
          expect.objectContaining({
            dateFrom: '2026-06-01',
            dateTo: '2026-06-03',
            roomId: '10001',
            availability: 2,
          }),
          expect.objectContaining({
            dateFrom: '2026-06-03',
            dateTo: '2026-06-04',
            roomId: '10001',
            availability: 1,
          }),
        ],
      }),
    );
    expect(response.provider_endpoint).toBe('availability-multiple');
  });

  it('marks every inventory row failed when availability-multiple transport fails', async () => {
    const adapter = new ZodomusChannelAdapter();
    jest
      .spyOn(ZodomusClient.prototype, 'pushAvailabilityMultiple')
      .mockRejectedValue(new Error('provider timeout') as never);

    const response = await adapter.push({
      provider: ChannelProvider.ZODOMUS,
      sync_type: ChannelSyncType.INVENTORY,
      property_id: 'property-id',
      external_hotel_id: '100',
      credentials: {
        ota_key: 'BOOKING_COM',
      },
      from: '2026-06-01',
      to: '2026-06-02',
      inventory: [
        {
          date: '2026-06-01',
          external_room_id: '10001',
          available: 2,
        },
        {
          date: '2026-06-02',
          external_room_id: '10001',
          available: 1,
        },
      ],
    });

    expect(response.summary).toEqual({
      total_rows: 2,
      succeeded_rows: 0,
      failed_rows: 2,
    });
    expect(response.row_results).toEqual([
      expect.objectContaining({
        date: '2026-06-01',
        external_room_id: '10001',
        available: 2,
        status: 'FAILED',
        error_message: 'provider timeout',
      }),
      expect.objectContaining({
        date: '2026-06-02',
        external_room_id: '10001',
        available: 1,
        status: 'FAILED',
        error_message: 'provider timeout',
      }),
    ]);
  });

  it('marks inventory rows as failed when the provider returns a non-200 status', async () => {
    const adapter = new ZodomusChannelAdapter();
    jest
      .spyOn(ZodomusClient.prototype, 'pushAvailabilityMultiple')
      .mockResolvedValue({ status: { returnCode: 400, returnMessage: 'Property status not Active' } } as never);

    const response = await adapter.push({
      provider: ChannelProvider.ZODOMUS,
      sync_type: ChannelSyncType.INVENTORY,
      property_id: 'property-id',
      external_hotel_id: '100',
      credentials: {
        ota_key: 'BOOKING_COM',
      },
      from: '2026-06-01',
      to: '2026-06-01',
      inventory: [
        {
          date: '2026-06-01',
          external_room_id: '10001',
          available: 2,
        },
      ],
    });

    expect(response.summary).toEqual({
      total_rows: 1,
      succeeded_rows: 0,
      failed_rows: 1,
    });
    expect(response.row_results).toEqual([
      expect.objectContaining({
        date: '2026-06-01',
        external_room_id: '10001',
        available: 2,
        status: 'FAILED',
        error_message: 'Property status not Active',
      }),
    ]);
  });

  it('treats top-level numeric returnCode 200 with response body as inventory success', async () => {
    const adapter = new ZodomusChannelAdapter();
    jest
      .spyOn(ZodomusClient.prototype, 'pushAvailabilityMultiple')
      .mockResolvedValue({
        status: {
          timestamp: '2026-06-02 09:07:07',
          returnCode: 200,
          returnMessage: 'OK',
        },
        response: {
          success: true,
        },
      } as never);

    const response = await adapter.push({
      provider: ChannelProvider.ZODOMUS,
      sync_type: ChannelSyncType.INVENTORY,
      property_id: 'property-id',
      external_hotel_id: '100',
      credentials: {
        ota_key: 'BOOKING_COM',
      },
      from: '2026-06-02',
      to: '2026-06-02',
      inventory: [
        {
          date: '2026-06-02',
          external_room_id: '1201',
          available: 3,
        },
      ],
    });

    expect(response.summary).toEqual({
      total_rows: 1,
      succeeded_rows: 1,
      failed_rows: 0,
    });
    expect(response.row_results).toEqual([
      expect.objectContaining({
        date: '2026-06-02',
        external_room_id: '1201',
        available: 3,
        status: 'SUCCEEDED',
      }),
    ]);
  });

  it('confirms Airbnb STANDARD pricing availability before inventory sync', async () => {
    const adapter = new ZodomusChannelAdapter();
    const setAirbnbPricingAvailability = jest
      .spyOn(ZodomusClient.prototype, 'setAirbnbPricingAvailability')
      .mockResolvedValue({ status: { returnCode: 200, returnMessage: 'OK' } } as never);
    const pushAvailabilityMultiple = jest
      .spyOn(ZodomusClient.prototype, 'pushAvailabilityMultiple')
      .mockResolvedValue({ status: { returnCode: 200, returnMessage: 'OK' } } as never);

    await adapter.push({
      provider: ChannelProvider.ZODOMUS,
      sync_type: ChannelSyncType.INVENTORY,
      property_id: 'property-id',
      external_hotel_id: '51224597',
      credentials: {
        ota_key: 'AIRBNB',
      },
      inventory: [
        {
          date: '2026-06-01',
          external_room_id: '10001',
          available: 2,
        },
      ],
    });

    expect(setAirbnbPricingAvailability).toHaveBeenCalledWith({
      channelId: 3,
      propertyId: '51224597',
      pricingAvailabilityModelType: 'STANDARD',
      inModelTransition: 'false',
      clearIncompatibleSettings: 'false',
    });
    expect(pushAvailabilityMultiple).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: 3,
        propertyId: '51224597',
        pnaModel: 'STANDARD',
      }),
    );
    expect(setAirbnbPricingAvailability.mock.invocationCallOrder[0]).toBeLessThan(
      pushAvailabilityMultiple.mock.invocationCallOrder[0],
    );
  });

  it('posts contiguous rate segments through rates-multiple', async () => {
    const adapter = new ZodomusChannelAdapter();
    const pushRatesMultiple = jest
      .spyOn(ZodomusClient.prototype, 'pushRatesMultiple')
      .mockResolvedValue({ status: { returnCode: 200, returnMessage: 'OK' } } as never);

    const response = await adapter.push({
      provider: ChannelProvider.ZODOMUS,
      sync_type: ChannelSyncType.RATES,
      property_id: 'property-id',
      external_hotel_id: '100',
      credentials: {
        ota_key: 'BOOKING_COM',
      },
      from: '2026-06-01',
      to: '2026-06-02',
      rates: [
        {
          date: '2026-06-01',
          external_room_id: '10001',
          external_rate_id: '100991',
          currency: 'INR',
          base_rate: 5000,
          room_category_max_occupancy: 2,
        },
        {
          date: '2026-06-02',
          external_room_id: '10001',
          external_rate_id: '100991',
          currency: 'INR',
          base_rate: 5000,
          room_category_max_occupancy: 2,
        },
        {
          date: '2026-06-03',
          external_room_id: '10001',
          external_rate_id: '100991',
          currency: 'INR',
          base_rate: 6200,
          room_category_max_occupancy: 2,
        },
      ],
    });

    expect(pushRatesMultiple).toHaveBeenCalledTimes(1);
    expect(pushRatesMultiple).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: 1,
        propertyId: '100',
        roomIds: [
          expect.objectContaining({
            dateFrom: '2026-06-01',
            dateTo: '2026-06-03',
            roomId: '10001',
            rateId: '100991',
            prices: expect.objectContaining({
              price: '5000.00',
              priceSingle: '5000.00',
            }),
            closed: '0',
            minimumStay: '1',
            maximumStay: '31',
          }),
          expect.objectContaining({
            dateFrom: '2026-06-03',
            dateTo: '2026-06-04',
            roomId: '10001',
            rateId: '100991',
            prices: expect.objectContaining({
              price: '6200.00',
              priceSingle: '6200.00',
            }),
          }),
        ],
      }),
    );
    expect((pushRatesMultiple.mock.calls[0][0] as { roomIds: Array<Record<string, unknown>> }).roomIds[0]).not.toHaveProperty('weekDays');
    expect(response.provider_endpoint).toBe('rates-multiple');
  });

  it('confirms Airbnb STANDARD pricing availability before rate sync', async () => {
    const adapter = new ZodomusChannelAdapter();
    const setAirbnbPricingAvailability = jest
      .spyOn(ZodomusClient.prototype, 'setAirbnbPricingAvailability')
      .mockResolvedValue({ status: { returnCode: 200, returnMessage: 'OK' } } as never);
    const pushRatesMultiple = jest
      .spyOn(ZodomusClient.prototype, 'pushRatesMultiple')
      .mockResolvedValue({ status: { returnCode: 200, returnMessage: 'OK' } } as never);

    await adapter.push({
      provider: ChannelProvider.ZODOMUS,
      sync_type: ChannelSyncType.RATES,
      property_id: 'property-id',
      external_hotel_id: '51224597',
      credentials: {
        ota_key: 'AIRBNB',
      },
      price_model_id: 4,
      rates: [
        {
          date: '2026-06-01',
          external_room_id: '10001',
          external_rate_id: '100991',
          currency: 'INR',
          base_rate: 5000,
          room_category_max_occupancy: 2,
        },
      ],
    });

    expect(setAirbnbPricingAvailability).toHaveBeenCalledWith({
      channelId: 3,
      propertyId: '51224597',
      pricingAvailabilityModelType: 'STANDARD',
      inModelTransition: 'false',
      clearIncompatibleSettings: 'false',
    });
    expect(pushRatesMultiple).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: 3,
        propertyId: '51224597',
        pnaModel: 'STANDARD',
      }),
    );
    expect(setAirbnbPricingAvailability.mock.invocationCallOrder[0]).toBeLessThan(
      pushRatesMultiple.mock.invocationCallOrder[0],
    );
  });

  it('passes inventory restrictions through availability and rate pushes', async () => {
    const adapter = new ZodomusChannelAdapter();
    const pushAvailabilityMultiple = jest
      .spyOn(ZodomusClient.prototype, 'pushAvailabilityMultiple')
      .mockResolvedValue({ status: { returnCode: 200, returnMessage: 'OK' } } as never);
    const pushRatesMultiple = jest
      .spyOn(ZodomusClient.prototype, 'pushRatesMultiple')
      .mockResolvedValue({ status: { returnCode: 200, returnMessage: 'OK' } } as never);

    await adapter.push({
      provider: ChannelProvider.ZODOMUS,
      sync_type: ChannelSyncType.INVENTORY,
      property_id: 'property-id',
      external_hotel_id: '100',
      credentials: { ota_key: 'BOOKING_COM' },
      inventory: [
        {
          date: '2026-06-01',
          external_room_id: '10001',
          available: 0,
          stop_sell: true,
          closed_to_arrival: true,
          closed_to_departure: false,
        },
      ],
    });

    await adapter.push({
      provider: ChannelProvider.ZODOMUS,
      sync_type: ChannelSyncType.RATES,
      property_id: 'property-id',
      external_hotel_id: '100',
      credentials: { ota_key: 'BOOKING_COM' },
      price_model_id: 1,
      rates: [
        {
          date: '2026-06-01',
          external_room_id: '10001',
          external_rate_id: '100991',
          currency: 'INR',
          base_rate: 5000,
          room_category_max_occupancy: 2,
          closed: true,
          closed_to_arrival: true,
          closed_to_departure: true,
          min_stay: 2,
          max_stay: 5,
        },
      ],
    });

    expect(pushAvailabilityMultiple).toHaveBeenCalledWith(
      expect.objectContaining({
        roomIds: [
          expect.objectContaining({
            availability: 0,
            stopSell: 1,
            closedToArrival: 1,
            closedToDeparture: 0,
          }),
        ],
      }),
    );
    expect(pushRatesMultiple).toHaveBeenCalledWith(
      expect.objectContaining({
        roomIds: [
          expect.objectContaining({
            closed: '1',
            closedToArrival: '1',
            closedToDeparture: '1',
            minimumStay: '2',
            maximumStay: '5',
          }),
        ],
      }),
    );
  });

  it('omits priceSingle for single-room rate rows', async () => {
    const adapter = new ZodomusChannelAdapter();
    const pushRatesMultiple = jest
      .spyOn(ZodomusClient.prototype, 'pushRatesMultiple')
      .mockResolvedValue({ status: { returnCode: 200, returnMessage: 'OK' } } as never);

    await adapter.push({
      provider: ChannelProvider.ZODOMUS,
      sync_type: ChannelSyncType.RATES,
      property_id: 'property-id',
      external_hotel_id: '100',
      credentials: {
        ota_key: 'BOOKING_COM',
      },
      from: '2026-06-01',
      to: '2026-06-01',
      rates: [
        {
          date: '2026-06-01',
          external_room_id: '10001',
          external_rate_id: '100991',
          currency: 'INR',
          base_rate: 5000,
          room_category_max_occupancy: 1,
        },
      ],
    });

    expect(pushRatesMultiple).toHaveBeenCalledWith(
      expect.objectContaining({
        roomIds: [
          expect.objectContaining({
            prices: {
              price: '5000.00',
            },
          }),
        ],
      }),
    );
  });

  it('uses configured single occupancy price for maximum/single pricing model', async () => {
    const adapter = new ZodomusChannelAdapter();
    const pushRatesMultiple = jest
      .spyOn(ZodomusClient.prototype, 'pushRatesMultiple')
      .mockResolvedValue({ status: { returnCode: 200, returnMessage: 'OK' } } as never);

    await adapter.push({
      provider: ChannelProvider.ZODOMUS,
      sync_type: ChannelSyncType.RATES,
      property_id: 'property-id',
      external_hotel_id: '100',
      credentials: {
        ota_key: 'BOOKING_COM',
      },
      price_model_id: 1,
      from: '2026-06-01',
      to: '2026-06-01',
      rates: [
        {
          date: '2026-06-01',
          external_room_id: '10001',
          external_rate_id: '100991',
          currency: 'INR',
          base_rate: 5000,
          room_category_max_occupancy: 2,
          pricing_config: {
            single_price: 4200,
          },
        },
      ],
    });

    expect(pushRatesMultiple).toHaveBeenCalledWith(
      expect.objectContaining({
        roomIds: [
          expect.objectContaining({
            prices: {
              price: '5000.00',
              priceSingle: '4200.00',
            },
          }),
        ],
      }),
    );
  });

  it('uses rates-derived for Booking.com derived pricing model', async () => {
    const adapter = new ZodomusChannelAdapter();
    const pushRates = jest
      .spyOn(ZodomusClient.prototype, 'pushRates')
      .mockResolvedValue({ status: { returnCode: 200, returnMessage: 'OK' } } as never);
    const pushDerivedRates = jest
      .spyOn(ZodomusClient.prototype, 'pushDerivedRates')
      .mockResolvedValue({ status: { returnCode: 200, returnMessage: 'OK' } } as never);

    const response = await adapter.push({
      provider: ChannelProvider.ZODOMUS,
      sync_type: ChannelSyncType.RATES,
      property_id: 'property-id',
      external_hotel_id: '100',
      credentials: {
        ota_key: 'BOOKING_COM',
      },
      price_model_id: 2,
      from: '2026-06-01',
      to: '2026-06-01',
      rates: [
        {
          date: '2026-06-01',
          external_room_id: '10001',
          external_rate_id: '100991',
          currency: 'INR',
          base_rate: 5000,
          room_category_max_occupancy: 3,
          pricing_config: {
            baseOccupancy: 2,
            offsets: [
              { persons: 1, percentage: -25, round: 1 },
              { persons: 3, additional: 10, round: 1 },
            ],
          },
        },
      ],
    });

    expect(pushRates).toHaveBeenCalledWith({
      channelId: 1,
      propertyId: '100',
      roomId: '10001',
      rateId: '100991',
      dateFrom: '2026-06-01',
      dateTo: '2026-06-02',
      currencyCode: 'INR',
      prices: {
        price: '5000.00',
      },
      closed: '0',
      closedToArrival: '0',
      closedToDeparture: '0',
      minimumStay: '1',
      maximumStay: '31',
    });
    expect(pushDerivedRates).toHaveBeenCalledWith({
      channelId: 1,
      propertyId: '100',
      roomId: '10001',
      rateId: '100991',
      baseOccupancy: '2',
      occupancy: [
        { persons: '1', percentage: '-25', round: '1' },
        { persons: '3', additional: '10', round: '1' },
      ],
    });
    expect(response.price_model_id).toBe(2);
    expect(response.provider_endpoint).toBe('rates-derived');
    expect(response.row_results).toEqual([
      expect.objectContaining({
        endpoint: 'rates-derived',
        status: 'SUCCEEDED',
      }),
    ]);
  });

  it('uses guest-count prices for occupancy pricing model', async () => {
    const adapter = new ZodomusChannelAdapter();
    const pushRatesMultiple = jest
      .spyOn(ZodomusClient.prototype, 'pushRatesMultiple')
      .mockResolvedValue({ status: { returnCode: 200, returnMessage: 'OK' } } as never);

    const response = await adapter.push({
      provider: ChannelProvider.ZODOMUS,
      sync_type: ChannelSyncType.RATES,
      property_id: 'property-id',
      external_hotel_id: '100',
      credentials: {
        ota_key: 'EXPEDIA',
      },
      price_model_id: 3,
      from: '2026-06-01',
      to: '2026-06-01',
      rates: [
        {
          date: '2026-06-01',
          external_room_id: '10001',
          external_rate_id: '100991',
          currency: 'INR',
          base_rate: 5000,
          room_category_max_occupancy: 3,
          pricing_config: {
            occupancy_prices: [
              { guests: 1, price: 4500 },
              { guests: 2, price: 5000 },
              { guests: 3, price: 5600 },
            ],
          },
        },
      ],
    });

    expect(pushRatesMultiple).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: 2,
        propertyId: '100',
        roomIds: [
          expect.objectContaining({
            roomId: '10001',
            rateId: '100991',
            prices: [
              { guests: '1', price: '4500.00' },
              { guests: '2', price: '5000.00' },
              { guests: '3', price: '5600.00' },
            ],
            closed: '0',
            minimumStay: '1',
            maximumStay: '31',
          }),
        ],
      }),
    );
    expect(response.row_results).toEqual([
      expect.objectContaining({
        endpoint: 'rates-occupancy',
        status: 'SUCCEEDED',
      }),
    ]);
  });

  it('uses base occupancy default price for per-day pricing model', async () => {
    const adapter = new ZodomusChannelAdapter();
    const pushRatesMultiple = jest
      .spyOn(ZodomusClient.prototype, 'pushRatesMultiple')
      .mockResolvedValue({ status: { returnCode: 200, returnMessage: 'OK' } } as never);

    const response = await adapter.push({
      provider: ChannelProvider.ZODOMUS,
      sync_type: ChannelSyncType.RATES,
      property_id: 'property-id',
      external_hotel_id: '100',
      credentials: {
        ota_key: 'EXPEDIA',
      },
      price_model_id: 4,
      from: '2026-06-01',
      to: '2026-06-01',
      rates: [
        {
          date: '2026-06-01',
          external_room_id: '10001',
          external_rate_id: '100991',
          currency: 'INR',
          base_rate: 5000,
          room_category_max_occupancy: 4,
          pricing_config: {
            base_occupancy: 3,
          },
        },
      ],
    });

    expect(pushRatesMultiple).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: 2,
        propertyId: '100',
        roomIds: [
          expect.objectContaining({
            roomId: '10001',
            rateId: '100991',
            prices: {
              price: '5000.00',
            },
            closed: '0',
            minimumStay: '1',
            maximumStay: '31',
          }),
        ],
      }),
    );
    expect((pushRatesMultiple.mock.calls[0][0] as { roomIds: Array<Record<string, unknown>> }).roomIds[0]).not.toHaveProperty('priceSingle');
    expect(response.row_results).toEqual([
      expect.objectContaining({
        endpoint: 'rates-per-day',
        status: 'SUCCEEDED',
      }),
    ]);
  });

  it('uses day-count prices for length-of-stay pricing model', async () => {
    const adapter = new ZodomusChannelAdapter();
    const pushRates = jest
      .spyOn(ZodomusClient.prototype, 'pushRates')
      .mockResolvedValue({ status: { returnCode: 200, returnMessage: 'OK' } } as never);

    const response = await adapter.push({
      provider: ChannelProvider.ZODOMUS,
      sync_type: ChannelSyncType.RATES,
      property_id: 'property-id',
      external_hotel_id: '100',
      credentials: {
        ota_key: 'EXPEDIA',
      },
      price_model_id: 5,
      from: '2026-06-01',
      to: '2026-06-01',
      rates: [
        {
          date: '2026-06-01',
          external_room_id: '10001',
          external_rate_id: '100991',
          currency: 'INR',
          base_rate: 5000,
          room_category_max_occupancy: 4,
          pricing_config: {
            length_of_stay_prices: [
              { days: 1, price: 5000 },
              { days: 2, price: 4800 },
              { days: 3, price: 4500 },
            ],
          },
        },
      ],
    });

    expect(pushRates).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: 2,
        propertyId: '100',
        roomId: '10001',
        rateId: '100991',
        baseOccupancy: '2',
        prices: expect.arrayContaining([
          { days: '1', price: '5000.00' },
          { days: '2', price: '4800.00' },
          { days: '3', price: '4500.00' },
        ]),
      }),
    );
    expect((pushRates.mock.calls[0][0] as { prices: unknown[] }).prices).toHaveLength(3);
    expect(response.row_results).toEqual([
      expect.objectContaining({
        endpoint: 'rates-length-of-stay',
        status: 'SUCCEEDED',
      }),
    ]);
  });

  it('defaults Zodomus sync concurrency to 1 in sandbox', () => {
    process.env.ZODOMUS_ENVIRONMENT = 'sandbox';
    const adapter = new ZodomusChannelAdapter();

    const concurrency = (adapter as unknown as {
      readSyncConcurrency: () => number;
    }).readSyncConcurrency();

    expect(concurrency).toBe(1);
  });

  it('marks rate rows as failed when the provider returns a non-200 status', async () => {
    const adapter = new ZodomusChannelAdapter();
    jest
      .spyOn(ZodomusClient.prototype, 'pushRatesMultiple')
      .mockResolvedValue({ status: { returnCode: 400, returnMessage: 'Property status not Active' } } as never);

    const response = await adapter.push({
      provider: ChannelProvider.ZODOMUS,
      sync_type: ChannelSyncType.RATES,
      property_id: 'property-id',
      external_hotel_id: '100',
      credentials: {
        ota_key: 'BOOKING_COM',
      },
      from: '2026-06-01',
      to: '2026-06-02',
      rates: [
        {
          date: '2026-06-01',
          external_room_id: '10001',
          external_rate_id: '100991',
          currency: 'INR',
          base_rate: 5000,
        },
      ],
    });

    expect(response.summary).toEqual({
      total_rows: 1,
      succeeded_rows: 0,
      failed_rows: 1,
    });
    expect(response.row_results).toEqual([
      expect.objectContaining({
        date: '2026-06-01',
        external_room_id: '10001',
        external_rate_id: '100991',
        base_rate: 5000,
        status: 'FAILED',
        error_message: 'Property status not Active',
      }),
    ]);
  });

  it('imports booking details discovered in the reservation queue', async () => {
    const adapter = new ZodomusChannelAdapter();
    const pullReservationQueue = jest.spyOn(ZodomusClient.prototype, 'pullReservationQueue').mockResolvedValue(
      {
        reservations: [
          {
            reservation: {
              id: '1006880',
            },
          },
          {
            reservation: {
              id: '1007295',
            },
          },
        ],
      } as never,
    );
    const getReservationsSummary = jest.spyOn(ZodomusClient.prototype, 'getReservationsSummary');
    const getReservation = jest
      .spyOn(ZodomusClient.prototype, 'getReservation')
      .mockImplementation(async (query?: Record<string, string>) => ({ reservationId: query?.reservationId }) as never);

    const response = await adapter.push({
      provider: ChannelProvider.ZODOMUS,
      sync_type: ChannelSyncType.BOOKINGS,
      property_id: 'property-id',
      external_hotel_id: '100',
      credentials: {
        ota_key: 'BOOKING_COM',
      },
    });

    expect(pullReservationQueue).toHaveBeenCalledTimes(1);
    expect(getReservationsSummary).not.toHaveBeenCalled();
    expect(getReservation).toHaveBeenCalledTimes(2);
    expect(getReservation).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        propertyId: '100',
        reservationId: '1006880',
      }),
    );
    expect(getReservation).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        propertyId: '100',
        reservationId: '1007295',
      }),
    );
    expect(response.reservations).toEqual([{ reservationId: '1006880' }, { reservationId: '1007295' }]);
    expect(response.reservation_queue).toEqual({
      reservations: [
        { reservation: { id: '1006880' } },
        { reservation: { id: '1007295' } },
      ],
    });
    expect(response.reservation_summary).toBeNull();
  });

  it('deduplicates booking detail fetches discovered in the reservation queue', async () => {
    const adapter = new ZodomusChannelAdapter();
    const pullReservationQueue = jest.spyOn(ZodomusClient.prototype, 'pullReservationQueue').mockResolvedValue(
      {
        reservations: [
          { reservation: { id: '1006880' } },
          { reservation: { id: '1008000' } },
        ],
      } as never,
    );
    const getReservationsSummary = jest.spyOn(ZodomusClient.prototype, 'getReservationsSummary');
    const getReservation = jest
      .spyOn(ZodomusClient.prototype, 'getReservation')
      .mockImplementation(async (query?: Record<string, string>) => ({ reservationId: query?.reservationId }) as never);

    const response = await adapter.push({
      provider: ChannelProvider.ZODOMUS,
      sync_type: ChannelSyncType.BOOKINGS,
      property_id: 'property-id',
      external_hotel_id: '100',
      credentials: {
        ota_key: 'BOOKING_COM',
      },
    });

    expect(pullReservationQueue).toHaveBeenCalledTimes(1);
    expect(getReservationsSummary).not.toHaveBeenCalled();
    expect(getReservation).toHaveBeenCalledTimes(2);
    expect(response.reservations).toEqual([
      { reservationId: '1006880' },
      { reservationId: '1008000' },
    ]);
  });

  it('filters booking detail responses that only report the provider download limit from queue references', async () => {
    const adapter = new ZodomusChannelAdapter();
    const pullReservationQueue = jest.spyOn(ZodomusClient.prototype, 'pullReservationQueue').mockResolvedValue({
      reservations: [
        { reservation: { id: '1006880' } },
        { reservation: { id: '1007295' } },
      ],
    } as never);
    const getReservationsSummary = jest.spyOn(ZodomusClient.prototype, 'getReservationsSummary');
    const getReservation = jest.spyOn(ZodomusClient.prototype, 'getReservation').mockImplementation(
      async (query?: Record<string, string>) =>
        query?.reservationId === '1007295'
          ? ({
              status: {
                returnCode: '400',
                returnMessage: 'Reservation already downloaded 5 times. The limit was reached.',
              },
            } as never)
          : ({ reservationId: query?.reservationId } as never),
    );

    const response = await adapter.push({
      provider: ChannelProvider.ZODOMUS,
      sync_type: ChannelSyncType.BOOKINGS,
      property_id: 'property-id',
      external_hotel_id: '100',
      credentials: {
        ota_key: 'BOOKING_COM',
      },
    });

    expect(pullReservationQueue).toHaveBeenCalledTimes(1);
    expect(getReservationsSummary).not.toHaveBeenCalled();
    expect(getReservation).toHaveBeenCalledTimes(2);
    expect(response.reservations).toEqual([{ reservationId: '1006880' }]);
  });

  it('uses targeted reservation fetch for webhook-triggered booking imports', async () => {
    const adapter = new ZodomusChannelAdapter();
    const getReservation = jest
      .spyOn(ZodomusClient.prototype, 'getReservation')
      .mockResolvedValue({
        status: { returnCode: 200, returnMessage: 'OK' },
        reservation: { reservation_id: 'res-101' },
      } as never);
    const pullReservationQueue = jest.spyOn(ZodomusClient.prototype, 'pullReservationQueue');
    const getReservationsSummary = jest.spyOn(ZodomusClient.prototype, 'getReservationsSummary');

    const response = await adapter.push({
      provider: ChannelProvider.ZODOMUS,
      sync_type: ChannelSyncType.BOOKINGS,
      property_id: 'property-id',
      external_hotel_id: '100',
      credentials: {
        ota_key: 'BOOKING_COM',
      },
      reservation_import: {
        mode: 'webhook_trigger',
        reservation_id: 'res-101',
      },
    });

    expect(getReservation).toHaveBeenCalledWith({
      channelId: '1',
      propertyId: '100',
      reservationId: 'res-101',
    });
    expect(pullReservationQueue).not.toHaveBeenCalled();
    expect(getReservationsSummary).not.toHaveBeenCalled();
    expect(response.reservation_import).toEqual({
      mode: 'webhook_trigger',
      strategy: 'targeted_reservation_fetch',
      reservation_id: 'res-101',
      reservation_ids: ['res-101'],
    });
    expect(response.reservations).toEqual([
      {
        status: { returnCode: 200, returnMessage: 'OK' },
        reservation: { reservation_id: 'res-101' },
      },
    ]);
  });

  it('falls back to reservation queue reconciliation when targeted webhook fetch is not usable', async () => {
    const adapter = new ZodomusChannelAdapter();
    const getReservation = jest
      .spyOn(ZodomusClient.prototype, 'getReservation')
      .mockResolvedValueOnce({
        status: {
          returnCode: '400',
          returnMessage: 'Reservation already downloaded 5 times. The limit was reached.',
        },
      } as never)
      .mockResolvedValueOnce({
        status: { returnCode: 200, returnMessage: 'OK' },
        reservation: { reservation_id: 'res-101' },
      } as never);
    const pullReservationQueue = jest
      .spyOn(ZodomusClient.prototype, 'pullReservationQueue')
      .mockResolvedValue({ reservations: [{ reservation: { id: 'res-101' } }] } as never);
    const getReservationsSummary = jest
      .spyOn(ZodomusClient.prototype, 'getReservationsSummary')
      .mockResolvedValue({ reservations: [{ reservation: { id: 'res-101' } }] } as never);

    const response = await adapter.push({
      provider: ChannelProvider.ZODOMUS,
      sync_type: ChannelSyncType.BOOKINGS,
      property_id: 'property-id',
      external_hotel_id: '100',
      credentials: {
        ota_key: 'BOOKING_COM',
      },
      reservation_import: {
        mode: 'webhook_trigger',
        reservation_id: 'res-101',
      },
    });

    expect(getReservation).toHaveBeenCalledTimes(2);
    expect(pullReservationQueue).toHaveBeenCalledTimes(1);
    expect(getReservationsSummary).not.toHaveBeenCalled();
    expect(response.reservation_import).toEqual({
      mode: 'webhook_trigger',
      strategy: 'reservation_queue_reconciliation',
      reservation_id: 'res-101',
      reservation_ids: ['res-101'],
    });
    expect(response.reservations).toEqual([
      {
        status: { returnCode: 200, returnMessage: 'OK' },
        reservation: { reservation_id: 'res-101' },
      },
    ]);
  });

  it('uses targeted reservation fetches for plural webhook reservation IDs', async () => {
    const adapter = new ZodomusChannelAdapter();
    const getReservation = jest
      .spyOn(ZodomusClient.prototype, 'getReservation')
      .mockImplementation(async (query?: Record<string, string>) => ({
        status: { returnCode: 200, returnMessage: 'OK' },
        reservation: { reservation_id: query?.reservationId },
      }) as never);
    const pullReservationQueue = jest.spyOn(ZodomusClient.prototype, 'pullReservationQueue');

    const response = await adapter.push({
      provider: ChannelProvider.ZODOMUS,
      sync_type: ChannelSyncType.BOOKINGS,
      property_id: 'property-id',
      external_hotel_id: '100',
      credentials: {
        ota_key: 'BOOKING_COM',
      },
      reservation_import: {
        mode: 'webhook_trigger',
        reservation_ids: ['res-101', 'res-102', 'res-101'],
      },
    });

    expect(getReservation).toHaveBeenCalledTimes(2);
    expect(getReservation).toHaveBeenNthCalledWith(1, {
      channelId: '1',
      propertyId: '100',
      reservationId: 'res-101',
    });
    expect(getReservation).toHaveBeenNthCalledWith(2, {
      channelId: '1',
      propertyId: '100',
      reservationId: 'res-102',
    });
    expect(pullReservationQueue).not.toHaveBeenCalled();
    expect(response.reservation_import).toEqual({
      mode: 'webhook_trigger',
      strategy: 'targeted_reservation_fetch',
      reservation_id: 'res-101',
      reservation_ids: ['res-101', 'res-102'],
    });
    expect(response.reservations).toEqual([
      {
        status: { returnCode: 200, returnMessage: 'OK' },
        reservation: { reservation_id: 'res-101' },
      },
      {
        status: { returnCode: 200, returnMessage: 'OK' },
        reservation: { reservation_id: 'res-102' },
      },
    ]);
  });

  it('uses reservation summary only for explicit one-time backfill imports', async () => {
    const adapter = new ZodomusChannelAdapter();
    const pullReservationQueue = jest.spyOn(ZodomusClient.prototype, 'pullReservationQueue');
    const getReservationsSummary = jest
      .spyOn(ZodomusClient.prototype, 'getReservationsSummary')
      .mockResolvedValue({ reservations: [{ reservation: { id: 'future-101' } }] } as never);
    const getReservation = jest
      .spyOn(ZodomusClient.prototype, 'getReservation')
      .mockResolvedValue({ reservationId: 'future-101' } as never);

    const response = await adapter.push({
      provider: ChannelProvider.ZODOMUS,
      sync_type: ChannelSyncType.BOOKINGS,
      property_id: 'property-id',
      external_hotel_id: '100',
      credentials: {
        ota_key: 'BOOKING_COM',
      },
      reservation_import: {
        mode: 'summary_backfill',
      },
    });

    expect(pullReservationQueue).not.toHaveBeenCalled();
    expect(getReservationsSummary).toHaveBeenCalledTimes(1);
    expect(getReservation).toHaveBeenCalledWith({
      channelId: '1',
      propertyId: '100',
      reservationId: 'future-101',
    });
    expect(response.reservation_import).toEqual({
      mode: 'summary_backfill',
      strategy: 'summary_backfill_reconciliation',
      reservation_id: null,
    });
    expect(response.reservation_summary).toEqual({
      reservations: [{ reservation: { id: 'future-101' } }],
    });
    expect(response.reservation_queue).toBeNull();
  });

  it('fetches reservation card details explicitly', async () => {
    const adapter = new ZodomusChannelAdapter();
    const getReservationCC = jest
      .spyOn(ZodomusClient.prototype, 'getReservationCC')
      .mockResolvedValue({ status: { returnCode: 200 }, card: { masked: '411111******1111' } } as never);

    const response = await adapter.getReservationCC({
      provider: ChannelProvider.ZODOMUS,
      external_hotel_id: '100',
      credentials: {
        ota_key: 'BOOKING_COM',
      },
      reservation_id: 'res-101',
    });

    expect(getReservationCC).toHaveBeenCalledWith({
      channelId: '1',
      propertyId: '100',
      reservationId: 'res-101',
    });
    expect(response).toEqual({
      provider: ChannelProvider.ZODOMUS,
      channel_id: 1,
      ota_name: 'Booking.com',
      external_hotel_id: '100',
      reservation_id: 'res-101',
      response: {
        status: { returnCode: 200 },
        card: { masked: '411111******1111' },
      },
    });
  });
});
