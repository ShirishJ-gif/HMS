import { BookingStatus, ChannelProvider, ChannelSyncStatus, ChannelSyncType, Prisma } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
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

  it('uses a shorter production routine sync window by default', () => {
    process.env.ZODOMUS_ENVIRONMENT = 'production';
    process.env.ZODOMUS_AUTO_SYNC_WINDOW_DAYS = '30';
    const service = Object.create(ChannelService.prototype) as ChannelService;
    const automation = (service as unknown as {
      defaultZodomusAutomationConfig: () => {
        sync_window_days: number;
        full_sync_window_days: number;
      };
    }).defaultZodomusAutomationConfig();

    expect(automation.sync_window_days).toBe(30);
    expect(automation.full_sync_window_days).toBe(365);
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

describe('ChannelService Zodomus price model validation', () => {
  const service = Object.create(ChannelService.prototype) as ChannelService;
  const validate = service as unknown as {
    assertValidZodomusPriceModel: (otaKey: 'BOOKING_COM' | 'EXPEDIA' | 'AIRBNB', priceModelId: number) => void;
  };

  it.each([
    ['BOOKING_COM', 1],
    ['BOOKING_COM', 2],
    ['BOOKING_COM', 4],
    ['BOOKING_COM', 5],
    ['EXPEDIA', 3],
    ['EXPEDIA', 4],
    ['EXPEDIA', 5],
    ['AIRBNB', 4],
  ] as const)('allows %s price model %i', (otaKey, priceModelId) => {
    expect(() => validate.assertValidZodomusPriceModel(otaKey, priceModelId)).not.toThrow();
  });

  it.each([
    ['BOOKING_COM', 3],
    ['EXPEDIA', 1],
    ['EXPEDIA', 2],
    ['AIRBNB', 1],
    ['AIRBNB', 3],
  ] as const)('rejects %s price model %i', (otaKey, priceModelId) => {
    expect(() => validate.assertValidZodomusPriceModel(otaKey, priceModelId)).toThrow(BadRequestException);
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

  it('rejects placeholder reservation ids before sending provider cancellation events', async () => {
    const providerService = {
      createTestReservation: jest.fn(),
    };
    const service = new ChannelService(
      {} as never,
      providerService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.createProviderTestReservation('connection-1', 'cancelled', 'RESERVATION_ID'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(providerService.createTestReservation).not.toHaveBeenCalled();
  });
});

describe('ChannelService Zodomus readiness gate', () => {
  const readyCheckResponse = {
    response: {
      status: {
        returnCode: 200,
        returnMessage: {
          'Property status': 'Active',
          'Channel status': 'OK',
          'Product status': 'OK',
          'Room status': 'OK',
        },
      },
    },
  };

  function createService(input: {
    connection: {
      id: string;
      propertyId: string;
      provider: ChannelProvider;
      externalHotelId: string;
      credentials: Prisma.InputJsonObject;
    };
    providerService?: Record<string, jest.Mock>;
  }) {
    const prisma = {
      channelConnection: {
        findUnique: jest.fn().mockResolvedValue(input.connection),
        update: jest.fn().mockResolvedValue(input.connection),
      },
    };
    const providerService = {
      checkProperty: jest.fn().mockResolvedValue(readyCheckResponse),
      activateRooms: jest.fn().mockResolvedValue({
        response: {
          status: {
            returnCode: 200,
            returnMessage: 'OK',
          },
        },
      }),
      ...(input.providerService ?? {}),
    };
    const auditLogService = {
      record: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ChannelService(
      prisma as never,
      providerService as never,
      auditLogService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    return { service, prisma, providerService };
  }

  it('does not mark Zodomus ready when property check passes before rooms are activated', async () => {
    const { service, prisma } = createService({
      connection: {
        id: 'connection-1',
        propertyId: 'property-1',
        provider: ChannelProvider.ZODOMUS,
        externalHotelId: 'hotel-1',
        credentials: {
          setup_status: {
            activated: true,
            rooms_activated: false,
          },
        },
      },
    });

    await service.checkProviderProperty('connection-1');

    expect(prisma.channelConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'connection-1' },
        data: {
          credentials: expect.objectContaining({
            setup_status: expect.objectContaining({
              checked: true,
              rooms_activated: false,
              ready: false,
              ready_at: null,
            }),
          }),
        },
      }),
    );
  });

  it('resets ready after room activation and waits for a separate final property check', async () => {
    const connection = {
      id: 'connection-1',
      propertyId: 'property-1',
      provider: ChannelProvider.ZODOMUS,
      externalHotelId: 'hotel-1',
      credentials: {
        setup_status: {
          activated: true,
          rooms_activated: false,
          ready: true,
        },
      },
    };
    const { service, prisma, providerService } = createService({ connection });
    jest
      .spyOn(service as unknown as { buildZodomusRoomsActivationPayload: () => Promise<unknown[]> }, 'buildZodomusRoomsActivationPayload')
      .mockResolvedValue([{ roomId: '10001', rates: ['100991'] }]);
    jest
      .spyOn(service as unknown as { getConnectionResponse: () => Promise<typeof connection> }, 'getConnectionResponse')
      .mockResolvedValue(connection);

    await service.activateProviderRooms('connection-1');

    expect(providerService.checkProperty).not.toHaveBeenCalled();
    expect(prisma.channelConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'connection-1' },
        data: {
          credentials: expect.objectContaining({
            setup_status: expect.objectContaining({
              rooms_activated: true,
              activated_room_count: 1,
              ready: false,
              ready_at: null,
            }),
          }),
        },
      }),
    );
  });

  it('marks Zodomus ready when final property check passes after rooms are activated', async () => {
    const { service, prisma } = createService({
      connection: {
        id: 'connection-1',
        propertyId: 'property-1',
        provider: ChannelProvider.ZODOMUS,
        externalHotelId: 'hotel-1',
        credentials: {
          setup_status: {
            activated: true,
            rooms_activated: true,
          },
        },
      },
    });

    await service.checkProviderProperty('connection-1');

    expect(prisma.channelConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'connection-1' },
        data: {
          credentials: expect.objectContaining({
            setup_status: expect.objectContaining({
              checked: true,
              rooms_activated: true,
              ready: true,
              ready_at: expect.any(String),
            }),
          }),
        },
      }),
    );
  });
});

