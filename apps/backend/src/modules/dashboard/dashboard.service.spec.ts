import { Prisma, RoomStatus } from '@prisma/client';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  const prisma = {
    reservationGroup: {
      count: jest.fn(),
    },
    reservationRoom: {
      count: jest.fn(),
    },
    room: {
      count: jest.fn(),
    },
    housekeepingTask: {
      count: jest.fn(),
    },
    billing: {
      aggregate: jest.fn(),
    },
  };

  let service: DashboardService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DashboardService(prisma as never);
  });

  it('returns dashboard summary metrics', async () => {
    prisma.reservationGroup.count.mockResolvedValueOnce(3).mockResolvedValueOnce(4);
    prisma.reservationRoom.count.mockResolvedValueOnce(5).mockResolvedValueOnce(2);
    prisma.room.count.mockResolvedValueOnce(4).mockResolvedValueOnce(10);
    prisma.housekeepingTask.count.mockResolvedValue(6);
    prisma.billing.aggregate.mockResolvedValueOnce({
      _sum: {
        total: new Prisma.Decimal('12500.50'),
      },
    }).mockResolvedValueOnce({
      _sum: {
        total: new Prisma.Decimal('4500.00'),
      },
    });

    await expect(service.getSummary(new Date('2026-04-28T08:00:00.000Z'))).resolves.toEqual({
      date: '2026-04-28',
      reservation_groups_today: 3,
      occupancy_rate: 40,
      occupied_rooms: 4,
      total_rooms: 10,
      revenue_today: 12500.5,
      reservation_room_arrivals_today: 5,
      reservation_room_departures_today: 2,
      active_reservation_groups: 4,
      open_housekeeping_tasks: 6,
      pending_balance_total: 4500,
    });

    expect(prisma.room.count).toHaveBeenNthCalledWith(1, {
      where: {
        status: RoomStatus.OCCUPIED,
      },
    });
  });

  it('returns zero occupancy and revenue when there are no rooms or paid invoices', async () => {
    prisma.reservationGroup.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    prisma.reservationRoom.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    prisma.room.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    prisma.housekeepingTask.count.mockResolvedValue(0);
    prisma.billing.aggregate.mockResolvedValueOnce({
      _sum: {
        total: null,
      },
    }).mockResolvedValueOnce({
      _sum: {
        total: null,
      },
    });

    await expect(service.getSummary(new Date('2026-04-28T08:00:00.000Z'))).resolves.toMatchObject({
      reservation_groups_today: 0,
      occupancy_rate: 0,
      occupied_rooms: 0,
      total_rooms: 0,
      revenue_today: 0,
      open_housekeeping_tasks: 0,
    });
  });
});
