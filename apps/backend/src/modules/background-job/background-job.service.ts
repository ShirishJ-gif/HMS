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
import { MetricsService } from '../metrics/metrics.service';
import {
  BookingConfirmationPayload,
  CheckInReminderPayload,
  OwnerBookingNotificationPayload,
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

    const updated = await this.prisma.channelSyncLog.update({
      where: { id: log.id },
      data: {
        status: ChannelSyncStatus.SUCCEEDED,
        responsePayload,
        errorMessage: null,
      },
    });

    await this.auditLogService.record({
      action: AuditAction.CHANNEL_SYNC,
      entityType: 'channel_sync_log',
      entityId: updated.id,
      propertyId: connection.propertyId,
      summary: `${connection.provider} ${log.syncType} sync succeeded`,
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
      case 'booking_confirmation':
        await this.whatsappNotificationService.sendBookingConfirmation(
          this.readBookingConfirmationPayload(payload),
        );
        break;
      case 'owner_booking_notification':
        await this.whatsappNotificationService.sendOwnerBookingNotification(
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
  ): BookingConfirmationPayload {
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
  ): OwnerBookingNotificationPayload {
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
