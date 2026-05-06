import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  AuditAction,
  BackgroundJobStatus,
  BackgroundJobType,
  ChannelProvider,
  ChannelConnectionStatus,
  ChannelSyncStatus,
  ChannelSyncType,
  Prisma,
  UserRole,
  WebhookEventStatus,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginatedResponse, paginationParams } from '../../common/pagination/paginated-response';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthenticatedUser } from '../auth/auth.guard';
import { assertCanAccessProperty, propertyIdFilter } from '../auth/property-scope';
import { ChannelProviderService } from '../channel/channel-provider.service';
import { InventorySyncPayloadService } from '../channel/inventory-sync-payload.service';
import { ZodomusReservationImportService } from '../channel/zodomus-reservation-import.service';
import { MetricsService } from '../metrics/metrics.service';
import {
  CheckInReminderPayload,
  OwnerReservationNotificationPayload,
  ReservationConfirmationPayload,
  WhatsAppNotificationService,
} from '../notification/whatsapp-notification.service';

type EnqueueJobInput = {
  type: BackgroundJobType;
  propertyId?: string | null;
  dedupeKey?: string;
  entityType?: string;
  entityId?: string;
  payload: Prisma.InputJsonValue;
  maxAttempts?: number;
  runAt?: Date;
};

type PersistedInventorySyncRowResult = {
  date: string;
  external_room_id: string;
  available: number;
  status: 'SUCCEEDED' | 'FAILED';
  error_message?: string | null;
  provider_response?: Prisma.JsonValue | null;
};

