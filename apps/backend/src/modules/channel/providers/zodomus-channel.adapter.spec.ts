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

  it('batches contiguous inventory rows with the same availability into one provider call', async () => {
    const adapter = new ZodomusChannelAdapter();
    const pushAvailability = jest
      .spyOn(ZodomusClient.prototype, 'pushAvailability')
      .mockResolvedValue({ status: { returnCode: 200, returnMessage: 'OK' } } as never);

    await adapter.push({
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

    expect(pushAvailability).toHaveBeenCalledTimes(2);
    expect(pushAvailability).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        dateFrom: '2026-06-01',
        dateTo: '2026-06-03',
        roomId: '10001',
        availability: 2,
      }),
    );
    expect(pushAvailability).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        dateFrom: '2026-06-03',
        dateTo: '2026-06-04',
        roomId: '10001',
        availability: 1,
      }),
    );
  });

  it('returns row-level partial failure details for inventory syncs', async () => {
    const adapter = new ZodomusChannelAdapter();
    jest
      .spyOn(ZodomusClient.prototype, 'pushAvailability')
      .mockImplementation(async (body: unknown) => {
        const dateFrom =
          body && typeof body === 'object' && !Array.isArray(body) && typeof (body as { dateFrom?: unknown }).dateFrom === 'string'
            ? (body as { dateFrom: string }).dateFrom
            : '';
        if (dateFrom === '2026-06-02') {
          throw new Error('provider timeout');
        }

        return { status: { returnCode: 200, returnMessage: 'OK' } } as never;
      });

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
      succeeded_rows: 1,
      failed_rows: 1,
    });
    expect(response.row_results).toEqual([
      expect.objectContaining({
        date: '2026-06-01',
        external_room_id: '10001',
        available: 2,
        status: 'SUCCEEDED',
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
      .spyOn(ZodomusClient.prototype, 'pushAvailability')
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

  it('batches contiguous rate rows with the same nightly price into one provider call', async () => {
    const adapter = new ZodomusChannelAdapter();
    const pushRates = jest
      .spyOn(ZodomusClient.prototype, 'pushRates')
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
      to: '2026-06-02',
      rates: [
        {
          date: '2026-06-01',
          external_room_id: '10001',
          external_rate_id: '100991',
          currency: 'INR',
          base_rate: 5000,
        },
        {
          date: '2026-06-02',
          external_room_id: '10001',
          external_rate_id: '100991',
          currency: 'INR',
          base_rate: 5000,
        },
        {
          date: '2026-06-03',
          external_room_id: '10001',
          external_rate_id: '100991',
          currency: 'INR',
          base_rate: 6200,
        },
      ],
    });

    expect(pushRates).toHaveBeenCalledTimes(2);
    expect(pushRates).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        dateFrom: '2026-06-01',
        dateTo: '2026-06-03',
        roomId: '10001',
        rateId: '100991',
        prices: {
          price: '5000.00',
        },
      }),
    );
    expect(pushRates).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        dateFrom: '2026-06-03',
        dateTo: '2026-06-04',
        roomId: '10001',
        rateId: '100991',
        prices: {
          price: '6200.00',
        },
      }),
    );
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
      .spyOn(ZodomusClient.prototype, 'pushRates')
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

  it('imports booking details discovered in reservation summary without using the queue', async () => {
    const adapter = new ZodomusChannelAdapter();
    const pullReservationQueue = jest.spyOn(ZodomusClient.prototype, 'pullReservationQueue');
    const getReservationsSummary = jest.spyOn(ZodomusClient.prototype, 'getReservationsSummary').mockResolvedValue(
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

    expect(pullReservationQueue).not.toHaveBeenCalled();
    expect(getReservationsSummary).toHaveBeenCalledTimes(1);
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
    expect(response.reservation_summary).toEqual({
      reservations: [
        { reservation: { id: '1006880' } },
        { reservation: { id: '1007295' } },
      ],
    });
  });

  it('deduplicates booking detail fetches discovered in reservation summary', async () => {
    const adapter = new ZodomusChannelAdapter();
    const pullReservationQueue = jest.spyOn(ZodomusClient.prototype, 'pullReservationQueue');
    jest.spyOn(ZodomusClient.prototype, 'getReservationsSummary').mockResolvedValue(
      {
        reservations: [
          { reservation: { id: '1006880' } },
          { reservation: { id: '1008000' } },
        ],
      } as never,
    );
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

    expect(pullReservationQueue).not.toHaveBeenCalled();
    expect(getReservation).toHaveBeenCalledTimes(2);
    expect(response.reservations).toEqual([
      { reservationId: '1006880' },
      { reservationId: '1008000' },
    ]);
  });

  it('filters booking detail responses that only report the provider download limit from summary references', async () => {
    const adapter = new ZodomusChannelAdapter();
    jest.spyOn(ZodomusClient.prototype, 'pullReservationQueue');
    jest.spyOn(ZodomusClient.prototype, 'getReservationsSummary').mockResolvedValue({
      reservations: [
        { reservation: { id: '1006880' } },
        { reservation: { id: '1007295' } },
      ],
    } as never);
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
    });
    expect(response.reservations).toEqual([
      {
        status: { returnCode: 200, returnMessage: 'OK' },
        reservation: { reservation_id: 'res-101' },
      },
    ]);
  });

  it('falls back to summary reconciliation when targeted webhook fetch is not usable', async () => {
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
    const pullReservationQueue = jest.spyOn(ZodomusClient.prototype, 'pullReservationQueue');
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
    expect(pullReservationQueue).not.toHaveBeenCalled();
    expect(getReservationsSummary).toHaveBeenCalledTimes(1);
    expect(response.reservation_import).toEqual({
      mode: 'webhook_trigger',
      strategy: 'summary_reconciliation',
      reservation_id: 'res-101',
    });
    expect(response.reservations).toEqual([
      {
        status: { returnCode: 200, returnMessage: 'OK' },
        reservation: { reservation_id: 'res-101' },
      },
    ]);
  });
});