describe('ChannelService Zodomus room activation payload', () => {
  it('includes only room and rate mappings enabled for activation', async () => {
    const prisma = {
      room: {
        count: jest.fn().mockResolvedValue(2),
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
    const payload = await (service as unknown as {
      buildZodomusRoomsActivationPayload: (connection: unknown) => Promise<Array<{ roomId: string; rates: string[] }>>;
    }).buildZodomusRoomsActivationPayload({
      id: 'connection-1',
      propertyId: 'property-1',
      roomMappings: [
        {
          roomCategoryId: 'category-1',
          externalRoomId: 'room-1',
          externalRoomName: 'Provider room 1',
          isActivationEnabled: true,
          roomCategory: { code: 'R1', name: 'Room 1' },
        },
        {
          roomCategoryId: 'category-2',
          externalRoomId: 'room-2',
          externalRoomName: 'Provider room 2',
          isActivationEnabled: false,
          roomCategory: { code: 'R2', name: 'Room 2' },
        },
      ],
      rateMappings: [
        {
          externalRoomId: 'room-1',
          externalRateId: 'rate-1',
          isActivationEnabled: true,
        },
        {
          externalRoomId: 'room-1',
          externalRateId: 'rate-2',
          isActivationEnabled: false,
        },
        {
          externalRoomId: 'room-2',
          externalRateId: 'rate-3',
          isActivationEnabled: true,
        },
      ],
    });

    expect(payload).toEqual([
      {
        roomId: 'room-1',
        roomName: 'Provider room 1',
        quantity: 2,
        status: 1,
        rates: ['rate-1'],
      },
    ]);
  });

  it('rejects activation when every mapped room is disabled', async () => {
    const service = new ChannelService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      (service as unknown as {
        buildZodomusRoomsActivationPayload: (connection: unknown) => Promise<unknown[]>;
      }).buildZodomusRoomsActivationPayload({
        propertyId: 'property-1',
        roomMappings: [
          {
            roomCategoryId: 'category-1',
            externalRoomId: 'room-1',
            isActivationEnabled: false,
            roomCategory: { code: 'R1', name: 'Room 1' },
          },
        ],
        rateMappings: [
          {
            externalRoomId: 'room-1',
            externalRateId: 'rate-1',
            isActivationEnabled: true,
          },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('ChannelService reservation summary backfill', () => {
  it('queues a one-time summary backfill booking sync for ready Zodomus connections', async () => {
    const connection = {
      id: 'connection-1',
      propertyId: 'property-1',
      provider: ChannelProvider.ZODOMUS,
      credentials: {
        setup_status: {
          activated: true,
          rooms_activated: true,
          ready: true,
          disconnected: false,
        },
      },
    };
    const queuedLog = {
      id: 'sync-log-1',
      channelConnectionId: connection.id,
      syncType: ChannelSyncType.BOOKINGS,
      status: ChannelSyncStatus.QUEUED,
      requestPayload: {
        reservation_import: {
          mode: 'summary_backfill',
        },
        trigger: 'manual_summary_backfill',
      },
      responsePayload: null,
      errorMessage: null,
      createdAt: new Date('2026-05-15T00:00:00.000Z'),
    };
    const prisma = {
      channelConnection: {
        findUnique: jest.fn().mockResolvedValue(connection),
      },
      channelSyncLog: {
        create: jest.fn().mockResolvedValue(queuedLog),
      },
    };
    const backgroundJobService = {
      enqueue: jest.fn().mockResolvedValue(undefined),
    };
    const metricsService = {
      recordChannelSyncQueued: jest.fn(),
    };
    const service = new ChannelService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      backgroundJobService as never,
      {} as never,
      {} as never,
      metricsService as never,
      {} as never,
    );

    const response = await service.backfillReservationsSummary(connection.id);

    expect(prisma.channelSyncLog.create).toHaveBeenCalledWith({
      data: {
        channelConnectionId: connection.id,
        syncType: ChannelSyncType.BOOKINGS,
        status: ChannelSyncStatus.QUEUED,
        requestPayload: {
          reservation_import: {
            mode: 'summary_backfill',
          },
          trigger: 'manual_summary_backfill',
        },
      },
    });
    expect(backgroundJobService.enqueue).toHaveBeenCalledWith({
      type: 'CHANNEL_SYNC',
      propertyId: connection.propertyId,
      dedupeKey: `channel-sync:${queuedLog.id}`,
      entityType: 'channel_sync_log',
      entityId: queuedLog.id,
      payload: {
        channel_sync_log_id: queuedLog.id,
      },
      maxAttempts: 3,
    });
    expect(metricsService.recordChannelSyncQueued).toHaveBeenCalledWith(ChannelSyncType.BOOKINGS, connection.provider);
    expect(response.request_payload).toEqual({
      reservation_import: {
        mode: 'summary_backfill',
      },
      trigger: 'manual_summary_backfill',
    });
  });

  it('rejects summary backfill until the Zodomus connection is ready', async () => {
    const prisma = {
      channelConnection: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'connection-1',
          propertyId: 'property-1',
          provider: ChannelProvider.ZODOMUS,
          credentials: {
            setup_status: {
              rooms_activated: true,
              ready: false,
            },
          },
        }),
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

    await expect(service.backfillReservationsSummary('connection-1')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ChannelService connection removal cleanup', () => {
  it('deletes imported reservations and releases active inventory before removing the OTA connection', async () => {
    const connection = {
      id: 'connection-1',
      propertyId: 'property-1',
      provider: ChannelProvider.ZODOMUS,
      name: 'Booking.com OTA',
      externalHotelId: '47',
      credentials: { ota_name: 'Booking.com' },
      property: { id: 'property-1' },
      roomMappings: [{ id: 'room-map-1' }],
      rateMappings: [{ id: 'rate-map-1' }],
      syncLogs: [{ id: 'sync-log-1' }],
    };

    const stayDateOne = new Date('2026-06-10T00:00:00.000Z');
    const stayDateTwo = new Date('2026-06-11T00:00:00.000Z');
    const tx = {
      reservationGroup: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'reservation-group-1',
            primaryGuestId: 'guest-1',
            rooms: [
              {
                id: 'reservation-room-1',
                propertyId: 'property-1',
                roomCategoryId: 'category-1',
                arrivalDate: stayDateOne,
                departureDate: new Date('2026-06-12T00:00:00.000Z'),
                status: BookingStatus.BOOKED,
              },
            ],
          },
        ]),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      billing: {
        count: jest.fn().mockResolvedValue(0),
      },
      inventoryCalendar: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'inventory-1',
            totalRooms: 3,
            blockedRooms: 0,
            reservedRooms: 1,
          })
          .mockResolvedValueOnce({
            id: 'inventory-2',
            totalRooms: 3,
            blockedRooms: 0,
            reservedRooms: 1,
          }),
        update: jest.fn().mockResolvedValue(undefined),
      },
      channelConnection: {
        delete: jest.fn().mockResolvedValue(connection),
      },
      guest: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      channelConnection: {
        findUnique: jest.fn().mockResolvedValue(connection),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const auditLogService = {
      record: jest.fn().mockResolvedValue(undefined),
    };
    const backgroundJobService = {
      queueInventorySyncsForProperty: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ChannelService(
      prisma as never,
      {} as never,
      auditLogService as never,
      {} as never,
      backgroundJobService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.deleteConnection(connection.id);

    expect(tx.reservationGroup.findMany).toHaveBeenCalledWith({
      where: { channelConnectionId: connection.id },
      include: {
        rooms: {
          select: {
            id: true,
            propertyId: true,
            roomCategoryId: true,
            arrivalDate: true,
            departureDate: true,
            status: true,
          },
        },
      },
    });
    expect(tx.inventoryCalendar.findUnique).toHaveBeenNthCalledWith(1, {
      where: {
        propertyId_roomCategoryId_stayDate: {
          propertyId: 'property-1',
          roomCategoryId: 'category-1',
          stayDate: stayDateOne,
        },
      },
    });
    expect(tx.inventoryCalendar.findUnique).toHaveBeenNthCalledWith(2, {
      where: {
        propertyId_roomCategoryId_stayDate: {
          propertyId: 'property-1',
          roomCategoryId: 'category-1',
          stayDate: stayDateTwo,
        },
      },
    });
    expect(tx.inventoryCalendar.update).toHaveBeenCalledTimes(2);
    expect(tx.reservationGroup.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['reservation-group-1'] } },
    });
    expect(tx.guest.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['guest-1'] },
        idProof: 'CHANNEL_IMPORT',
        address: 'Imported from Zodomus',
        reservationGroups: { none: {} },
      },
    });
    expect(tx.channelConnection.delete).toHaveBeenCalledWith({ where: { id: connection.id } });
    expect(backgroundJobService.queueInventorySyncsForProperty).toHaveBeenCalledWith('property-1', {
      trigger: 'channel_connection_removed_reservation_cleanup',
      sourceConnectionId: connection.id,
    });
    expect(auditLogService.record).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          reservation_groups_deleted: 1,
          reservation_rooms_deleted: 1,
          imported_guests_deleted: 1,
          active_room_nights_released: 2,
        }),
      }),
    );
    expect(result).toEqual({
      id: connection.id,
      deleted: true,
      reservation_cleanup: {
        reservation_groups_deleted: 1,
        reservation_rooms_deleted: 1,
        imported_guests_deleted: 1,
        active_room_nights_released: 2,
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
