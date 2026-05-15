import { BookingStatus } from '@prisma/client';
import {
  legacyRoomAliasCandidates,
  selectPreferredRateMapping,
  ZodomusReservationImportService,
} from './zodomus-reservation-import.service';

describe('ZodomusReservationImportService helpers', () => {
  it('maps legacy 90-prefixed provider room ids to canonical 10-prefixed ids', () => {
    expect(legacyRoomAliasCandidates('90003')).toEqual(['10003']);
    expect(legacyRoomAliasCandidates('90002')).toEqual(['10002']);
  });

  it('returns no aliases for current provider room ids', () => {
    expect(legacyRoomAliasCandidates('10001')).toEqual([]);
    expect(legacyRoomAliasCandidates('MOCK-SINGLE')).toEqual([]);
  });

  it('prefers flexible rate plans when falling back by room category', () => {
    const result = selectPreferredRateMapping([
      { id: 'nrf', ratePlan: { name: 'Double Non Refundable', code: 'DOUBLE-NRF' } },
      { id: 'flex', ratePlan: { name: 'Double Flexible', code: 'DOUBLE-FLEX' } },
      { id: 'special', ratePlan: { name: 'Double Special', code: 'DOUBLE-SPL' } },
    ]);

    expect(result?.id).toBe('flex');
  });

  it('falls back to the first available rate mapping when no flexible rate exists', () => {
    const result = selectPreferredRateMapping([
      { id: 'special', ratePlan: { name: 'Deluxe Special', code: 'DELUXE-SPL' } },
      { id: 'nrf', ratePlan: { name: 'Deluxe Non Refundable', code: 'DELUXE-NRF' } },
    ]);

    expect(result?.id).toBe('special');
  });

  it('uses summed room totals when provider reservation total is zero', () => {
    const service = new ZodomusReservationImportService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const resolved = (service as any).resolveReservationGroupTotalAmount(
      0,
      { greaterThan: () => true, toString: () => '520' } as any,
    );

    expect(resolved?.toString()).toBe('520');
  });

  it('rejects provider cancellation for checked-in imported stays', () => {
    const service = new ZodomusReservationImportService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    expect(() =>
      (service as any).assertProviderCancellationAllowed(
        BookingStatus.CHECKED_IN,
        'reservation room ext-room-1 on reservation ext-res-1',
      ),
    ).toThrow('requires manual reconciliation');
  });
});

