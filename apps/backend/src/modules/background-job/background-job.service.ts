import {
  BadRequestException,
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
  OwnerReservationChangePayload,
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
      from?: string;
      to?: string;
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

      const targetedWindow = Boolean(options.from && options.to);
      if (!targetedWindow && connection.syncLogs.length > 0) {
        continue;
      }

      if (
        targetedWindow &&
        connection.syncLogs.some((log) => {
          const request = this.readObject(log.requestPayload);
          return this.readString(request.from) === options.from && this.readString(request.to) === options.to;
        })
      ) {
        continue;
      }

      const syncWindowDays = this.readSyncWindowDays(connection.credentials);
      const syncWindow =
        options.from && options.to
          ? { from: options.from, to: options.to }
          : this.currentSyncWindow(syncWindowDays);
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
        orderBy: [{ runAt: 'desc' }, { createdAt: 'desc' }],
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
    } else if (user?.role !== UserRole.PLATFORM_OWNER && user?.role !== UserRole.SUPER_ADMIN) {
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

  async finalizeImportedReservationImport(input: {
    sourceConnectionId: string;
    propertyId: string;
    importSummary: Prisma.InputJsonObject;
  }) {
    const importSummary = this.readObject(input.importSummary as unknown as Prisma.JsonValue);
    await this.queueImportedReservationNotifications(input.propertyId, {
      created: this.readStringArray(importSummary.created_reservation_group_ids),
      updated: this.readStringArray(importSummary.updated_reservation_group_ids),
      cancelled: this.readStringArray(importSummary.cancelled_reservation_group_ids),
    });
    await this.queueInventoryFanoutAfterReservationImport(
      input.sourceConnectionId,
      input.propertyId,
      input.importSummary,
    );
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
      const retryable = this.isRetryableJobFailure(job.type, message);
      const nextStatus =
        !retryable || job.attempts >= job.maxAttempts
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
        if (nextStatus === BackgroundJobStatus.DEAD_LETTER) {
          await this.queueReservationPollFallbackForWebhook(job.payload, message);
        }
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
      return;
    }

    await this.markWebhookProcessed({
      webhookEventId: event.id,
      backgroundJobId: job.id,
      provider: event.provider,
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
    const reservationIds = this.readWebhookReservationIds(payload);

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
              reservation_id: reservationIds[0] ?? null,
              reservation_ids: reservationIds,
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

  private readWebhookReservationIds(payload: Record<string, unknown>) {
    const seen = new Set<string>();
    const ids: string[] = [];
    const add = (value: unknown) => {
      const normalized =
        typeof value === 'number' && Number.isFinite(value)
          ? String(value)
          : typeof value === 'string' && value.trim()
            ? value.trim()
            : null;
      if (!normalized || seen.has(normalized)) {
        return;
      }

      seen.add(normalized);
      ids.push(normalized);
    };

    for (const key of ['reservationId', 'reservation_id', 'bookingId', 'booking_id']) {
      add(payload[key]);
    }

    for (const key of ['reservationIds', 'reservation_ids', 'bookingIds', 'booking_ids']) {
      const value = payload[key];
      if (Array.isArray(value)) {
        value.forEach(add);
      } else {
        add(value);
      }
    }

    return ids;
  }

  private async processChannelSyncJob(job: {
    id: string;
    payload: Prisma.JsonValue;
  }) {
    const payload = this.readObject(job.payload);
    const channelAction = this.readString(payload.channel_action);
    if (channelAction) {
      await this.processQueuedChannelAction(job.id, payload, channelAction);
      return;
    }

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
    if (await this.skipCompletedTestReservationFallback(log.id, connection.id, requestPayload)) {
      return;
    }

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
              channelSyncLogId: log.id,
              propertyId: connection.propertyId,
              responsePayload: responsePayload as unknown as Prisma.JsonValue,
            });
            await this.finalizeImportedReservationImport({
              sourceConnectionId: connection.id,
              propertyId: connection.propertyId,
              importSummary,
            });

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
    if (log.syncType === ChannelSyncType.INVENTORY) {
      await this.persistInventorySyncRows(updated.id, connection.id, finalResponsePayload);
    }

    await this.finalizeWebhookTriggeredBookingSync({
      requestPayload,
      status: updated.status,
      errorMessage: updated.errorMessage,
      provider: connection.provider,
      backgroundJobId: job.id,
    });

    await this.auditLogService.record({
      action: AuditAction.CHANNEL_SYNC,
      entityType: 'channel_sync_log',
      entityId: updated.id,
      propertyId: connection.propertyId,
      summary:
        updated.status === ChannelSyncStatus.FAILED
          ? `${connection.provider} ${log.syncType} sync failed`
          : updated.status === ('PARTIAL_FAILED' as ChannelSyncStatus)
            ? `${connection.provider} ${log.syncType} sync partially failed`
            : `${connection.provider} ${log.syncType} sync succeeded`,
      metadata: {
        channel_connection_id: connection.id,
        background_job_id: job.id,
      },
    });

    this.metricsService.recordChannelSyncCompleted(log.syncType, connection.provider, updated.status);
  }

  private async processQueuedChannelAction(
    jobId: string,
    payload: Record<string, Prisma.JsonValue>,
    channelAction: string,
  ) {
    const connectionId = this.readString(payload.channel_connection_id);
    if (!connectionId) {
      throw new Error('Channel action job is missing channel_connection_id');
    }

    if (channelAction === 'PROPERTY_ACTIVATION') {
      await this.processQueuedPropertyActivation(jobId, connectionId, payload);
      return;
    }

    if (channelAction === 'ROOMS_ACTIVATION') {
      await this.processQueuedRoomsActivation(jobId, connectionId);
      return;
    }

    throw new Error(`Unsupported channel action: ${channelAction}`);
  }

  private async processQueuedPropertyActivation(
    jobId: string,
    connectionId: string,
    payload: Record<string, Prisma.JsonValue>,
  ) {
    const connection = await this.prisma.channelConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      throw new NotFoundException('Channel connection not found for background job');
    }

    const priceModelId = this.readNumber(payload.price_model_id, 0);
    if (priceModelId <= 0) {
      throw new BadRequestException('Property activation job is missing price_model_id.');
    }

    const token = this.readString(payload.token);
    const response = await this.channelProviderService.activateProperty({
      provider: connection.provider,
      external_hotel_id: connection.externalHotelId,
      credentials: connection.credentials,
      price_model_id: priceModelId,
      ...(token ? { token } : {}),
    });

    await this.auditLogService.record({
      action: AuditAction.UPDATE,
      entityType: 'channel_connection',
      entityId: connection.id,
      propertyId: connection.propertyId,
      summary: `Activated ${connection.provider} property connection`,
      metadata: {
        price_model_id: priceModelId,
        background_job_id: jobId,
      },
    });

    if (connection.provider === ChannelProvider.ZODOMUS) {
      await this.updateZodomusConnectionConfig(connection.id, connection.credentials, {
        setup_status: {
          activated: true,
          disconnected: false,
          activated_at: new Date().toISOString(),
          price_model_id: priceModelId,
          last_activation_message: this.readProviderReturnMessage(response),
          last_activation_code: this.readProviderReturnCode(response),
          ready: false,
          ready_at: null,
        },
      });
    }
  }

  private async processQueuedRoomsActivation(jobId: string, connectionId: string) {
    const connection = await this.prisma.channelConnection.findUnique({
      where: { id: connectionId },
      include: {
        roomMappings: { include: { roomCategory: true } },
        rateMappings: true,
      },
    });

    if (!connection) {
      throw new NotFoundException('Channel connection not found for background job');
    }

    if (connection.provider !== ChannelProvider.ZODOMUS) {
      throw new BadRequestException('Room activation is currently supported only for Zodomus connections.');
    }

    const rooms = await this.buildZodomusRoomsActivationPayload(connection);
    const activation = await this.channelProviderService.activateRooms({
      provider: connection.provider,
      external_hotel_id: connection.externalHotelId,
      credentials: connection.credentials,
      rooms,
    });

    await this.auditLogService.record({
      action: AuditAction.UPDATE,
      entityType: 'channel_connection',
      entityId: connection.id,
      propertyId: connection.propertyId,
      summary: `Activated ${connection.provider} room and rate mappings`,
      metadata: {
        activated_room_count: rooms.length,
        background_job_id: jobId,
      },
    });

    await this.updateZodomusConnectionConfig(connection.id, connection.credentials, {
      setup_status: {
        rooms_activated: true,
        rooms_activated_at: new Date().toISOString(),
        activated_room_count: rooms.length,
        last_rooms_activation_message: this.readProviderReturnMessage(activation),
        last_rooms_activation_code: this.readProviderReturnCode(activation),
        ready: false,
        ready_at: null,
      },
    });
  }

  private async skipCompletedTestReservationFallback(
    syncLogId: string,
    channelConnectionId: string,
    requestPayload: Record<string, Prisma.JsonValue>,
  ) {
    if (this.readString(requestPayload.trigger) !== 'test_reservation_webhook_fallback') {
      return false;
    }

    const reservationImport = this.readNestedRecord(requestPayload.reservation_import);
    const reservationId = this.readString(reservationImport.reservation_id);
    if (!reservationId) {
      return false;
    }

    const existingReservation = await this.prisma.reservationGroup.findFirst({
      where: {
        channelConnectionId,
        externalReservationId: reservationId,
      },
      select: {
        id: true,
      },
    });

    if (!existingReservation) {
      return false;
    }

    await this.prisma.channelSyncLog.update({
      where: { id: syncLogId },
      data: {
        status: ChannelSyncStatus.SUCCEEDED,
        responsePayload: {
          reservation_import: {
            mode: 'webhook_first_fallback_skipped',
            reservation_id: reservationId,
            existing_reservation_group_id: existingReservation.id,
          },
          import_summary: {
            skipped: 1,
            errors: [],
          },
        } satisfies Prisma.InputJsonObject,
        errorMessage: null,
      },
    });

    return true;
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
      case 'owner_reservation_modified':
        await this.whatsappNotificationService.sendOwnerReservationModifiedNotification(
          this.readOwnerReservationChangePayload(payload),
        );
        break;
      case 'owner_reservation_cancelled':
        await this.whatsappNotificationService.sendOwnerReservationCancelledNotification(
          this.readOwnerReservationChangePayload(payload),
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

  private async queueImportedReservationNotifications(
    propertyId: string,
    reservationGroupIds: { created: string[]; updated: string[]; cancelled: string[] },
  ) {
    const eventByGroupId = new Map<string, 'created' | 'updated' | 'cancelled'>();
    for (const id of reservationGroupIds.created) eventByGroupId.set(id, 'created');
    for (const id of reservationGroupIds.updated) eventByGroupId.set(id, 'updated');
    for (const id of reservationGroupIds.cancelled) eventByGroupId.set(id, 'cancelled');
    const groupIds = [...eventByGroupId.keys()];

    if (groupIds.length === 0) {
      return;
    }

    const groups = await this.prisma.reservationGroup.findMany({
      where: {
        id: { in: groupIds },
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
      const event = eventByGroupId.get(group.id);
      if (!event) {
        continue;
      }

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

      // OTA guest confirmations are intentionally not sent by HMS; the OTA owns
      // confirmation wording, pricing, policies, and cancellation terms.
      // Notification flow:
      // - OTA reservation imported: owner/admin alert only.
      // - Direct HMS booking created: guest confirmation can be sent by HMS.
      // - Before check-in: guest reminder.
      // - OTA modification/cancellation/import failure: owner/admin action alert.
      // if (guestPhone) {
      //   await this.enqueue({
      //     type: BackgroundJobType.NOTIFICATION_SEND,
      //     propertyId,
      //     dedupeKey: `notification:imported-reservation-confirmation:${group.id}`,
      //     entityType: 'reservation_group',
      //     entityId: group.id,
      //     payload: {
      //       template: 'reservation_confirmation',
      //       guest_name: guestName,
      //       phone: guestPhone,
      //       room_number: roomSummary,
      //       check_in_date: firstArrival.toISOString(),
      //       check_out_date: lastDeparture.toISOString(),
      //     },
      //     maxAttempts: 3,
      //   });
      // }

      const notificationConfig = this.importedReservationOwnerNotificationConfig(event);
      await this.enqueue({
        type: BackgroundJobType.NOTIFICATION_SEND,
        propertyId,
        dedupeKey: `notification:${notificationConfig.dedupePrefix}:${group.id}`,
        entityType: 'reservation_group',
        entityId: group.id,
        payload: {
          template: notificationConfig.template,
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

  private importedReservationOwnerNotificationConfig(event: 'created' | 'updated' | 'cancelled') {
    if (event === 'updated') {
      return {
        template: 'owner_reservation_modified',
        dedupePrefix: 'imported-owner-reservation-modified',
      };
    }

    if (event === 'cancelled') {
      return {
        template: 'owner_reservation_cancelled',
        dedupePrefix: 'imported-owner-reservation-cancelled',
      };
    }

    return {
      template: 'owner_reservation_notification',
      dedupePrefix: 'imported-owner-reservation',
    };
  }

  private async queueInventoryFanoutAfterReservationImport(
    sourceConnectionId: string,
    propertyId: string,
    importSummary: Prisma.InputJsonObject,
  ) {
    if (!this.didReservationImportChangeInventory(importSummary)) {
      return;
    }

    const affectedWindows = this.readAffectedInventoryWindows(importSummary);
    if (affectedWindows.length > 0) {
      for (const window of affectedWindows) {
        await this.queueInventorySyncsForProperty(propertyId, {
          trigger: 'reservation_import_fanout',
          sourceConnectionId,
          from: window.from,
          to: window.to,
        });
      }
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

  private async queueReservationPollFallbackForWebhook(payloadValue: Prisma.JsonValue, message: string) {
    const payload = this.readObject(payloadValue);
    const webhookEventId = this.readString(payload.webhook_event_id);
    if (!webhookEventId) {
      return;
    }

    const event = await this.prisma.webhookEvent.findUnique({
      where: { id: webhookEventId },
    });

    if (!event || event.domain !== 'CHANNEL' || event.provider !== 'zodomus') {
      return;
    }

    const eventPayload = this.readObject(event.payload);
    const providerPropertyId =
      this.readOptionalStringOrNumber(eventPayload.propertyId) ??
      this.readOptionalStringOrNumber(eventPayload.property_id) ??
      this.readOptionalStringOrNumber(eventPayload.hotelId) ??
      this.readOptionalStringOrNumber(eventPayload.hotel_id);
    const providerChannelId =
      this.readOptionalStringOrNumber(eventPayload.channelId) ??
      this.readOptionalStringOrNumber(eventPayload.channel_id);
    const reservationId =
      this.readOptionalStringOrNumber(eventPayload.reservationId) ??
      this.readOptionalStringOrNumber(eventPayload.reservation_id) ??
      this.readOptionalStringOrNumber(eventPayload.bookingId) ??
      this.readOptionalStringOrNumber(eventPayload.booking_id);

    if (!providerPropertyId) {
      return;
    }

    const candidateConnections = await this.prisma.channelConnection.findMany({
      where: {
        provider: ChannelProvider.ZODOMUS,
        status: ChannelConnectionStatus.ACTIVE,
        externalHotelId: providerPropertyId,
      },
      orderBy: { createdAt: 'asc' },
    });

    const matchingConnections = candidateConnections.filter((connection) => {
      const channelCode = this.readConnectionChannelCode(connection.credentials);
      return !providerChannelId || !channelCode || providerChannelId === channelCode;
    });

    for (const connection of matchingConnections) {
      const dedupeKey = `webhook-dead-letter-bookings:${event.id}:${connection.id}`;
      const existingFallback = await this.prisma.backgroundJob.findUnique({
        where: { dedupeKey },
      });
      if (existingFallback) {
        continue;
      }

      const syncLog = await this.prisma.channelSyncLog.create({
        data: {
          channelConnectionId: connection.id,
          syncType: ChannelSyncType.BOOKINGS,
          status: ChannelSyncStatus.QUEUED,
          requestPayload: {
            reservation_import: {
              mode: 'reservation_queue_poll',
              from: null,
              to: null,
              fallback_for_webhook_event_id: event.id,
              fallback_reason: message,
              webhook_event_type: event.eventType,
              webhook_external_event_id: event.externalEventId,
              provider_property_id: providerPropertyId,
              provider_channel_id: providerChannelId ?? null,
              reservation_id: reservationId ?? null,
            },
            trigger: 'webhook_dead_letter_fallback',
          } satisfies Prisma.InputJsonObject,
        },
      });

      await this.enqueue({
        type: BackgroundJobType.CHANNEL_SYNC,
        propertyId: connection.propertyId,
        dedupeKey,
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

  private readOptionalStringOrNumber(value: Prisma.JsonValue | undefined) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }

    return this.readString(value);
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

  private readPlainRecord(value: Prisma.JsonValue | null) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private readStringArray(value: Prisma.JsonValue | undefined) {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  }

  private async updateZodomusConnectionConfig(
    connectionId: string,
    existingCredentials: Prisma.JsonValue | null,
    patch: Record<string, unknown>,
  ) {
    const existing = this.readPlainRecord(existingCredentials);
    const setupPatch = this.readPlainPatchRecord(patch.setup_status);
    const automationPatch = this.readPlainPatchRecord(patch.automation);
    const nextCredentials = {
      ...existing,
      ...patch,
      ...(Object.keys(setupPatch).length > 0
        ? {
            setup_status: {
              ...this.readPlainPatchRecord(existing.setup_status),
              ...setupPatch,
            },
          }
        : {}),
      ...(Object.keys(automationPatch).length > 0
        ? {
            automation: {
              ...this.readPlainPatchRecord(existing.automation),
              ...automationPatch,
            },
          }
        : {}),
    };

    await this.prisma.channelConnection.update({
      where: { id: connectionId },
      data: {
        credentials: nextCredentials as Prisma.InputJsonValue,
      },
    });
  }

  private readPlainPatchRecord(value: unknown) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private readProviderReturnMessage(response: unknown) {
    const wrapper = this.readUnknownRecord(response);
    const rawResponse = this.readUnknownRecord(wrapper.response);
    const status = this.readUnknownRecord(rawResponse.status);
    const returnMessage = status.returnMessage;

    if (typeof returnMessage === 'string') {
      return returnMessage;
    }

    if (returnMessage && typeof returnMessage === 'object') {
      return JSON.stringify(returnMessage);
    }

    return null;
  }

  private readProviderReturnCode(response: unknown) {
    const wrapper = this.readUnknownRecord(response);
    const rawResponse = this.readUnknownRecord(wrapper.response);
    const status = this.readUnknownRecord(rawResponse.status);
    const value = status.returnCode;

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value.toString();
    }

    return null;
  }

  private readUnknownRecord(value: unknown) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private async buildZodomusRoomsActivationPayload(connection: {
    propertyId: string;
    roomMappings: Array<{
      roomCategoryId: string;
      externalRoomId: string;
      externalRoomName: string | null;
      isActivationEnabled: boolean;
      roomCategory: { code: string; name: string };
    }>;
    rateMappings: Array<{
      externalRoomId: string | null;
      externalRateId: string;
      isActivationEnabled: boolean;
    }>;
  }) {
    if (connection.roomMappings.length === 0) {
      throw new BadRequestException('At least one room mapping is required before Zodomus room activation.');
    }

    if (connection.rateMappings.length === 0) {
      throw new BadRequestException('At least one rate mapping is required before Zodomus room activation.');
    }

    const rateIdsByExternalRoomId = new Map<string, string[]>();
    for (const mapping of connection.rateMappings.filter((rateMapping) => rateMapping.isActivationEnabled)) {
      const key = mapping.externalRoomId;
      if (!key) {
        continue;
      }

      const existing = rateIdsByExternalRoomId.get(key) ?? [];
      if (!existing.includes(mapping.externalRateId)) {
        existing.push(mapping.externalRateId);
      }
      rateIdsByExternalRoomId.set(key, existing);
    }

    if (rateIdsByExternalRoomId.size === 0) {
      throw new BadRequestException('Enable at least one mapped rate before Zodomus room activation.');
    }

    const activeRoomMappings = connection.roomMappings.filter((mapping) => mapping.isActivationEnabled);
    if (activeRoomMappings.length === 0) {
      throw new BadRequestException('Enable at least one mapped room before Zodomus room activation.');
    }

    return Promise.all(
      activeRoomMappings.map(async (mapping) => {
        const quantity = await this.prisma.room.count({
          where: {
            propertyId: connection.propertyId,
            roomCategoryId: mapping.roomCategoryId,
          },
        });

        if (quantity <= 0) {
          throw new BadRequestException(
            `Cannot activate Zodomus room ${mapping.externalRoomId} because room category ${mapping.roomCategory.code} has no physical rooms in HMS.`,
          );
        }

        const rates = rateIdsByExternalRoomId.get(mapping.externalRoomId) ?? [];
        if (rates.length === 0) {
          throw new BadRequestException(
            `Cannot activate Zodomus room ${mapping.externalRoomId} because room category ${mapping.roomCategory.code} has no mapped rates.`,
          );
        }

        return {
          roomId: mapping.externalRoomId,
          roomName: mapping.externalRoomName?.trim() || mapping.roomCategory.name,
          quantity,
          status: 1,
          rates,
        };
      }),
    );
  }

  private async markWebhookProcessed(input: {
    webhookEventId: string;
    backgroundJobId: string;
    provider: string;
  }) {
    const updated = await this.prisma.webhookEvent.updateMany({
      where: {
        id: input.webhookEventId,
        status: { not: WebhookEventStatus.PROCESSED },
      },
      data: {
        status: WebhookEventStatus.PROCESSED,
        processingError: null,
        processedAt: new Date(),
      },
    });

    if (updated.count === 0) {
      return;
    }

    const processed = await this.prisma.webhookEvent.findUnique({
      where: { id: input.webhookEventId },
    });

    if (!processed) {
      return;
    }

    await this.auditLogService.record({
      action: AuditAction.CREATE,
      entityType: 'webhook_event',
      entityId: processed.id,
      propertyId: processed.propertyId,
      summary: `Processed ${processed.domain.toLowerCase()} webhook for ${input.provider}`,
      metadata: {
        external_event_id: processed.externalEventId,
        event_type: processed.eventType,
        background_job_id: input.backgroundJobId,
      },
    });
  }

  private async finalizeWebhookTriggeredBookingSync(input: {
    requestPayload: Record<string, Prisma.JsonValue>;
    status: ChannelSyncStatus;
    errorMessage: string | null;
    provider: ChannelProvider;
    backgroundJobId: string;
  }) {
    const reservationImport = this.readNestedRecord(input.requestPayload.reservation_import);
    if (this.readString(reservationImport.mode) !== 'webhook_trigger') {
      return;
    }

    const webhookEventId = this.readString(reservationImport.webhook_event_id);
    if (!webhookEventId) {
      return;
    }

    if (input.status === ChannelSyncStatus.SUCCEEDED) {
      await this.markWebhookProcessed({
        webhookEventId,
        backgroundJobId: input.backgroundJobId,
        provider: input.provider,
      });
      return;
    }

    await this.prisma.webhookEvent.updateMany({
      where: {
        id: webhookEventId,
        status: { not: WebhookEventStatus.PROCESSED },
      },
      data: {
        status: WebhookEventStatus.FAILED,
        processingError: input.errorMessage ?? 'Webhook-triggered reservation import failed.',
        processedAt: null,
      },
    });
  }

  private didReservationImportChangeInventory(importSummary: Prisma.InputJsonObject) {
    const created = this.readCount(importSummary.created);
    const updated = this.readCount(importSummary.updated);
    const cancelled = this.readCount(importSummary.cancelled);
    return created > 0 || updated > 0 || cancelled > 0;
  }

  private readAffectedInventoryWindows(importSummary: Prisma.InputJsonObject) {
    const windows = Array.isArray(importSummary.affected_inventory_windows)
      ? importSummary.affected_inventory_windows
      : [];
    const seen = new Set<string>();

    return windows.flatMap((value) => {
      const record = this.readObject(value as Prisma.JsonValue);
      const from = this.readString(record.from);
      const to = this.readString(record.to);
      if (!from || !to) {
        return [];
      }
      const key = `${from}:${to}`;
      if (seen.has(key)) {
        return [];
      }
      seen.add(key);
      return [{ from, to }];
    });
  }

  private readCount(value: Prisma.JsonValue | Prisma.InputJsonValue | undefined | null) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value.trim());
      return Number.isFinite(parsed) ? parsed : 0;
    }

    return 0;
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
    const environment = this.zodomusEnvironment(record);
    return this.normalizeZodomusSyncWindowDays(
      this.readNumber(automation.sync_window_days, this.defaultZodomusSyncWindowDays()),
      environment,
    );
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

  private productionMinimumZodomusSyncWindowDays() {
    return this.readPositiveInteger(process.env.ZODOMUS_PRODUCTION_ROUTINE_SYNC_WINDOW_DAYS, 90);
  }

  private sandboxMaximumZodomusSyncWindowDays() {
    return this.readPositiveInteger(process.env.ZODOMUS_SANDBOX_MAX_SYNC_WINDOW_DAYS, 7);
  }

  private defaultZodomusSyncWindowDays() {
    const environment = this.zodomusEnvironment(null);
    return this.normalizeZodomusSyncWindowDays(
      this.readPositiveInteger(
        process.env.ZODOMUS_AUTO_SYNC_WINDOW_DAYS,
        environment === 'sandbox'
          ? this.sandboxMaximumZodomusSyncWindowDays()
          : this.productionMinimumZodomusSyncWindowDays(),
      ),
      environment,
    );
  }

  private normalizeZodomusSyncWindowDays(value: number, environment?: string | null) {
    const normalized = Math.max(value, 1);
    if (environment === 'sandbox') {
      return Math.min(normalized, this.sandboxMaximumZodomusSyncWindowDays());
    }

    return normalized;
  }

  private zodomusEnvironment(record: Record<string, Prisma.JsonValue> | null) {
    const value = record?.environment;
    return typeof value === 'string' && value.trim()
      ? value.trim()
      : process.env.ZODOMUS_ENVIRONMENT?.trim() ?? null;
  }

  private isRetryableJobFailure(jobType: BackgroundJobType, message: string) {
    if (jobType !== BackgroundJobType.CHANNEL_SYNC) {
      return true;
    }

    const normalized = message.toLowerCase();
    if (
      normalized.includes('status 401') ||
      normalized.includes('status 403') ||
      normalized.includes('status 429') ||
      normalized.includes('too many requests') ||
      normalized.includes('rate limit') ||
      normalized.includes('suspend')
    ) {
      return false;
    }

    return true;
  }

  private resolveRowBasedSyncOutcome(
    syncType: ChannelSyncType,
    payload: Record<string, Prisma.JsonValue>,
  ) {
    const summary = this.readObject(payload.summary);
    const rowResults = Array.isArray(payload.row_results) ? payload.row_results : [];

    const failedRowsFromResults = rowResults.reduce<number>((count, value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return count;
      }

      const status = this.readString((value as Record<string, Prisma.JsonValue>).status);
      return status === 'FAILED' ? count + 1 : count;
    }, 0);
    const succeededRowsFromResults = rowResults.reduce<number>((count, value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return count;
      }

      const status = this.readString((value as Record<string, Prisma.JsonValue>).status);
      return status === 'SUCCEEDED' ? count + 1 : count;
    }, 0);

    const failedRows =
      this.readCount(summary.failed_rows) ||
      (rowResults.length > 0 ? failedRowsFromResults : 0);
    const succeededRows =
      this.readCount(summary.succeeded_rows) ||
      (rowResults.length > 0 ? succeededRowsFromResults : 0);

    if (failedRows > 0) {
      return {
        status: succeededRows > 0 ? ('PARTIAL_FAILED' as ChannelSyncStatus) : ChannelSyncStatus.FAILED,
        errorMessage:
          syncType === ChannelSyncType.RATES
            ? `${failedRows} rate row(s) failed while ${succeededRows} succeeded.`
            : `${failedRows} inventory row(s) failed while ${succeededRows} succeeded.`,
      };
    }

    if (succeededRows > 0) {
      return {
        status: ChannelSyncStatus.SUCCEEDED,
        errorMessage: null,
      };
    }

    return null;
  }

  private resolveBookingSyncOutcome(payload: Record<string, Prisma.JsonValue>) {
    const reservationQueue = this.readNestedRecord(payload.reservation_queue);
    const queueStatus = this.readNestedRecord(reservationQueue.status);
    const queueReturnCode = this.readOptionalStringOrNumber(queueStatus.returnCode);
    const queueReturnMessage = this.readString(queueStatus.returnMessage);
    const reservationSummary = this.readNestedRecord(payload.reservation_summary);
    const summaryStatus = this.readNestedRecord(reservationSummary.status);
    const summaryReturnCode = this.readOptionalStringOrNumber(summaryStatus.returnCode);
    const summaryReturnMessage = this.readString(summaryStatus.returnMessage);

    if (queueReturnCode && queueReturnCode !== '200') {
      return {
        status: ChannelSyncStatus.FAILED,
        errorMessage: queueReturnMessage ?? `Booking sync provider returned code ${queueReturnCode}.`,
      };
    }

    if (summaryReturnCode && summaryReturnCode !== '200') {
      return {
        status: ChannelSyncStatus.FAILED,
        errorMessage: summaryReturnMessage ?? `Booking sync provider returned code ${summaryReturnCode}.`,
      };
    }

    const detailFailures = this.countBookingDetailFailures(payload.reservations);
    const importSummary = this.readNestedRecord(payload.import_summary);
    const importFailures = Math.max(
      this.readCount(importSummary.failed),
      this.readStringArray(importSummary.errors).length,
    );
    const completedImports =
      this.readCount(importSummary.created) +
      this.readCount(importSummary.updated) +
      this.readCount(importSummary.cancelled) +
      this.readCount(importSummary.skipped);

    if (detailFailures > 0 || importFailures > 0) {
      const failureParts: string[] = [];
      if (detailFailures > 0) {
        failureParts.push(`${detailFailures} reservation detail fetch(es) failed`);
      }
      if (importFailures > 0) {
        failureParts.push(`${importFailures} reservation import(s) failed`);
      }

      return {
        status: completedImports > 0 ? ('PARTIAL_FAILED' as ChannelSyncStatus) : ChannelSyncStatus.FAILED,
        errorMessage: `${failureParts.join('; ')}.`,
      };
    }

    return {
      status: ChannelSyncStatus.SUCCEEDED,
      errorMessage: null,
    };
  }

  private countBookingDetailFailures(value: Prisma.JsonValue | undefined): number {
    if (!Array.isArray(value)) {
      return 0;
    }

    return value.reduce<number>((count, entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return count;
      }

      return this.readString((entry as Record<string, Prisma.JsonValue>).error) ? count + 1 : count;
    }, 0);
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

  private readOwnerReservationChangePayload(
    payload: Record<string, Prisma.JsonValue>,
  ): OwnerReservationChangePayload {
    return this.readOwnerBookingNotificationPayload(payload);
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
    const payload = this.readObject(responsePayload as unknown as Prisma.JsonValue);
    const rowOutcome = this.resolveRowBasedSyncOutcome(syncType, payload);
    if (rowOutcome) {
      return rowOutcome;
    }

    if (syncType === ChannelSyncType.BOOKINGS) {
      return this.resolveBookingSyncOutcome(payload);
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

    const dedupedRowResults = this.dedupeInventorySyncRowResults(rowResults, syncLogId);

    const inventorySyncRows = (this.prisma as PrismaService & {
      inventorySyncRow: {
        deleteMany: (...args: unknown[]) => Promise<unknown>;
        createMany: (...args: unknown[]) => Promise<unknown>;
      };
    }).inventorySyncRow;

    await inventorySyncRows.deleteMany({
      where: { channelSyncLogId: syncLogId },
    });

    const succeededRowResults = dedupedRowResults.filter((row) => row.status === 'SUCCEEDED');
    if (succeededRowResults.length > 0) {
      await inventorySyncRows.deleteMany({
        where: {
          channelConnectionId: connectionId,
          status: 'FAILED',
          OR: succeededRowResults.map((row) => ({
            syncDate: new Date(`${row.date}T00:00:00.000Z`),
            externalRoomId: row.external_room_id,
          })),
        },
      });
    }

    await inventorySyncRows.createMany({
      data: dedupedRowResults.map((row) => ({
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

  private dedupeInventorySyncRowResults(
    rowResults: PersistedInventorySyncRowResult[],
    syncLogId: string,
  ) {
    const deduped = new Map<string, PersistedInventorySyncRowResult>();
    let duplicateCount = 0;

    for (const row of rowResults) {
      const key = `${row.date}::${row.external_room_id}`;
      const existing = deduped.get(key);
      if (!existing) {
        deduped.set(key, row);
        continue;
      }

      duplicateCount += 1;
      if (existing.status === 'FAILED' && row.status !== 'FAILED') {
        continue;
      }
      if (existing.status !== 'FAILED' && row.status === 'FAILED') {
        deduped.set(key, row);
        continue;
      }

      deduped.set(key, row);
    }

    if (duplicateCount > 0) {
      this.logger.warn(
        JSON.stringify({
          worker_id: this.workerId,
          channel_sync_log_id: syncLogId,
          duplicate_inventory_row_results: duplicateCount,
          message: 'Deduplicated duplicate inventory row results before persistence.',
        }),
      );
    }

    return [...deduped.values()];
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
