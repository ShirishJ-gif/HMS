import { Injectable } from '@nestjs/common';
import {
  BackgroundJobStatus,
  BookingStatus,
  HousekeepingStatus,
  PaymentTransactionStatus,
  Prisma,
} from '@prisma/client';
import { propertyIdFilter } from '../auth/property-scope';
import { AuthenticatedUser } from '../auth/auth.guard';
import { PrismaService } from '../../prisma/prisma.service';

export type NotificationFeedItem = {
  id: string;
  title: string;
  message: string;
  source: string;
  status: 'Unread' | 'Read';
  tone: 'arrival' | 'reservation' | 'housekeeping' | 'payment' | 'sync' | 'maintenance';
  created_at: Date;
};

@Injectable()
export class NotificationFeedService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(user: AuthenticatedUser | undefined, limit = 40) {
    const scopedPropertyId = propertyIdFilter(user);
    const take = Math.min(Math.max(limit, 1), 100);

    const [reservationRooms, housekeepingTasks, payments, jobs] = await Promise.all([
      this.prisma.reservationRoom.findMany({
        where: {
          ...(scopedPropertyId ? { propertyId: scopedPropertyId } : {}),
        },
        include: {
          property: true,
          room: true,
          roomCategory: true,
          reservationGroup: {
            include: {
              primaryGuest: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.housekeepingTask.findMany({
        where: {
          ...(scopedPropertyId ? { propertyId: scopedPropertyId } : {}),
        },
        include: {
          property: true,
          room: true,
        },
        orderBy: { updatedAt: 'desc' },
        take,
      }),
      this.prisma.paymentTransaction.findMany({
        where: {
          billing: {
            reservationRoom: {
              ...(scopedPropertyId ? { propertyId: scopedPropertyId } : {}),
            },
          },
        },
        include: {
          billing: {
            include: {
              reservationRoom: {
                include: {
                  property: true,
                  reservationGroup: {
                    include: {
                      primaryGuest: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.backgroundJob.findMany({
        where: {
          ...(scopedPropertyId ? { propertyId: scopedPropertyId } : {}),
        },
        include: {
          property: true,
        },
        orderBy: { updatedAt: 'desc' },
        take,
      }),
    ]);

    const items: NotificationFeedItem[] = [
      ...reservationRooms.map((room) => this.reservationNotification(room)),
      ...housekeepingTasks.map((task) => this.housekeepingNotification(task)),
      ...payments.map((payment) => this.paymentNotification(payment)),
      ...jobs.map((job) => this.jobNotification(job)),
    ];

    return {
      data: items
        .filter((item): item is NotificationFeedItem => Boolean(item))
        .sort((a, b) => b.created_at.getTime() - a.created_at.getTime())
        .slice(0, take),
      meta: {
        limit: take,
        unread: items.filter((item) => item.status === 'Unread').length,
      },
    };
  }

  private reservationNotification(
    room: Prisma.ReservationRoomGetPayload<{
      include: {
        property: true;
        room: true;
        roomCategory: true;
        reservationGroup: { include: { primaryGuest: true } };
      };
    }>,
  ): NotificationFeedItem {
    const guestName = room.guestName ?? room.reservationGroup.primaryGuest?.name ?? 'Guest';
    const roomLabel = room.room?.roomNumber ? `Room ${room.room.roomNumber}` : room.roomCategory.name;
    const source = room.reservationGroup.source ?? 'HMS';
    const isArrivalPending = room.status === BookingStatus.BOOKED && this.isToday(room.arrivalDate);

    return {
      id: `reservation-${room.id}`,
      title: isArrivalPending ? 'Guest arrival due' : 'Reservation arrived',
      message: `${guestName} has a ${source} reservation for ${roomLabel}, ${this.dateRange(room.arrivalDate, room.departureDate)} at ${room.property.name}.`,
      source: 'Reservations',
      status: isArrivalPending ? 'Unread' : 'Read',
      tone: isArrivalPending ? 'arrival' : 'reservation',
      created_at: room.createdAt,
    };
  }

  private housekeepingNotification(
    task: Prisma.HousekeepingTaskGetPayload<{ include: { property: true; room: true } }>,
  ): NotificationFeedItem {
    const needsAttention = task.status !== HousekeepingStatus.CLEAN && task.status !== HousekeepingStatus.INSPECTED;
    const isOutOfService = task.status === HousekeepingStatus.OUT_OF_SERVICE;
    const statusLabel = this.humanize(task.status);

    return {
      id: `housekeeping-${task.id}`,
      title: isOutOfService ? 'Room out of service' : `Housekeeping ${statusLabel.toLowerCase()}`,
      message: `Room ${task.room.roomNumber} at ${task.property.name} is ${statusLabel.toLowerCase()}${task.notes ? `: ${task.notes}` : '.'}`,
      source: 'Housekeeping',
      status: needsAttention ? 'Unread' : 'Read',
      tone: isOutOfService ? 'maintenance' : 'housekeeping',
      created_at: task.updatedAt,
    };
  }

  private paymentNotification(
    payment: Prisma.PaymentTransactionGetPayload<{
      include: {
        billing: {
          include: {
            reservationRoom: {
              include: {
                property: true;
                reservationGroup: { include: { primaryGuest: true } };
              };
            };
          };
        };
      };
    }>,
  ): NotificationFeedItem {
    const reservationRoom = payment.billing.reservationRoom;
    const guestName = reservationRoom?.guestName ?? reservationRoom?.reservationGroup.primaryGuest?.name ?? 'Guest';
    const propertyName = reservationRoom?.property.name ?? 'property';
    const amount = payment.amount.toNumber().toLocaleString('en-IN', { maximumFractionDigits: 2 });
    const failed = payment.status === PaymentTransactionStatus.FAILED;

    return {
      id: `payment-${payment.id}`,
      title: failed ? 'Payment failed' : payment.status === PaymentTransactionStatus.REFUNDED ? 'Payment refunded' : 'Payment captured',
      message: `${payment.provider} payment of INR ${amount} for ${guestName} at ${propertyName} is ${this.humanize(payment.status).toLowerCase()}.`,
      source: 'Payments',
      status: failed ? 'Unread' : 'Read',
      tone: 'payment',
      created_at: payment.createdAt,
    };
  }

  private jobNotification(
    job: Prisma.BackgroundJobGetPayload<{ include: { property: true } }>,
  ): NotificationFeedItem {
    const failed = job.status === BackgroundJobStatus.DEAD_LETTER;
    const source = job.type === 'CHANNEL_SYNC' ? 'Channel sync' : job.type === 'NOTIFICATION_SEND' ? 'Notification sender' : 'Webhook processor';
    const propertyName = job.property?.name ?? 'system';

    return {
      id: `job-${job.id}`,
      title: failed ? `${source} needs attention` : `${source} ${this.humanize(job.status).toLowerCase()}`,
      message: failed
        ? `${source} for ${propertyName} failed after ${job.attempts} attempt${job.attempts === 1 ? '' : 's'}${job.lastError ? `: ${job.lastError}` : '.'}`
        : `${source} for ${propertyName} is ${this.humanize(job.status).toLowerCase()}.`,
      source,
      status: failed ? 'Unread' : 'Read',
      tone: job.type === 'CHANNEL_SYNC' ? 'sync' : 'reservation',
      created_at: job.updatedAt,
    };
  }

  private isToday(value: Date) {
    const today = new Date();
    return value.toISOString().slice(0, 10) === today.toISOString().slice(0, 10);
  }

  private dateRange(from: Date, to: Date) {
    return `${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}`;
  }

  private humanize(value: string) {
    return value
      .toLowerCase()
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
}
