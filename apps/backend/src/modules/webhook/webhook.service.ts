import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuditAction, Prisma, WebhookDomain, WebhookEventStatus } from '@prisma/client';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginatedResponse, paginationParams } from '../../common/pagination/paginated-response';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthenticatedUser } from '../auth/auth.guard';
import { propertyIdFilter } from '../auth/property-scope';
import { BackgroundJobService } from '../background-job/background-job.service';
import { MetricsService } from '../metrics/metrics.service';

@Injectable()
export class WebhookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly backgroundJobService: BackgroundJobService,
    private readonly metricsService: MetricsService,
  ) {}

  async ingest(
    domainValue: string,
    providerValue: string,
    payload: Record<string, unknown>,
    headers: Record<string, string | string[] | undefined>,
    rawBody: Buffer | string | undefined,
  ) {
    const domain = this.parseDomain(domainValue);
    const provider = providerValue.trim().toLowerCase();
    if (!provider) {
      throw new BadRequestException('Webhook provider is required');
    }

    const rawPayload =
      typeof rawBody === 'string'
        ? rawBody
        : rawBody?.toString('utf8') ?? JSON.stringify(payload ?? {});
    const signature =
      this.extractHeader(headers, 'x-webhook-signature') ??
      this.extractHeader(headers, 'x-webhook-key') ??
      this.extractHeader(headers, 'x-api-key') ??
      this.extractHeader(headers, 'authorization') ??
      this.readString(payload.webhookKey) ??
      this.readString(payload.webhook_key);
    this.verifySignature(domain, provider, signature, rawPayload);

    const eventType =
      this.readString(payload.event_type) ??
      this.zodomusPayloadEventType(provider, payload) ??
      this.extractHeader(headers, 'x-event-type') ??
      'unknown';
    const externalEventId =
      this.readString(payload.event_id) ??
      this.readString(payload.notificationTypeId) ??
      this.extractHeader(headers, 'x-event-id') ??
      undefined;
    const propertyId = this.readUuid(payload.property_id);
    const dedupeKey = externalEventId
      ? `${domain}:${provider}:${externalEventId}`
      : `${domain}:${provider}:payload:${this.hash(rawPayload)}`;
    const requestHash = this.hash(JSON.stringify({ rawPayload, signature, eventType }));

    const stored = await this.prisma.$transaction(async (tx) => {
      await this.acquireLock(tx, dedupeKey);

      const existing = await tx.webhookEvent.findUnique({
        where: { dedupeKey },
      });

      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new ConflictException('Webhook replay key was already used for a different payload');
        }

        return { event: existing, duplicate: true };
      }

      const created = await tx.webhookEvent.create({
        data: {
          domain,
          provider,
          propertyId,
          dedupeKey,
          externalEventId,
          eventType,
          signature,
          headers: this.serializeHeaders(headers),
          payload: (payload ?? {}) as Prisma.InputJsonValue,
          requestHash,
          status: WebhookEventStatus.RECEIVED,
        },
      });

      return { event: created, duplicate: false };
    });

    if (stored.duplicate) {
      this.metricsService.recordWebhookIngested(domain, provider, true);
      return this.toResponse(stored.event, true);
    }

    await this.backgroundJobService.enqueue({
      type: 'WEBHOOK_PROCESS',
      propertyId,
      dedupeKey: `webhook-process:${stored.event.id}`,
      entityType: 'webhook_event',
      entityId: stored.event.id,
      payload: {
        webhook_event_id: stored.event.id,
      },
      maxAttempts: 3,
    });

    await this.auditLogService.record({
      action: AuditAction.CREATE,
      entityType: 'webhook_event',
      entityId: stored.event.id,
      propertyId: stored.event.propertyId,
      summary: `Accepted ${stored.event.domain.toLowerCase()} webhook for ${stored.event.provider}`,
      metadata: {
        external_event_id: stored.event.externalEventId,
        event_type: stored.event.eventType,
        dedupe_key: stored.event.dedupeKey,
      },
    });

    this.metricsService.recordWebhookIngested(domain, provider, false);

    return this.toResponse(stored.event, false);
  }

  async findAll(query: PaginationQueryDto, user?: AuthenticatedUser) {
    const { page, limit, skip, take } = paginationParams(query);
    const scopedPropertyId = propertyIdFilter(user);
    const search = query.search?.trim();
    const where: Prisma.WebhookEventWhereInput = {
      ...(scopedPropertyId ? { propertyId: scopedPropertyId } : {}),
      ...(search
        ? {
            OR: [
              { provider: { contains: search, mode: 'insensitive' } },
              { eventType: { contains: search, mode: 'insensitive' } },
              { externalEventId: { contains: search, mode: 'insensitive' } },
              { dedupeKey: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [events, total] = await this.prisma.$transaction([
      this.prisma.webhookEvent.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.webhookEvent.count({ where }),
    ]);

    return paginatedResponse(events.map((event) => this.toResponse(event, false)), total, page, limit);
  }

  private parseDomain(value: string) {
    const normalized = value.trim().toUpperCase();
    if (normalized === WebhookDomain.PAYMENT || normalized === WebhookDomain.CHANNEL) {
      return normalized;
    }

    throw new BadRequestException('Unsupported webhook domain');
  }

  private verifySignature(
    domain: WebhookDomain,
    provider: string,
    signature: string | undefined,
    rawPayload: string,
  ) {
    const secret = this.webhookSecretFor(domain, provider);

    if (!secret) {
      this.metricsService.recordWebhookRejected(domain, 'secret_missing');
      throw new ServiceUnavailableException('Webhook secret is not configured');
    }

    if (!signature) {
      this.metricsService.recordWebhookRejected(domain, 'missing_signature');
      throw new UnauthorizedException('Missing webhook signature');
    }

    const normalizedSignature = signature.startsWith('Bearer ') ? signature.slice(7).trim() : signature;
    const exactValue = normalizedSignature.startsWith('sha256=')
      ? normalizedSignature.slice(7)
      : normalizedSignature;
    const expected = createHmac('sha256', secret).update(rawPayload).digest('hex');
    const actual = exactValue;
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const actualBuffer = Buffer.from(actual, 'utf8');

    const exactSecretBuffer = Buffer.from(secret, 'utf8');
    const exactActualBuffer = Buffer.from(actual, 'utf8');
    const exactMatch =
      exactSecretBuffer.length === exactActualBuffer.length &&
      timingSafeEqual(exactSecretBuffer, exactActualBuffer);
    const hmacMatch =
      expectedBuffer.length === actualBuffer.length &&
      timingSafeEqual(expectedBuffer, actualBuffer);

    if (!exactMatch && !hmacMatch) {
      this.metricsService.recordWebhookRejected(domain, 'invalid_signature');
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }

  private webhookSecretFor(domain: WebhookDomain, provider: string) {
    if (domain === WebhookDomain.PAYMENT) {
      return process.env.PAYMENT_WEBHOOK_SECRET;
    }

    if (provider === 'zodomus') {
      return process.env.ZODOMUS_WEBHOOK_KEY?.trim() || process.env.CHANNEL_WEBHOOK_SECRET;
    }

    return process.env.CHANNEL_WEBHOOK_SECRET;
  }

  private extractHeader(headers: Record<string, string | string[] | undefined>, key: string) {
    const value = headers[key];
    if (Array.isArray(value)) {
      return value[0];
    }
    return value;
  }

  private serializeHeaders(headers: Record<string, string | string[] | undefined>): Prisma.InputJsonValue {
    return Object.fromEntries(
      Object.entries(headers)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key, Array.isArray(value) ? value : value]),
    ) as Prisma.InputJsonValue;
  }

  private readString(value: unknown) {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
  }

  private zodomusPayloadEventType(provider: string, payload: Record<string, unknown>) {
    if (provider !== 'zodomus') {
      return undefined;
    }

    const notificationType = this.readString(payload.notificationType);
    const notificationSubtype = this.readString(payload.notificationSubtype);
    if (notificationType) {
      return notificationSubtype
        ? `airbnb_notification_${notificationType}_${notificationSubtype}`
        : `airbnb_notification_${notificationType}`;
    }

    if (this.readString(payload.reservationId) || this.readString(payload.reservation_id)) {
      const status = this.readString(payload.reservationstatus) ?? this.readString(payload.reservation_status);
      return status ? `reservation_${status.toLowerCase()}` : 'reservation';
    }

    return undefined;
  }

  private readUuid(value: unknown) {
    const candidate = this.readString(value);
    if (!candidate) {
      return undefined;
    }

    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidPattern.test(candidate) ? candidate : undefined;
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private async acquireLock(tx: Prisma.TransactionClient, dedupeKey: string) {
    await tx.$queryRaw`
      SELECT COUNT(*)::int
      FROM (
        SELECT pg_advisory_xact_lock(hashtext(${dedupeKey}))
      ) AS webhook_lock
    `;
  }

  private toResponse(
    event: {
      id: string;
      domain: WebhookDomain;
      provider: string;
      propertyId: string | null;
      externalEventId: string | null;
      eventType: string;
      dedupeKey: string;
      status: WebhookEventStatus;
      processingError: string | null;
      receivedAt: Date;
      processedAt: Date | null;
    },
    duplicate: boolean,
  ) {
    return {
      id: event.id,
      domain: event.domain,
      provider: event.provider,
      property_id: event.propertyId,
      external_event_id: event.externalEventId,
      event_type: event.eventType,
      dedupe_key: event.dedupeKey,
      status: event.status,
      processing_error: event.processingError,
      duplicate,
      received_at: event.receivedAt,
      processed_at: event.processedAt,
    };
  }
}
