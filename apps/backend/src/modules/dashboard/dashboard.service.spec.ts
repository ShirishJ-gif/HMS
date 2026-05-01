import { Prisma, RoomStatus } from '@prisma/client';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  const prisma = {
    booking: {
      count: jest.fn(),
    },
    room: {
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
    prisma.booking.count.mockResolvedValue(3);
    prisma.room.count.mockResolvedValueOnce(4).mockResolvedValueOnce(10);
    prisma.billing.aggregate.mockResolvedValue({
      _sum: {
        total: new Prisma.Decimal('12500.50'),
      },
    });

    await expect(service.getSummary(new Date('2026-04-28T08:00:00.000Z'))).resolves.toEqual({
      date: '2026-04-28',
      total_bookings_today: 3,
      occupancy_rate: 40,
      occupied_rooms: 4,
      total_rooms: 10,
      revenue_today: 12500.5,
    });

    expect(prisma.room.count).toHaveBeenNthCalledWith(1, {
      where: {
        status: RoomStatus.OCCUPIED,
      },
    });
  });

  it('returns zero occupancy and revenue when there are no rooms or paid invoices', async () => {
    prisma.booking.count.mockResolvedValue(0);
    prisma.room.count.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    prisma.billing.aggregate.mockResolvedValue({
      _sum: {
        total: null,
      },
    });

    await expect(service.getSummary(new Date('2026-04-28T08:00:00.000Z'))).resolves.toMatchObject({
      total_bookings_today: 0,
      occupancy_rate: 0,
      occupied_rooms: 0,
      total_rooms: 0,
      revenue_today: 0,
    });
  });
});
