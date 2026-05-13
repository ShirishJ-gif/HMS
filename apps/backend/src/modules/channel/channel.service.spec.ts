import { ChannelProvider, ChannelSyncStatus, ChannelSyncType, Prisma } from '@prisma/client';
import { ChannelService } from './channel.service';

describe('ChannelService sync outcome resolution', () => {
  const service = Object.create(ChannelService.prototype) as ChannelService;

  it('marks rate syncs as failed when every provider row failed', () => {
    const outcome = (service as unknown as {
      resolveSyncOutcome: (
        syncType: ChannelSyncType,
        responsePayload: Record<string, unknown>,
      ) => { status: ChannelSyncStatus; errorMessage: string | null };
    }).resolveSyncOutcome(ChannelSyncType.RATES, {
      summary: {
        total_rows: '4',
        succeeded_rows: '0',
        failed_rows: '4',
      },
      row_results: [
        {
          external_room_id: '10001',
          external_rate_id: '100991',
          status: 'FAILED',
          error_message: 'Property status not Active',
        },
      ],
    });

    expect(outcome).toEqual({
      status: ChannelSyncStatus.FAILED,
      errorMessage: '4 rate row(s) failed while 0 succeeded.',
    });
  });

  it('marks booking syncs as failed when reservation queue returnCode is non-200', () => {
    const outcome = (service as unknown as {
      resolveSyncOutcome: (
        syncType: ChannelSyncType,
        responsePayload: Record<string, unknown>,
      ) => { status: ChannelSyncStatus; errorMessage: string | null };
    }).resolveSyncOutcome(ChannelSyncType.BOOKINGS, {
      reservation_queue: {
        status: {
          returnCode: 400,
          returnMessage: 'Property status not Active',
        },
      },
    });

    expect(outcome).toEqual({
      status: ChannelSyncStatus.FAILED,
      errorMessage: 'Property status not Active',
    });
  });

  it('marks booking syncs as failed when reservation summary returnCode is non-200', () => {
    const outcome = (service as unknown as {
      resolveSyncOutcome: (
        syncType: ChannelSyncType,
        responsePayload: Record<string, unknown>,
      ) => { status: ChannelSyncStatus; errorMessage: string | null };
    }).resolveSyncOutcome(ChannelSyncType.BOOKINGS, {
      reservation_summary: {
        status: {
          returnCode: 400,
          returnMessage: 'Invalid property id',
        },
      },
    });

    expect(outcome).toEqual({
      status: ChannelSyncStatus.FAILED,
      errorMessage: 'Invalid property id',
    });
  });

  it('marks booking syncs as partially failed when import summary reports failures', () => {
    const outcome = (service as unknown as {
      resolveSyncOutcome: (
        syncType: ChannelSyncType,
        responsePayload: Record<string, unknown>,
      ) => { status: ChannelSyncStatus; errorMessage: string | null };
    }).resolveSyncOutcome(ChannelSyncType.BOOKINGS, {
      reservation_queue: {
        status: {
          returnCode: 200,
        },
      },
      import_summary: {
        created: 1,
        failed: 1,
        errors: ['9355237: inventory sold out'],
      },
    });

    expect(outcome).toEqual({
      status: ChannelSyncStatus.PARTIAL_FAILED,
      errorMessage: '1 reservation import(s) failed.',
    });
  });
});