describe('ZodomusReservationImportService roomless provider details', () => {
  function buildService(input: {
    existingStatus?: BookingStatus;
    recomputedStatus?: BookingStatus;
  } = {}) {
    const existingRoom = {
      id: 'room-line-1',
      roomCategoryId: 'category-1',
      arrivalDate: new Date('2026-07-10T00:00:00.000Z'),
      departureDate: new Date('2026-07-12T00:00:00.000Z'),
      status: input.existingStatus ?? BookingStatus.BOOKED,
    };
    const existingGroup = {
      id: 'group-1',
      status: input.existingStatus ?? BookingStatus.BOOKED,
      rooms: [existingRoom],
    };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue(undefined),
      guest: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'guest-1',
          name: 'Existing Guest',
          phone: '+911234567890',
          email: 'existing@test.local',
          idProof: 'CHANNEL_IMPORT',
          address: 'Imported from Zodomus',
        }),
        update: jest.fn().mockResolvedValue({
          id: 'guest-1',
          name: 'Updated Guest',
          phone: '+911234567890',
          email: 'existing@test.local',
          idProof: 'CHANNEL_IMPORT',
          address: 'Imported from Zodomus',
        }),
        create: jest.fn(),
      },
      reservationGroup: {
        findUnique: jest.fn().mockResolvedValue(existingGroup),
        update: jest
          .fn()
          .mockResolvedValueOnce({ id: 'group-1' })
          .mockResolvedValueOnce({ id: 'group-1', status: input.recomputedStatus ?? BookingStatus.BOOKED }),
      },
      reservationRoom: {
        findMany: jest.fn().mockResolvedValue([{ status: input.recomputedStatus ?? BookingStatus.BOOKED }]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma = {
      $transaction: jest.fn().mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
      property: {
        findUnique: jest.fn().mockResolvedValue({ timezone: 'Asia/Kolkata' }),
      },
    };
    const auditLogService = {
      record: jest.fn().mockResolvedValue(undefined),
    };
    const inventoryService = {
      releaseInventory: jest.fn().mockResolvedValue(undefined),
      allocateInventory: jest.fn().mockResolvedValue(undefined),
    };
    const pricingService = {};
    const metricsService = {};

    return {
      service: new ZodomusReservationImportService(
        prisma as never,
        auditLogService as never,
        inventoryService as never,
        pricingService as never,
        metricsService as never,
      ),
      tx,
      auditLogService,
      inventoryService,
    };
  }

  it('cancels an existing imported reservation from roomless provider detail', async () => {
    const { service, tx, inventoryService } = buildService({
      existingStatus: BookingStatus.BOOKED,
      recomputedStatus: BookingStatus.CANCELLED,
    });

    const summary = await service.importFromSync({
      channelConnectionId: 'connection-1',
      propertyId: 'property-1',
      responsePayload: {
        reservations: [
          {
            reservations: {
              reservation: {
                id: '1001956',
                status: 3,
                modifiedAt: '2026-05-07 00:00:00',
              },
              customer: {
                firstName: 'Jorge',
                lastName: 'Mendes',
              },
            },
          },
        ],
      },
    });

    expect(summary.discovered).toBe(1);
    expect(summary.cancelled).toBe(1);
    expect(summary.failed).toBe(0);
    expect(summary.skipped).toBe(0);
    expect(inventoryService.releaseInventory).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        propertyId: 'property-1',
        roomCategoryId: 'category-1',
        roomCount: 1,
      }),
    );
    expect(tx.reservationRoom.updateMany).toHaveBeenCalledWith({
      where: {
        reservationGroupId: 'group-1',
      },
      data: {
        status: BookingStatus.CANCELLED,
      },
    });
  });

  it('fails roomless modified detail because HMS cannot reconcile room changes safely', async () => {
    const { service, tx, inventoryService, auditLogService } = buildService({
      existingStatus: BookingStatus.BOOKED,
      recomputedStatus: BookingStatus.BOOKED,
    });

    const summary = await service.importFromSync({
      channelConnectionId: 'connection-1',
      propertyId: 'property-1',
      responsePayload: {
        reservations: [
          {
            reservations: {
              reservation: {
                id: '1001956',
                status: 2,
                totalPrice: '450',
                remarks: 'Modified by provider',
                modifiedAt: '2026-05-08 00:00:00',
              },
              customer: {
                firstName: 'Jorge',
                lastName: 'Mendes',
              },
            },
          },
        ],
      },
    });

    expect(summary.discovered).toBe(1);
    expect(summary.updated).toBe(0);
    expect(summary.failed).toBe(1);
    expect(summary.errors).toEqual([
      expect.stringContaining('requires full room payload before HMS can reconcile OTA modifications'),
    ]);
    expect(inventoryService.releaseInventory).not.toHaveBeenCalled();
    expect(tx.reservationRoom.updateMany).not.toHaveBeenCalled();
    expect(tx.reservationGroup.update).not.toHaveBeenCalled();
    expect(auditLogService.record).not.toHaveBeenCalled();
  });

  it('fails roomless provider cancellation for checked-in imported stays', async () => {
    const { service, tx, inventoryService, auditLogService } = buildService({
      existingStatus: BookingStatus.CHECKED_IN,
      recomputedStatus: BookingStatus.CHECKED_IN,
    });

    const summary = await service.importFromSync({
      channelConnectionId: 'connection-1',
      propertyId: 'property-1',
      responsePayload: {
        reservations: [
          {
            reservations: {
              reservation: {
                id: '1001956',
                status: 3,
                modifiedAt: '2026-05-08 00:00:00',
              },
              customer: {
                firstName: 'Jorge',
                lastName: 'Mendes',
              },
            },
          },
        ],
      },
    });

    expect(summary.discovered).toBe(1);
    expect(summary.cancelled).toBe(0);
    expect(summary.failed).toBe(1);
    expect(summary.errors).toEqual([
      expect.stringContaining('requires manual reconciliation because the stay is already checked_in'),
    ]);
    expect(inventoryService.releaseInventory).not.toHaveBeenCalled();
    expect(tx.reservationGroup.update).not.toHaveBeenCalled();
    expect(tx.reservationRoom.updateMany).not.toHaveBeenCalled();
    expect(auditLogService.record).not.toHaveBeenCalled();
  });
});

