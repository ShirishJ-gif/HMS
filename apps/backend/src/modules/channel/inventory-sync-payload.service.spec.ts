import { BookingStatus, RoomStatus } from '@prisma/client';
import { InventorySyncPayloadService } from './inventory-sync-payload.service';

describe('InventorySyncPayloadService', () => {
  const prisma = {
    room: {
      findMany: jest.fn(),
    },
    reservationRoom: {
      findMany: jest.fn(),
    },
  };
  const roomOutOfServiceCalendarService = {
    loadRoomDateMap: jest.fn(),
    isRoomOutOfServiceOnDate: jest.fn(),
  };

  let service: InventorySyncPayloadService;

  beforeEach(() => {
    jest.clearAllMocks();
    roomOutOfServiceCalendarService.loadRoomDateMap.mockResolvedValue(new Map());
    roomOutOfServiceCalendarService.isRoomOutOfServiceOnDate.mockReturnValue(false);
    service = new InventorySyncPayloadService(prisma as never, roomOutOfServiceCalendarService as never);
  });

  it('builds one inventory row per mapped room per date', async () => {
    prisma.room.findMany.mockResolvedValue([
      { id: 'room-1', roomCategoryId: 'cat-1', status: RoomStatus.AVAILABLE },
      { id: 'room-2', roomCategoryId: 'cat-1', status: RoomStatus.MAINTENANCE },
      { id: 'room-3', roomCategoryId: 'cat-1', status: RoomStatus.AVAILABLE },
    ]);
    prisma.reservationRoom.findMany.mockResolvedValue([
      {
        roomCategoryId: 'cat-1',
        arrivalDate: new Date('2026-06-01T00:00:00.000Z'),
        departureDate: new Date('2026-06-03T00:00:00.000Z'),
        status: BookingStatus.BOOKED,
      },
    ]);

    const rows = await service.buildDailyInventoryRows(
      'property-1',
      [
        {
          roomCategoryId: 'cat-1',
          externalRoomId: 'ext-room-1',
          roomCategory: { code: 'DELUXE' },
        },
      ],
      {
        from: '2026-06-01',
        to: '2026-06-03',
      },
    );

    expect(rows).toEqual([
      {
        date: '2026-06-01',
        external_room_id: 'ext-room-1',
        room_category_id: 'cat-1',
        room_category_code: 'DELUXE',
        total_inventory: 3,
        out_of_service: 1,
        booked: 1,
        available: 1,
      },
      {
        date: '2026-06-02',
        external_room_id: 'ext-room-1',
        room_category_id: 'cat-1',
        room_category_code: 'DELUXE',
        total_inventory: 3,
        out_of_service: 1,
        booked: 1,
        available: 1,
      },
      {
        date: '2026-06-03',
        external_room_id: 'ext-room-1',
        room_category_id: 'cat-1',
        room_category_code: 'DELUXE',
        total_inventory: 3,
        out_of_service: 1,
        booked: 0,
        available: 2,
      },
    ]);
  });

  it('counts dated out-of-service periods without requiring maintenance status', async () => {
    prisma.room.findMany.mockResolvedValue([
      { id: 'room-1', roomCategoryId: 'cat-1', status: RoomStatus.AVAILABLE },
      { id: 'room-2', roomCategoryId: 'cat-1', status: RoomStatus.AVAILABLE },
    ]);
    prisma.reservationRoom.findMany.mockResolvedValue([]);
    roomOutOfServiceCalendarService.loadRoomDateMap.mockResolvedValue(
      new Map([
        ['room-2', new Set(['2026-06-02'])],
      ]),
    );
    roomOutOfServiceCalendarService.isRoomOutOfServiceOnDate.mockImplementation(
      (roomId: string, date: Date, roomDateMap: Map<string, Set<string>>) =>
        roomDateMap.get(roomId)?.has(date.toISOString().slice(0, 10)) ?? false,
    );

    const rows = await service.buildDailyInventoryRows(
      'property-1',
      [
        {
          roomCategoryId: 'cat-1',
          externalRoomId: 'ext-room-1',
          roomCategory: { code: 'DELUXE' },
        },
      ],
      {
        from: '2026-06-01',
        to: '2026-06-02',
      },
    );

    expect(rows).toEqual([
      expect.objectContaining({
        date: '2026-06-01',
        out_of_service: 0,
        available: 2,
      }),
      expect.objectContaining({
        date: '2026-06-02',
        out_of_service: 1,
        available: 1,
      }),
    ]);
  });
});