describe('ChannelService Zodomus automation defaults', () => {
  const originalWindowDays = process.env.ZODOMUS_AUTO_SYNC_WINDOW_DAYS;
  const originalEnvironment = process.env.ZODOMUS_ENVIRONMENT;

  afterEach(() => {
    if (originalWindowDays === undefined) {
      delete process.env.ZODOMUS_AUTO_SYNC_WINDOW_DAYS;
    } else {
      process.env.ZODOMUS_AUTO_SYNC_WINDOW_DAYS = originalWindowDays;
    }

    if (originalEnvironment === undefined) {
      delete process.env.ZODOMUS_ENVIRONMENT;
    } else {
      process.env.ZODOMUS_ENVIRONMENT = originalEnvironment;
    }
  });

  it('caps sandbox sync windows to a short forward range', () => {
    process.env.ZODOMUS_ENVIRONMENT = 'sandbox';
    process.env.ZODOMUS_AUTO_SYNC_WINDOW_DAYS = '30';
    const service = Object.create(ChannelService.prototype) as ChannelService;
    const automation = (service as unknown as {
      readZodomusAutomationConfig: (record: Prisma.InputJsonObject) => {
        sync_window_days: number;
      };
    }).readZodomusAutomationConfig({
      environment: 'sandbox',
      automation: {
        enabled: true,
        sync_window_days: 30,
      },
    });

    expect(automation.sync_window_days).toBe(7);
  });

  it('raises sandbox automation intervals to safer minimums for existing connections', () => {
    process.env.ZODOMUS_ENVIRONMENT = 'sandbox';
    const service = Object.create(ChannelService.prototype) as ChannelService;
    const automation = (service as unknown as {
      readZodomusAutomationConfig: (record: Prisma.InputJsonObject) => {
        inventory_interval_minutes: number;
        rates_interval_minutes: number;
        bookings_interval_minutes: number;
      };
    }).readZodomusAutomationConfig({
      environment: 'sandbox',
      automation: {
        enabled: true,
        inventory_interval_minutes: 15,
        rates_interval_minutes: 60,
        bookings_interval_minutes: 5,
      },
    });

    expect(automation.inventory_interval_minutes).toBe(60);
    expect(automation.rates_interval_minutes).toBe(180);
    expect(automation.bookings_interval_minutes).toBe(15);
  });

  it('keeps the production minimum forward sync window', () => {
    process.env.ZODOMUS_ENVIRONMENT = 'production';
    process.env.ZODOMUS_AUTO_SYNC_WINDOW_DAYS = '30';
    const service = Object.create(ChannelService.prototype) as ChannelService;
    const automation = (service as unknown as {
      defaultZodomusAutomationConfig: () => {
        sync_window_days: number;
      };
    }).defaultZodomusAutomationConfig();

    expect(automation.sync_window_days).toBe(365);
  });

  it('skips automated scheduling while sandbox auth failures are still in cooldown', () => {
    process.env.ZODOMUS_ENVIRONMENT = 'sandbox';
    const service = Object.create(ChannelService.prototype) as ChannelService;
    const inCooldown = (service as unknown as {
      isZodomusSyncInCooldown: (
        syncLogs: Array<{ createdAt: Date; errorMessage: string | null }>,
        environment?: string | null,
      ) => boolean;
    }).isZodomusSyncInCooldown(
      [
        {
          createdAt: new Date(Date.now() - 10 * 60_000),
          errorMessage: 'Zodomus GET /reservations-queue?channelId=1&propertyId=100 failed with status 401.',
        },
      ],
      'sandbox',
    );

    expect(inCooldown).toBe(true);
  });
});

