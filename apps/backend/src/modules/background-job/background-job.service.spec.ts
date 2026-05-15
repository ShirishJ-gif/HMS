import { ChannelSyncStatus, ChannelSyncType, Prisma } from '@prisma/client';
import { BackgroundJobService } from './background-job.service';

describe('BackgroundJobService sync outcome resolution', () => {
  const service = Object.create(BackgroundJobService.prototype) as BackgroundJobService;

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

describe('BackgroundJobService Zodomus sync window defaults', () => {
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

  it('caps saved automation sync windows in sandbox', () => {
    process.env.ZODOMUS_ENVIRONMENT = 'sandbox';
    process.env.ZODOMUS_AUTO_SYNC_WINDOW_DAYS = '30';
    const service = Object.create(BackgroundJobService.prototype) as BackgroundJobService;
    const syncWindowDays = (service as unknown as {
      readSyncWindowDays: (credentials: Record<string, unknown>) => number;
    }).readSyncWindowDays({
      environment: 'sandbox',
      automation: {
        sync_window_days: 30,
      },
    });

    expect(syncWindowDays).toBe(7);
  });

  it('uses the production routine sync window when automation config is missing', () => {
    process.env.ZODOMUS_ENVIRONMENT = 'production';
    process.env.ZODOMUS_AUTO_SYNC_WINDOW_DAYS = '30';
    const service = Object.create(BackgroundJobService.prototype) as BackgroundJobService;
    const syncWindowDays = (service as unknown as {
      readSyncWindowDays: (credentials: Record<string, unknown> | null) => number;
    }).readSyncWindowDays(null);

    expect(syncWindowDays).toBe(30);
  });
});

describe('BackgroundJobService retry classification', () => {
  it('does not retry Zodomus auth and rate-limit failures', () => {
    const service = Object.create(BackgroundJobService.prototype) as BackgroundJobService;
    const authRetryable = (service as unknown as {
      isRetryableJobFailure: (jobType: string, message: string) => boolean;
    }).isRetryableJobFailure('CHANNEL_SYNC', 'Zodomus GET /account failed with status 401.');
    const rateRetryable = (service as unknown as {
      isRetryableJobFailure: (jobType: string, message: string) => boolean;
    }).isRetryableJobFailure('CHANNEL_SYNC', 'Zodomus POST /rates failed with status 429.');

    expect(authRetryable).toBe(false);
    expect(rateRetryable).toBe(false);
  });
});

describe('BackgroundJobService inventory row persistence', () => {
  it('deduplicates duplicate inventory row results before createMany', async () => {
    const prisma = {
      inventorySyncRow: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
        createMany: jest.fn().mockResolvedValue(undefined),
      },
    };
    const service = new BackgroundJobService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { recordBackgroundJobQueued: jest.fn(), recordBackgroundJobCompleted: jest.fn() } as never,
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