describe('ZodomusReservationImportService provider intake records', () => {
  function buildIntakeService() {
    const prisma = {
      property: {
        findUnique: jest.fn().mockResolvedValue({ timezone: 'Asia/Kolkata' }),
      },
      providerReservationIntakeRecord: {
        upsert: jest.fn().mockResolvedValue({ id: 'intake-1' }),
        update: jest.fn().mockResolvedValue({ id: 'intake-1' }),
      },
    };
    const service = new ZodomusReservationImportService(
      prisma as never,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    return { service, prisma };
  }

  const reservationPayload = {
    reservations: [
      {
        reservations: {
          reservation: {
            id: '1005532',
            status: 1,
          },
          customer: {
            firstName: 'Jorge',
            lastName: 'Mendes',
          },
          rooms: [
            {
              id: '10001',
              arrivalDate: '2026-08-11',
              departureDate: '2026-08-12',
              totalPrice: 2000,
            },
          ],
        },
      },
    ],
  };

  it('stores fetched provider reservation details before marking them imported', async () => {
    const { service, prisma } = buildIntakeService();
    jest
      .spyOn(service as any, 'importReservation')
      .mockResolvedValue({ action: 'created', reservationGroupId: 'group-1', reservationRoomIds: ['room-1'] });

    const summary = await service.importFromSync({
      channelConnectionId: 'connection-1',
      channelSyncLogId: 'sync-log-1',
      propertyId: 'property-1',
      responsePayload: reservationPayload,
    });

    expect(summary.created).toBe(1);
    expect(prisma.providerReservationIntakeRecord.upsert).toHaveBeenCalledWith({
      where: {
        channelSyncLogId_externalReservationId: {
          channelSyncLogId: 'sync-log-1',
          externalReservationId: '1005532',
        },
      },
      create: expect.objectContaining({
        channelSyncLogId: 'sync-log-1',
        channelConnectionId: 'connection-1',
        propertyId: 'property-1',
        externalReservationId: '1005532',
        status: 'FETCHED',
      }),
      update: expect.objectContaining({
        status: 'FETCHED',
        errorMessage: null,
      }),
    });
    expect(prisma.providerReservationIntakeRecord.update).toHaveBeenCalledWith({
      where: {
        channelSyncLogId_externalReservationId: {
          channelSyncLogId: 'sync-log-1',
          externalReservationId: '1005532',
        },
      },
      data: expect.objectContaining({
        status: 'IMPORTED',
        errorMessage: null,
        importedAt: expect.any(Date),
      }),
    });
  });

  it('keeps fetched provider reservation details when import fails', async () => {
    const { service, prisma } = buildIntakeService();
    jest.spyOn(service as any, 'importReservation').mockRejectedValue(new Error('inventory sold out'));

    const summary = await service.importFromSync({
      channelConnectionId: 'connection-1',
      channelSyncLogId: 'sync-log-1',
      propertyId: 'property-1',
      responsePayload: reservationPayload,
    });

    expect(summary.failed).toBe(1);
    expect(prisma.providerReservationIntakeRecord.upsert).toHaveBeenCalled();
    expect(prisma.providerReservationIntakeRecord.update).toHaveBeenCalledWith({
      where: {
        channelSyncLogId_externalReservationId: {
          channelSyncLogId: 'sync-log-1',
          externalReservationId: '1005532',
        },
      },
      data: expect.objectContaining({
        status: 'FAILED',
        errorMessage: '1005532: inventory sold out',
        failedAt: expect.any(Date),
      }),
    });
  });
});

describe('ZodomusReservationImportService stale provider stays', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('allows importing recently departed provider reservations within the backfill window', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-10T06:00:00.000Z'));

    const service = new ZodomusReservationImportService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    expect(
      (service as any).shouldSkipPastReservation(
        {
          external_reservation_id: '1009383',
          external_status: '1',
          guest_name: 'Manuel Silva',
          raw_payload: {},
          rooms: [
            {
              external_room_reservation_id: '2047368176',
              external_room_id: '90003',
              arrival_date: '2026-05-02',
              departure_date: '2026-05-05',
              raw_payload: {},
            },
          ],
        },
        'Asia/Kolkata',
      ),
    ).toBe(false);
  });

  it('skips new provider reservations whose stay already departed', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-10T06:00:00.000Z'));

    const tx = {
      $queryRaw: jest.fn().mockResolvedValue(undefined),
      reservationGroup: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      guest: {
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn().mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
      property: {
        findUnique: jest.fn().mockResolvedValue({ timezone: 'Asia/Kolkata' }),
      },
    };
    const auditLogService = {
      record: jest.fn().mockResolvedValue(undefined),
    };
    const inventoryService = {
      releaseInventory: jest.fn().mockResolvedValue(undefined),
      allocateInventory: jest.fn().mockResolvedValue(undefined),
    };
    const pricingService = {};
    const metricsService = {};
    const service = new ZodomusReservationImportService(
      prisma as never,
      auditLogService as never,
      inventoryService as never,
      pricingService as never,
      metricsService as never,
    );

    const summary = await service.importFromSync({
      channelConnectionId: 'connection-1',
      propertyId: 'property-1',
      responsePayload: {
        reservations: [
          {
            reservations: {
              reservation: {
                id: '1009383',
                status: 1,
              },
              customer: {
                firstName: 'Manuel',
                lastName: 'Silva',
              },
              rooms: [
                {
                  id: '90003',
                  arrivalDate: '2019-05-20',
                  departureDate: '2019-05-22',
                  roomReservationId: '2047368176',
                },
              ],
            },
          },
        ],
      },
    });

    expect(summary.discovered).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(summary.failed).toBe(0);
    expect(tx.reservationGroup.findUnique).toHaveBeenCalled();
    expect(tx.guest.findFirst).not.toHaveBeenCalled();
    expect(inventoryService.allocateInventory).not.toHaveBeenCalled();
  });

  it('skips new provider reservations when the same provider room lines already belong to another imported reservation', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue(undefined),
      reservationGroup: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      reservationRoom: {
        findMany: jest.fn().mockResolvedValue([
          {
            externalRoomReservationId: '2053401137',
            externalRoomId: '10001',
            arrivalDate: new Date('2026-08-11T00:00:00.000Z'),
            departureDate: new Date('2026-08-12T00:00:00.000Z'),
            reservationGroup: {
              id: 'group-existing',
              externalReservationId: '1004059',
            },
          },
          {
            externalRoomReservationId: '2053401148',
            externalRoomId: '10001',
            arrivalDate: new Date('2026-08-11T00:00:00.000Z'),
            departureDate: new Date('2026-08-12T00:00:00.000Z'),
            reservationGroup: {
              id: 'group-existing',
              externalReservationId: '1004059',
            },
          },
        ]),
      },
      guest: {
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn().mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
      property: {
        findUnique: jest.fn().mockResolvedValue({ timezone: 'Asia/Kolkata' }),
      },
    };
    const service = new ZodomusReservationImportService(
      prisma as never,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
      {
        releaseInventory: jest.fn().mockResolvedValue(undefined),
        allocateInventory: jest.fn().mockResolvedValue(undefined),
      } as never,
      {} as never,
      {} as never,
    );

    const summary = await service.importFromSync({
      channelConnectionId: 'connection-1',
      propertyId: 'property-1',
      responsePayload: {
        reservations: [
          {
            reservations: {
              reservation: {
                id: '1005532',
                status: 1,
              },
              customer: {
                firstName: 'Jorge',
                lastName: 'Mendes',
              },
              rooms: [
                {
                  id: '10001',
                  arrivalDate: '2026-08-11',
                  departureDate: '2026-08-12',
                  roomReservationId: '2053401137',
                },
                {
                  id: '10001',
                  arrivalDate: '2026-08-11',
                  departureDate: '2026-08-12',
                  roomReservationId: '2053401148',
                },
              ],
            },
          },
        ],
      },
    });

    expect(summary.discovered).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(summary.failed).toBe(0);
    expect(tx.reservationGroup.findUnique).toHaveBeenCalled();
    expect(tx.reservationRoom.findMany).toHaveBeenCalled();
    expect(tx.guest.findFirst).not.toHaveBeenCalled();
  });
});