describe('ChannelService provider reservation creation', () => {
  const connection = {
    id: 'connection-1',
    propertyId: 'property-1',
    provider: ChannelProvider.ZODOMUS,
    externalHotelId: 'hotel-1',
    credentials: { ota_key: 'BOOKING_COM' } satisfies Prisma.InputJsonObject,
  };

  it('extracts the created Zodomus reservation id from the provider return message', () => {
    const service = Object.create(ChannelService.prototype) as ChannelService;
    const reservationId = (service as unknown as {
      extractCreatedReservationId: (payload: Prisma.InputJsonObject) => string | null;
    }).extractCreatedReservationId({
      response: {
        status: {
          returnCode: '200',
          returnMessage: '1 Reservation(s) was created / modified / cancelled. ReservationId=9355237',
        },
      },
    });

    expect(reservationId).toBe('9355237');
  });

  it('fetches and imports the reservation immediately after successful Zodomus creation', async () => {
    const providerService = {
      createTestReservation: jest.fn().mockResolvedValue({
        provider: ChannelProvider.ZODOMUS,
        response: {
          status: {
            returnCode: '200',
            returnMessage: '1 Reservation(s) was created / modified / cancelled. ReservationId=9355237',
          },
        },
      }),
      getReservation: jest.fn().mockResolvedValue({
        response: {
          reservations: {
            reservation: { id: '9355237', status: 'booked' },
            customer: { name: 'Channel Guest' },
            rooms: [
              {
                id: '10001',
                arrivalDate: '2026-06-10',
                departureDate: '2026-06-12',
              },
            ],
          },
        },
      }),
    };
    const backgroundJobService = {
      finalizeImportedReservationImport: jest.fn().mockResolvedValue(undefined),
    };
    const zodomusReservationImportService = {
      importFromSync: jest.fn().mockResolvedValue({
        created: 1,
        created_reservation_group_ids: ['group-1'],
      }),
    };
    const service = new ChannelService(
      {} as never,
      providerService as never,
      {} as never,
      {} as never,
      backgroundJobService as never,
      {} as never,
      {} as never,
      {} as never,
      zodomusReservationImportService as never,
    );
    jest.spyOn(service as unknown as { findAccessibleConnection: () => Promise<typeof connection> }, 'findAccessibleConnection').mockResolvedValue(connection);

    const result = await service.createProviderTestReservation(connection.id, 'new', undefined);

    expect(providerService.createTestReservation).toHaveBeenCalledWith({
      provider: ChannelProvider.ZODOMUS,
      external_hotel_id: 'hotel-1',
      credentials: connection.credentials,
      status: 'new',
      reservation_id: undefined,
    });
    expect(providerService.getReservation).toHaveBeenCalledWith({
      provider: ChannelProvider.ZODOMUS,
      external_hotel_id: 'hotel-1',
      credentials: connection.credentials,
      reservation_id: '9355237',
    });
    expect(zodomusReservationImportService.importFromSync).toHaveBeenCalledWith({
      channelConnectionId: 'connection-1',
      propertyId: 'property-1',
      responsePayload: {
        reservations: [
          {
            reservations: {
              reservation: { id: '9355237', status: 'booked' },
              customer: { name: 'Channel Guest' },
              rooms: [
                {
                  id: '10001',
                  arrivalDate: '2026-06-10',
                  departureDate: '2026-06-12',
                },
              ],
            },
          },
        ],
      },
    });
    expect(backgroundJobService.finalizeImportedReservationImport).toHaveBeenCalledWith({
      sourceConnectionId: 'connection-1',
      propertyId: 'property-1',
      importSummary: {
        created: 1,
        created_reservation_group_ids: ['group-1'],
      },
    });
    expect(result).toEqual({
      provider: ChannelProvider.ZODOMUS,
      response: {
        status: {
          returnCode: '200',
          returnMessage: '1 Reservation(s) was created / modified / cancelled. ReservationId=9355237',
        },
      },
      reservation_id: '9355237',
      import_summary: {
        created: 1,
        created_reservation_group_ids: ['group-1'],
      },
    });
  });
});

describe('ChannelService inventory row persistence', () => {
  it('deduplicates duplicate inventory row results before createMany', async () => {
    const prisma = {
      inventorySyncRow: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
        createMany: jest.fn().mockResolvedValue(undefined),
      },
    };
    const service = new ChannelService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await (service as unknown as {
      persistInventorySyncRows: (
        syncLogId: string,
        connectionId: string,
        responsePayload: Prisma.InputJsonObject,
      ) => Promise<void>;
    }).persistInventorySyncRows('sync-log-1', 'connection-1', {
      row_results: [
        {
          date: '2026-06-01',
          external_room_id: '10001',
          available: 2,
          status: 'SUCCEEDED',
        },
        {
          date: '2026-06-01',
          external_room_id: '10001',
          available: 2,
          status: 'FAILED',
          error_message: 'provider timeout',
        },
        {
          date: '2026-06-02',
          external_room_id: '10001',
          available: 1,
          status: 'SUCCEEDED',
        },
      ],
    });

    expect(prisma.inventorySyncRow.deleteMany).toHaveBeenCalledWith({
      where: { channelSyncLogId: 'sync-log-1' },
    });
    expect(prisma.inventorySyncRow.createMany).toHaveBeenCalledWith({
      data: [
        {
          channelSyncLogId: 'sync-log-1',
          channelConnectionId: 'connection-1',
          syncDate: new Date('2026-06-01T00:00:00.000Z'),
          externalRoomId: '10001',
          available: 2,
          status: 'FAILED',
          errorMessage: 'provider timeout',
          providerResponse: Prisma.JsonNull,
        },
        {
          channelSyncLogId: 'sync-log-1',
          channelConnectionId: 'connection-1',
          syncDate: new Date('2026-06-02T00:00:00.000Z'),
          externalRoomId: '10001',
          available: 1,
          status: 'SUCCEEDED',
          errorMessage: null,
          providerResponse: Prisma.JsonNull,
        },
      ],
    });
  });
});