@Injectable()
export class BackgroundJobService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('BackgroundJobWorker');
  private readonly workerId = randomUUID();
  private workerTimer?: NodeJS.Timeout;
  private processing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly channelProviderService: ChannelProviderService,
    private readonly inventorySyncPayloadService: InventorySyncPayloadService,
    private readonly zodomusReservationImportService: ZodomusReservationImportService,
    private readonly metricsService: MetricsService,
    private readonly whatsappNotificationService: WhatsAppNotificationService,
  ) {}

  onModuleInit() {
    if (process.env.JOB_WORKER_DISABLED === 'true') {
      return;
    }

    const pollMs = this.readPositiveInteger(process.env.JOB_WORKER_POLL_MS, 2000);
    this.workerTimer = setInterval(() => {
      void this.processDueJobs().catch((error: unknown) => {
        this.logger.error(
          JSON.stringify({
            worker_id: this.workerId,
            message: error instanceof Error ? error.message : 'Background job loop failed',
          }),
        );
      });
    }, pollMs);
    this.workerTimer.unref();
  }

  onModuleDestroy() {
    if (this.workerTimer) {
      clearInterval(this.workerTimer);
    }
  }

  async enqueue(input: EnqueueJobInput) {
    try {
      const job = await this.prisma.backgroundJob.create({
        data: {
          type: input.type,
          propertyId: input.propertyId ?? undefined,
          dedupeKey: input.dedupeKey,
          entityType: input.entityType,
          entityId: input.entityId,
          payload: input.payload,
          maxAttempts: input.maxAttempts ?? 3,
          runAt: input.runAt ?? new Date(),
        },
      });

      this.metricsService.recordBackgroundJobQueued(job.type);

      return this.toResponse(job);
    } catch (error) {
      if (
        input.dedupeKey &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await this.prisma.backgroundJob.findUnique({
          where: { dedupeKey: input.dedupeKey },
        });

        if (!existing) {
          throw error;
        }

        return this.toResponse(existing);
      }

      throw error;
    }
  }

  async queueInventorySyncsForProperty(
    propertyId: string,
    options: {
      trigger: string;
      sourceConnectionId?: string;
    },
  ) {
    const connections = await this.prisma.channelConnection.findMany({
      where: {
        propertyId,
        provider: ChannelProvider.ZODOMUS,
        status: ChannelConnectionStatus.ACTIVE,
        ...(options.sourceConnectionId ? { id: { not: options.sourceConnectionId } } : {}),
      },
      include: {
        roomMappings: { include: { roomCategory: true } },
        syncLogs: {
          where: {
            syncType: ChannelSyncType.INVENTORY,
            status: ChannelSyncStatus.QUEUED,
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    for (const connection of connections) {
      if (!this.isReadyForInventoryFanout(connection.credentials) || connection.roomMappings.length === 0) {
        continue;
      }

      if (connection.syncLogs.length > 0) {
        continue;
      }

      const syncWindowDays = this.readSyncWindowDays(connection.credentials);
      const syncWindow = this.currentSyncWindow(syncWindowDays);
      const inventory = await this.inventorySyncPayloadService.buildDailyInventoryRows(
        connection.propertyId,
        connection.roomMappings,
        syncWindow,
      );

      const queuedLog = await this.prisma.channelSyncLog.create({
        data: {
          channelConnectionId: connection.id,
          syncType: ChannelSyncType.INVENTORY,
          status: ChannelSyncStatus.QUEUED,
          requestPayload: {
            from: syncWindow.from,
            to: syncWindow.to,
            inventory,
            trigger: options.trigger,
            ...(options.sourceConnectionId ? { source_connection_id: options.sourceConnectionId } : {}),
          } satisfies Prisma.InputJsonObject,
        },
      });

      await this.enqueue({
        type: BackgroundJobType.CHANNEL_SYNC,
        propertyId,
        dedupeKey: `channel-sync:${queuedLog.id}`,
        entityType: 'channel_sync_log',
        entityId: queuedLog.id,
        payload: {
          channel_sync_log_id: queuedLog.id,
        },
        maxAttempts: 3,
      });

      this.metricsService.recordChannelSyncQueued(ChannelSyncType.INVENTORY, connection.provider);
    }
  }

  async findAll(query: PaginationQueryDto, user?: AuthenticatedUser) {
    const { page, limit, skip, take } = paginationParams(query);
    const scopedPropertyId = propertyIdFilter(user);
    const search = query.search?.trim();
    const where: Prisma.BackgroundJobWhereInput = {
      ...(scopedPropertyId ? { propertyId: scopedPropertyId } : {}),
      ...(search
        ? {
            OR: [
              { dedupeKey: { contains: search, mode: 'insensitive' } },
              { entityType: { contains: search, mode: 'insensitive' } },
              { entityId: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [jobs, total] = await this.prisma.$transaction([
      this.prisma.backgroundJob.findMany({
        where,
        orderBy: [{ runAt: 'asc' }, { createdAt: 'asc' }],
        skip,
        take,
      }),
      this.prisma.backgroundJob.count({ where }),
    ]);

    return paginatedResponse(jobs.map((job) => this.toResponse(job)), total, page, limit);
  }

  async retry(id: string, user?: AuthenticatedUser) {
    const existing = await this.prisma.backgroundJob.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Background job not found');
    }

    if (existing.propertyId) {
      assertCanAccessProperty(user, existing.propertyId);
    } else if (user?.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('You do not have access to this background job');
    }

    if (existing.status !== BackgroundJobStatus.DEAD_LETTER) {
      throw new ConflictException('Only dead-letter jobs can be retried');
    }

    const job = await this.prisma.backgroundJob.update({
      where: { id },
      data: {
        status: BackgroundJobStatus.PENDING,
        attempts: 0,
        runAt: new Date(),
        lockedAt: null,
        lockedBy: null,
        lastError: null,
        deadLetteredAt: null,
        completedAt: null,
      },
    });

    await this.auditLogService.record({
      action: AuditAction.UPDATE,
      entityType: 'background_job',
      entityId: job.id,
      propertyId: job.propertyId,
      summary: `Retried ${job.type.toLowerCase()} background job`,
      metadata: {
        status: job.status,
        dedupe_key: job.dedupeKey,
      },
      user,
    });

    this.metricsService.recordBackgroundJobRetried(job.type);

    return this.toResponse(job);
  }

  async processDueJobs(limit = this.readPositiveInteger(process.env.JOB_WORKER_BATCH_SIZE, 10)) {
    if (this.processing) {
      return 0;
    }

    this.processing = true;
    let processed = 0;

    try {
      while (processed < limit) {
        const job = await this.claimNextJob();
        if (!job) {
          break;
        }

        processed += 1;
        await this.handleClaimedJob(job);
      }

      return processed;
    } finally {
      this.processing = false;
    }
  }

  private async claimNextJob() {
    const candidate = await this.prisma.backgroundJob.findFirst({
      where: {
        status: BackgroundJobStatus.PENDING,
        runAt: { lte: new Date() },
      },
      orderBy: [{ runAt: 'asc' }, { createdAt: 'asc' }],
    });

    if (!candidate) {
      return null;
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT COUNT(*)::int
        FROM (
          SELECT pg_advisory_xact_lock(hashtext(${candidate.id}))
        ) AS background_job_lock
      `;

      const locked = await tx.backgroundJob.findUnique({
        where: { id: candidate.id },
      });

      if (
        !locked ||
        locked.status !== BackgroundJobStatus.PENDING ||
        locked.runAt > new Date()
      ) {
        return null;
      }

      return tx.backgroundJob.update({
        where: { id: locked.id },
        data: {
          status: BackgroundJobStatus.PROCESSING,
          attempts: { increment: 1 },
          lockedAt: new Date(),
          lockedBy: this.workerId,
        },
      });
    });
  }

  private async handleClaimedJob(
    job: {
      id: string;
      type: BackgroundJobType;
      propertyId: string | null;
      payload: Prisma.JsonValue;
      attempts: number;
      maxAttempts: number;
    },
  ) {
    try {
      await this.execute(job);

      await this.prisma.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: BackgroundJobStatus.SUCCEEDED,
          completedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          lastError: null,
        },
      });

      this.metricsService.recordBackgroundJobCompleted(job.type, BackgroundJobStatus.SUCCEEDED);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Background job failed';
      const nextStatus =
        job.attempts >= job.maxAttempts
          ? BackgroundJobStatus.DEAD_LETTER
          : BackgroundJobStatus.PENDING;

      await this.prisma.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: nextStatus,
          runAt:
            nextStatus === BackgroundJobStatus.PENDING
              ? new Date(Date.now() + this.retryDelayMs(job.attempts))
              : new Date(),
          lockedAt: null,
          lockedBy: null,
          lastError: message,
          deadLetteredAt:
            nextStatus === BackgroundJobStatus.DEAD_LETTER ? new Date() : null,
        },
      });

      if (job.type === BackgroundJobType.WEBHOOK_PROCESS) {
        await this.markWebhookFailure(job.payload, message, nextStatus);
      } else if (job.type === BackgroundJobType.CHANNEL_SYNC) {
        await this.markChannelSyncFailure(job.payload, message);
      } else if (job.type === BackgroundJobType.NOTIFICATION_SEND) {
        await this.markNotificationFailure(job.payload);
      }

      this.metricsService.recordBackgroundJobCompleted(job.type, nextStatus);

      this.logger.error(
        JSON.stringify({
          worker_id: this.workerId,
          job_id: job.id,
          job_type: job.type,
          status: nextStatus,
          attempt: job.attempts,
          message,
        }),
      );
    }
  }

  private async execute(job: {
    id: string;
    type: BackgroundJobType;
    propertyId: string | null;
    payload: Prisma.JsonValue;
  }) {
    switch (job.type) {
      case BackgroundJobType.WEBHOOK_PROCESS:
        await this.processWebhookJob(job);
        return;
      case BackgroundJobType.CHANNEL_SYNC:
        await this.processChannelSyncJob(job);
        return;
      case BackgroundJobType.NOTIFICATION_SEND:
        await this.processNotificationJob(job);
        return;
      default:
        throw new Error(`Unsupported background job type: ${job.type}`);
    }
  }

  private async processWebhookJob(job: {
    id: string;
    propertyId: string | null;
    payload: Prisma.JsonValue;
  }) {
    const payload = this.readObject(job.payload);
    const webhookEventId = this.readString(payload.webhook_event_id);
    if (!webhookEventId) {
      throw new Error('Webhook process job is missing webhook_event_id');
    }

    const event = await this.prisma.webhookEvent.findUnique({
      where: { id: webhookEventId },
    });

    if (!event) {
      throw new NotFoundException('Webhook event not found for background job');
    }

    if (event.status === WebhookEventStatus.PROCESSED) {
      return;
    }

    if (event.domain === 'CHANNEL' && event.provider === 'zodomus') {
      await this.processZodomusChannelWebhook(event);
    }

    const processed = await this.prisma.webhookEvent.update({
      where: { id: event.id },
      data: {
        status: WebhookEventStatus.PROCESSED,
        processingError: null,
        processedAt: new Date(),
      },
    });

    await this.auditLogService.record({
      action: AuditAction.CREATE,
      entityType: 'webhook_event',
      entityId: processed.id,
      propertyId: processed.propertyId,
      summary: `Processed ${processed.domain.toLowerCase()} webhook for ${processed.provider}`,
      metadata: {
        external_event_id: processed.externalEventId,
        event_type: processed.eventType,
        background_job_id: job.id,
      },
    });
  }

  private async processZodomusChannelWebhook(event: {
    id: string;
    payload: Prisma.JsonValue;
    eventType: string;
    externalEventId: string | null;
    provider: string;
  }) {
    const payload = this.readObject(event.payload);
    const providerPropertyId =
      this.readString(payload.propertyId) ??
      this.readString(payload.property_id) ??
      this.readString(payload.hotelId) ??
      this.readString(payload.hotel_id);
    const providerChannelId =
      this.readString(payload.channelId) ??
      this.readString(payload.channel_id);
    const reservationId =
      this.readString(payload.reservationId) ??
      this.readString(payload.reservation_id) ??
      this.readString(payload.bookingId) ??
      this.readString(payload.booking_id);

    const candidateConnections = await this.prisma.channelConnection.findMany({
      where: {
        provider: ChannelProvider.ZODOMUS,
        status: ChannelConnectionStatus.ACTIVE,
        ...(providerPropertyId ? { externalHotelId: providerPropertyId } : {}),
      },
    });

    const matchingConnections = candidateConnections.filter((connection) => {
      const channelCode = this.readConnectionChannelCode(connection.credentials);
      if (providerChannelId && channelCode && providerChannelId !== channelCode) {
        return false;
      }

      return this.isReadyForInventoryFanout(connection.credentials);
    });

    if (matchingConnections.length === 0) {
      throw new NotFoundException('No ready Zodomus channel connection matched the webhook event.');
    }

    for (const connection of matchingConnections) {
      const syncLog = await this.prisma.channelSyncLog.create({
        data: {
          channelConnectionId: connection.id,
          syncType: ChannelSyncType.BOOKINGS,
          status: ChannelSyncStatus.QUEUED,
          requestPayload: {
            reservation_import: {
              mode: 'webhook_trigger',
              webhook_event_id: event.id,
              event_type: event.eventType,
              external_event_id: event.externalEventId,
              provider_property_id: providerPropertyId ?? null,
              provider_channel_id: providerChannelId ?? null,
              reservation_id: reservationId ?? null,
            },
          } satisfies Prisma.InputJsonObject,
        },
      });

      await this.enqueue({
        type: BackgroundJobType.CHANNEL_SYNC,
        propertyId: connection.propertyId,
        dedupeKey: `webhook-channel-sync:${event.id}:${connection.id}`,
        entityType: 'channel_sync_log',
        entityId: syncLog.id,
        payload: {
          channel_sync_log_id: syncLog.id,
        },
        maxAttempts: 3,
      });

      this.metricsService.recordChannelSyncQueued(ChannelSyncType.BOOKINGS, connection.provider);
    }
  }

  private async processChannelSyncJob(job: {
    id: string;
    payload: Prisma.JsonValue;
  }) {
    const payload = this.readObject(job.payload);
    const syncLogId = this.readString(payload.channel_sync_log_id);
    if (!syncLogId) {
      throw new Error('Channel sync job is missing channel_sync_log_id');
    }

    const log = await this.prisma.channelSyncLog.findUnique({
      where: { id: syncLogId },
      include: {
        channelConnection: true,
      },
    });

    if (!log) {
      throw new NotFoundException('Channel sync log not found');
    }

    const connection = log.channelConnection;
    const requestPayload = this.readObject(log.requestPayload);
    const responsePayload = await this.channelProviderService.push({
      provider: connection.provider,
      property_id: connection.propertyId,
      external_hotel_id: connection.externalHotelId,
      credentials: connection.credentials,
      sync_type: log.syncType as ChannelSyncType,
      ...(requestPayload as Prisma.InputJsonObject),
    });

    const finalResponsePayload =
      connection.provider === ChannelProvider.ZODOMUS && log.syncType === ChannelSyncType.BOOKINGS
        ? await (async () => {
            const importSummary = await this.zodomusReservationImportService.importFromSync({
              channelConnectionId: connection.id,
              propertyId: connection.propertyId,
              responsePayload: responsePayload as unknown as Prisma.JsonValue,
            });

            await this.queueImportedReservationNotifications(
              connection.propertyId,
              this.readStringArray(
                this.readObject(importSummary).created_reservation_group_ids,
              ),
            );

            await this.queueInventoryFanoutAfterReservationImport(connection.id, connection.propertyId, importSummary);

            return {
              ...(responsePayload as Prisma.InputJsonObject),
              import_summary: importSummary,
            } satisfies Prisma.InputJsonObject;
          })()
        : responsePayload;

    const syncOutcome = this.resolveSyncOutcome(log.syncType, finalResponsePayload);
    const updated = await this.prisma.channelSyncLog.update({
      where: { id: log.id },
      data: {
        status: syncOutcome.status,
        responsePayload: finalResponsePayload,
        errorMessage: syncOutcome.errorMessage,
      },
    });
    await this.persistInventorySyncRows(updated.id, connection.id, finalResponsePayload);

    await this.auditLogService.record({
      action: AuditAction.CHANNEL_SYNC,
      entityType: 'channel_sync_log',
      entityId: updated.id,
      propertyId: connection.propertyId,
      summary:
        updated.status === ('PARTIAL_FAILED' as ChannelSyncStatus)
          ? `${connection.provider} ${log.syncType} sync partially failed`
          : `${connection.provider} ${log.syncType} sync succeeded`,
      metadata: {
        channel_connection_id: connection.id,
        background_job_id: job.id,
      },
    });

    this.metricsService.recordChannelSyncCompleted(log.syncType, connection.provider, updated.status);
  }

  private async processNotificationJob(job: {
    payload: Prisma.JsonValue;
  }) {
    const payload = this.readObject(job.payload);
    const template = this.requiredString(payload.template, 'template');

    switch (template) {
      case 'reservation_confirmation':
        await this.whatsappNotificationService.sendReservationConfirmation(
          this.readBookingConfirmationPayload(payload),
        );
        break;
      case 'owner_reservation_notification':
        await this.whatsappNotificationService.sendOwnerReservationNotification(
          this.readOwnerBookingNotificationPayload(payload),
        );
        break;
      case 'check_in_reminder':
        await this.whatsappNotificationService.sendCheckInReminder(
          this.readCheckInReminderPayload(payload),
        );
        break;
      default:
        throw new Error(`Unsupported notification template: ${template}`);
    }

    this.metricsService.recordNotificationSend(template, 'sent');
  }

  private async queueImportedReservationNotifications(propertyId: string, reservationGroupIds: string[]) {
    if (reservationGroupIds.length === 0) {
      return;
    }

    const groups = await this.prisma.reservationGroup.findMany({
      where: {
        id: { in: reservationGroupIds },
      },
      include: {
        property: true,
        primaryGuest: true,
        rooms: {
          include: {
            roomCategory: true,
          },
          orderBy: [{ arrivalDate: 'asc' }, { createdAt: 'asc' }],
        },
      },
    });

    for (const group of groups) {
      const guestPhone = group.primaryGuest?.phone;
      const guestName = group.primaryGuest?.name ?? 'Imported guest';
      const roomSummary = this.describeImportedReservationRooms(group.rooms);
      const firstArrival = group.rooms[0]?.arrivalDate;
      const lastDeparture = group.rooms.reduce<Date | null>(
        (latest, room) => (!latest || room.departureDate > latest ? room.departureDate : latest),
        null,
      );

      if (!firstArrival || !lastDeparture) {
        continue;
      }

      if (guestPhone) {
        await this.enqueue({
          type: BackgroundJobType.NOTIFICATION_SEND,
          propertyId,
          dedupeKey: `notification:imported-reservation-confirmation:${group.id}`,
          entityType: 'reservation_group',
          entityId: group.id,
          payload: {
            template: 'reservation_confirmation',
            guest_name: guestName,
            phone: guestPhone,
            room_number: roomSummary,
            check_in_date: firstArrival.toISOString(),
            check_out_date: lastDeparture.toISOString(),
          },
          maxAttempts: 3,
        });
      }

      await this.enqueue({
        type: BackgroundJobType.NOTIFICATION_SEND,
        propertyId,
        dedupeKey: `notification:imported-owner-reservation:${group.id}`,
        entityType: 'reservation_group',
        entityId: group.id,
        payload: {
          template: 'owner_reservation_notification',
          owner_phone: group.property.phone,
          property_name: group.property.name,
          guest_name: guestName,
          guest_phone: guestPhone ?? 'Imported guest phone unavailable',
          room_category_name: roomSummary,
          check_in_date: firstArrival.toISOString(),
          check_out_date: lastDeparture.toISOString(),
          total_amount: group.totalAmount?.toString() ?? '0.00',
        },
        maxAttempts: 3,
      });
    }
  }

  private async queueInventoryFanoutAfterReservationImport(
    sourceConnectionId: string,
    propertyId: string,
    importSummary: Prisma.InputJsonObject,
  ) {
    if (!this.didReservationImportChangeInventory(importSummary)) {
      return;
    }

    await this.queueInventorySyncsForProperty(propertyId, {
      trigger: 'reservation_import_fanout',
      sourceConnectionId,
    });
  }

  private async markWebhookFailure(
    payloadValue: Prisma.JsonValue,
    message: string,
    status: BackgroundJobStatus,
  ) {
    const payload = this.readObject(payloadValue);
    const webhookEventId = this.readString(payload.webhook_event_id);
    if (!webhookEventId) {
      return;
    }

    await this.prisma.webhookEvent.updateMany({
      where: {
        id: webhookEventId,
        status: { not: WebhookEventStatus.PROCESSED },
      },
      data: {
        status:
          status === BackgroundJobStatus.DEAD_LETTER
            ? WebhookEventStatus.FAILED
            : WebhookEventStatus.RECEIVED,
        processingError: message,
      },
    });
  }

  private async markChannelSyncFailure(payloadValue: Prisma.JsonValue, message: string) {
    const payload = this.readObject(payloadValue);
    const syncLogId = this.readString(payload.channel_sync_log_id);
    if (!syncLogId) {
      return;
    }

    await this.prisma.channelSyncLog.updateMany({
      where: {
        id: syncLogId,
        status: { not: ChannelSyncStatus.SUCCEEDED },
      },
      data: {
        status: ChannelSyncStatus.FAILED,
        errorMessage: message,
      },
    });
  }

  private async markNotificationFailure(payloadValue: Prisma.JsonValue) {
    const payload = this.readObject(payloadValue);
    const template = this.readString(payload.template);
    if (template) {
      this.metricsService.recordNotificationSend(template, 'failed');
    }
  }

  private retryDelayMs(attempt: number) {
    const baseDelayMs = this.readPositiveInteger(process.env.JOB_RETRY_BASE_DELAY_MS, 5000);
    return baseDelayMs * attempt;
  }

  private readPositiveInteger(value: string | undefined, fallback: number) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  private readObject(value: Prisma.JsonValue) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, Prisma.JsonValue>)
      : {};
  }

  private readString(value: Prisma.JsonValue | undefined) {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
  }

  private readConnectionChannelCode(credentials: Prisma.JsonValue | null) {
    const record = credentials && typeof credentials === 'object' && !Array.isArray(credentials)
      ? (credentials as Record<string, Prisma.JsonValue>)
      : {};
    const value = record.channel_code;
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private readBoolean(value: Prisma.JsonValue | undefined, fallback: boolean) {
    return typeof value === 'boolean' ? value : fallback;
  }

  private readNumber(value: Prisma.JsonValue | undefined, fallback: number) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  private readNestedRecord(value: Prisma.JsonValue | undefined) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, Prisma.JsonValue>)
      : {};
  }

  private readStringArray(value: Prisma.JsonValue | undefined) {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  }

  private didReservationImportChangeInventory(importSummary: Prisma.InputJsonObject) {
    const created = this.readCount(importSummary.created);
    const updated = this.readCount(importSummary.updated);
    const cancelled = this.readCount(importSummary.cancelled);
    return created > 0 || updated > 0 || cancelled > 0;
  }

  private readCount(value: Prisma.JsonValue | Prisma.InputJsonValue | undefined | null) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  private isReadyForInventoryFanout(credentials: Prisma.JsonValue | null) {
    const record = credentials && typeof credentials === 'object' && !Array.isArray(credentials)
      ? (credentials as Record<string, Prisma.JsonValue>)
      : {};
    const setup = this.readNestedRecord(record.setup_status);
    const automation = this.readNestedRecord(record.automation);
    const ready = this.readBoolean(setup.ready, false);

    return (
      this.readBoolean(automation.enabled, true) &&
      this.readBoolean(setup.activated, false) &&
      this.readBoolean(setup.catalog_loaded, false) &&
      ready &&
      !this.readBoolean(setup.disconnected, false)
    );
  }

  private readSyncWindowDays(credentials: Prisma.JsonValue | null) {
    const record = credentials && typeof credentials === 'object' && !Array.isArray(credentials)
      ? (credentials as Record<string, Prisma.JsonValue>)
      : {};
    const automation = this.readNestedRecord(record.automation);
    return this.readNumber(automation.sync_window_days, 30);
  }

  private currentSyncWindow(windowDays: number) {
    const from = new Date();
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + Math.max(windowDays, 1));

    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
    };
  }

  private readDate(value: Prisma.JsonValue | undefined, field: string) {
    const raw = this.requiredString(value, field);
    const date = new Date(raw);

    if (Number.isNaN(date.getTime())) {
      throw new Error(`Notification job has invalid ${field}`);
    }

    return date;
  }

  private readBookingConfirmationPayload(
    payload: Record<string, Prisma.JsonValue>,
  ): ReservationConfirmationPayload {
    return {
      guestName: this.requiredString(payload.guest_name, 'guest_name'),
      phone: this.requiredString(payload.phone, 'phone'),
      roomNumber: this.requiredString(payload.room_number, 'room_number'),
      checkInDate: this.readDate(payload.check_in_date, 'check_in_date'),
      checkOutDate: this.readDate(payload.check_out_date, 'check_out_date'),
    };
  }

  private readOwnerBookingNotificationPayload(
    payload: Record<string, Prisma.JsonValue>,
  ): OwnerReservationNotificationPayload {
    return {
      ownerPhone: this.readString(payload.owner_phone) ?? null,
      propertyName: this.requiredString(payload.property_name, 'property_name'),
      guestName: this.requiredString(payload.guest_name, 'guest_name'),
      guestPhone: this.requiredString(payload.guest_phone, 'guest_phone'),
      roomCategoryName: this.requiredString(payload.room_category_name, 'room_category_name'),
      checkInDate: this.readDate(payload.check_in_date, 'check_in_date'),
      checkOutDate: this.readDate(payload.check_out_date, 'check_out_date'),
      totalAmount: Number(this.requiredString(payload.total_amount, 'total_amount')),
    };
  }

  private readCheckInReminderPayload(
    payload: Record<string, Prisma.JsonValue>,
  ): CheckInReminderPayload {
    return this.readBookingConfirmationPayload(payload);
  }

  private requiredString(value: Prisma.JsonValue | undefined, field: string) {
    const raw = this.readString(value);
    if (!raw) {
      throw new Error(`Notification job is missing ${field}`);
    }

    return raw;
  }

  private describeImportedReservationRooms(
    rooms: Array<{ roomCategory: { name: string }; externalRoomReservationId: string }>,
  ) {
    const uniqueCategories = rooms
      .map((room) => room.roomCategory.name)
      .filter((name, index, list) => list.indexOf(name) === index);

    if (uniqueCategories.length === 1) {
      return `${rooms.length} ${uniqueCategories[0]} room${rooms.length === 1 ? '' : 's'}`;
    }

    return `${rooms.length} room stays`;
  }

  private resolveSyncOutcome(syncType: ChannelSyncType, responsePayload: Prisma.InputJsonObject) {
    if (syncType !== ChannelSyncType.INVENTORY) {
      return {
        status: ChannelSyncStatus.SUCCEEDED,
        errorMessage: null,
      };
    }

    const payload = this.readObject(responsePayload as unknown as Prisma.JsonValue);
    const summary = this.readObject(payload.summary);
    const failedRows = this.readNumber(summary.failed_rows, 0);

    if (failedRows > 0) {
      const succeededRows = this.readNumber(summary.succeeded_rows, 0);
      return {
        status: 'PARTIAL_FAILED' as ChannelSyncStatus,
        errorMessage: `${failedRows} inventory row(s) failed while ${succeededRows} succeeded.`,
      };
    }

    return {
      status: ChannelSyncStatus.SUCCEEDED,
      errorMessage: null,
    };
  }

  private async persistInventorySyncRows(
    syncLogId: string,
    connectionId: string,
    responsePayload: Prisma.InputJsonObject,
  ) {
    const payload = this.readObject(responsePayload as unknown as Prisma.JsonValue);
    const rowResults = Array.isArray(payload.row_results)
      ? payload.row_results.reduce<PersistedInventorySyncRowResult[]>((rows, value) => {
          const parsed = this.readInventorySyncRowResult(value);
          if (parsed) {
            rows.push(parsed);
          }
          return rows;
        }, [])
      : [];

    if (rowResults.length === 0) {
      return;
    }

    const inventorySyncRows = (this.prisma as PrismaService & {
      inventorySyncRow: {
        deleteMany: (...args: unknown[]) => Promise<unknown>;
        createMany: (...args: unknown[]) => Promise<unknown>;
      };
    }).inventorySyncRow;

    await inventorySyncRows.deleteMany({
      where: { channelSyncLogId: syncLogId },
    });

    await inventorySyncRows.createMany({
      data: rowResults.map((row) => ({
        channelSyncLogId: syncLogId,
        channelConnectionId: connectionId,
        syncDate: new Date(`${row.date}T00:00:00.000Z`),
        externalRoomId: row.external_room_id,
        available: row.available,
        status: row.status,
        errorMessage: row.error_message ?? null,
        providerResponse: row.provider_response ?? Prisma.JsonNull,
      })),
    });
  }

  private readInventorySyncRowResult(value: Prisma.JsonValue) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const row = value as Record<string, Prisma.JsonValue>;
    const date = this.readString(row.date);
    const externalRoomId = this.readString(row.external_room_id);
    const status = this.readString(row.status);
    if (!date || !externalRoomId || (status !== 'SUCCEEDED' && status !== 'FAILED')) {
      return null;
    }

    return {
      date,
      external_room_id: externalRoomId,
      available: this.readNumber(row.available, 0),
      status,
      error_message: this.readString(row.error_message) ?? null,
      provider_response: row.provider_response ?? null,
    } satisfies PersistedInventorySyncRowResult;
  }

  private toResponse(
    job: {
      id: string;
      type: BackgroundJobType;
      status: BackgroundJobStatus;
      propertyId: string | null;
      dedupeKey: string | null;
      entityType: string | null;
      entityId: string | null;
      attempts: number;
      maxAttempts: number;
      runAt: Date;
      lastError: string | null;
      completedAt: Date | null;
      deadLetteredAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    },
  ) {
    return {
      id: job.id,
      type: job.type,
      status: job.status,
      property_id: job.propertyId,
      dedupe_key: job.dedupeKey,
      entity_type: job.entityType,
      entity_id: job.entityId,
      attempts: job.attempts,
      max_attempts: job.maxAttempts,
      run_at: job.runAt,
      last_error: job.lastError,
      completed_at: job.completedAt,
      dead_lettered_at: job.deadLetteredAt,
      created_at: job.createdAt,
      updated_at: job.updatedAt,
    };
  }
}
