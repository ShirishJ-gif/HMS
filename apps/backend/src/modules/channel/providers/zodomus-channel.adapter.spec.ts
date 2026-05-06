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

  it('pushes inventory one day at a time using each row date', async () => {
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
          available: 1,
        },
      ],
    });

    expect(pushAvailability).toHaveBeenCalledTimes(2);
    expect(pushAvailability).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        dateFrom: '2026-06-01',
        dateTo: '2026-06-01',
        roomId: '10001',
        availability: 2,
      }),
    );
    expect(pushAvailability).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        dateFrom: '2026-06-02',
        dateTo: '2026-06-02',
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
});
