import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { ApiCallTraceRecord, ApiCallTraceService } from '../../common/api-call-trace/api-call-trace.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.guard';
import { PropertyService } from '../property/property.service';

@Injectable()
export class PlatformAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly propertyService: PropertyService,
    private readonly apiCallTraceService: ApiCallTraceService,
  ) {}

  async getHealth() {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const started = Date.now();
    let database: { status: 'ok' | 'error'; latency_ms: number | null; message?: string };

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = { status: 'ok', latency_ms: Date.now() - started };
    } catch (error) {
      database = {
        status: 'error',
        latency_ms: null,
        message: error instanceof Error ? error.message : 'Database check failed',
      };
    }

    const checkStarted = Date.now();
    const [
      propertyCount,
      activePropertyCount,
      userCount,
      reservationCount,
      channelCount,
      openBackgroundJobs,
      failedJobs24h,
      failedSyncs,
      failedSyncs24h,
      webhookErrors,
      webhookErrors24h,
      latestSuccessfulSync,
      latestFailedSync,
      latestWebhookFailure,
      latestJobFailure,
    ] =
      await Promise.all([
        this.prisma.property.count(),
        this.prisma.property.count({ where: { isActive: true } }),
        this.prisma.user.count(),
        this.prisma.reservationGroup.count(),
        this.prisma.channelConnection.count(),
        this.prisma.backgroundJob.count({ where: { status: { in: ['PENDING', 'PROCESSING'] } } }),
        this.prisma.backgroundJob.count({ where: { status: 'DEAD_LETTER', updatedAt: { gte: dayAgo } } }),
        this.prisma.channelSyncLog.count({ where: { status: { in: ['FAILED', 'PARTIAL_FAILED'] } } }),
        this.prisma.channelSyncLog.count({
          where: { status: { in: ['FAILED', 'PARTIAL_FAILED'] }, createdAt: { gte: dayAgo } },
        }),
        this.prisma.webhookEvent.count({ where: { status: 'FAILED' } }),
        this.prisma.webhookEvent.count({ where: { status: 'FAILED', receivedAt: { gte: dayAgo } } }),
        this.prisma.channelSyncLog.findFirst({
          where: { status: 'SUCCEEDED' },
          select: {
            id: true,
            syncType: true,
            createdAt: true,
            channelConnection: {
              select: { provider: true, name: true, property: { select: { id: true, name: true, code: true } } },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.channelSyncLog.findFirst({
          where: { status: { in: ['FAILED', 'PARTIAL_FAILED'] } },
          select: {
            id: true,
            syncType: true,
            status: true,
            errorMessage: true,
            createdAt: true,
            channelConnection: {
              select: { provider: true, name: true, property: { select: { id: true, name: true, code: true } } },
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.webhookEvent.findFirst({
          where: { status: 'FAILED' },
          select: {
            id: true,
            domain: true,
            provider: true,
            eventType: true,
            processingError: true,
            receivedAt: true,
            property: { select: { id: true, name: true, code: true } },
          },
          orderBy: { receivedAt: 'desc' },
        }),
        this.prisma.backgroundJob.findFirst({
          where: { status: 'DEAD_LETTER' },
          select: {
            id: true,
            type: true,
            lastError: true,
            updatedAt: true,
            property: { select: { id: true, name: true, code: true } },
          },
          orderBy: { updatedAt: 'desc' },
        }),
      ]);
    const queryLatency = Date.now() - checkStarted;

    const criticalApis = [
      this.endpointCheck('Auth login', 'POST', '/auth/login', true),
      this.endpointCheck('Property list', 'GET', '/properties', database.status === 'ok' && propertyCount >= 0, queryLatency),
      this.endpointCheck('Room categories', 'GET', '/room-categories', database.status === 'ok'),
      this.endpointCheck('Rate plans', 'GET', '/rate-plans', database.status === 'ok'),
      this.endpointCheck('Availability calendar', 'GET', '/availability', database.status === 'ok'),
      this.endpointCheck('Reservation feed', 'GET', '/bookings/groups', database.status === 'ok'),
      this.endpointCheck('Direct reservation', 'POST', '/reservations/direct', database.status === 'ok'),
      this.endpointCheck('Rooms', 'GET', '/rooms', database.status === 'ok'),
      this.endpointCheck('Payments', 'GET', '/payments', database.status === 'ok'),
      this.endpointCheck('Channels', 'GET', '/channels', database.status === 'ok' && channelCount >= 0),
      this.endpointCheck('Channel sync', 'POST', '/channels/:id/sync', database.status === 'ok'),
      this.endpointCheck('Zodomus webhook', 'POST', '/webhooks/zodomus', webhookErrors24h === 0),
    ];

    const incidents = [
      latestFailedSync
        ? {
            id: latestFailedSync.id,
            area: 'Channel sync',
            severity: latestFailedSync.status === 'FAILED' ? 'high' : 'medium',
            property: latestFailedSync.channelConnection.property,
            message:
              latestFailedSync.errorMessage ??
              `${latestFailedSync.channelConnection.provider} ${latestFailedSync.syncType} sync ${latestFailedSync.status.toLowerCase()}`,
            occurred_at: latestFailedSync.createdAt,
          }
        : null,
      latestWebhookFailure
        ? {
            id: latestWebhookFailure.id,
            area: 'Webhook',
            severity: 'high',
            property: latestWebhookFailure.property,
            message:
              latestWebhookFailure.processingError ??
              `${latestWebhookFailure.provider} ${latestWebhookFailure.eventType} webhook failed`,
            occurred_at: latestWebhookFailure.receivedAt,
          }
        : null,
      latestJobFailure
        ? {
            id: latestJobFailure.id,
            area: 'Background job',
            severity: 'high',
            property: latestJobFailure.property,
            message: latestJobFailure.lastError ?? `${latestJobFailure.type} reached dead letter`,
            occurred_at: latestJobFailure.updatedAt,
          }
        : null,
    ].filter(Boolean);

    return {
      status:
        database.status === 'ok' && failedJobs24h === 0 && failedSyncs24h === 0 && webhookErrors24h === 0
          ? 'ok'
          : 'degraded',
      service: 'hms-backend',
      environment: process.env.NODE_ENV ?? 'development',
      version: process.env.npm_package_version ?? '0.1.0',
      uptime_seconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      checks: {
        api: { status: 'ok' },
        database,
        data_queries: {
          status: database.status === 'ok' ? 'ok' : 'error',
          latency_ms: queryLatency,
          properties_checked: propertyCount,
          users_checked: userCount,
          reservations_checked: reservationCount,
          channels_checked: channelCount,
        },
      },
      critical_apis: criticalApis,
      integrations: {
        zodomus: {
          status: failedSyncs24h === 0 && webhookErrors24h === 0 ? 'ok' : 'degraded',
          failed_syncs_24h: failedSyncs24h,
          webhook_failures_24h: webhookErrors24h,
          latest_successful_sync: latestSuccessfulSync
            ? {
                id: latestSuccessfulSync.id,
                sync_type: latestSuccessfulSync.syncType,
                provider: latestSuccessfulSync.channelConnection.provider,
                channel: latestSuccessfulSync.channelConnection.name,
                property: latestSuccessfulSync.channelConnection.property,
                created_at: latestSuccessfulSync.createdAt,
              }
            : null,
        },
      },
      error_activity_24h: {
        failed_background_jobs: failedJobs24h,
        failed_or_partial_syncs: failedSyncs24h,
        webhook_failures: webhookErrors24h,
      },
      recent_incidents: incidents,
      totals: {
        properties: propertyCount,
        active_properties: activePropertyCount,
        users: userCount,
        open_background_jobs: openBackgroundJobs,
        failed_or_partial_syncs: failedSyncs,
        webhook_errors: webhookErrors,
      },
    };
  }

  private endpointCheck(name: string, method: string, path: string, healthy: boolean, latencyMs?: number) {
    return {
      name,
      method,
      path,
      status: healthy ? 'ok' : 'degraded',
      latency_ms: latencyMs ?? null,
      last_checked_at: new Date().toISOString(),
    };
  }

  async getProperties() {
    const properties = await this.prisma.property.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: {
        _count: {
          select: {
            users: true,
            rooms: true,
            roomCategories: true,
            ratePlans: true,
            reservationGroups: true,
            channelConnections: true,
            backgroundJobs: true,
            webhookEvents: true,
          },
        },
        channelConnections: {
          select: { id: true, provider: true, status: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' },
        },
      },
    });

    return properties.map((property) => ({
      id: property.id,
      name: property.name,
      code: property.code,
      email: property.email,
      phone: property.phone,
      timezone: property.timezone,
      is_active: property.isActive,
      created_at: property.createdAt,
      updated_at: property.updatedAt,
      counts: {
        users: property._count.users,
        rooms: property._count.rooms,
        room_categories: property._count.roomCategories,
        rate_plans: property._count.ratePlans,
        reservations: property._count.reservationGroups,
        channels: property._count.channelConnections,
        background_jobs: property._count.backgroundJobs,
        webhook_events: property._count.webhookEvents,
      },
      channels: property.channelConnections.map((connection) => ({
        id: connection.id,
        provider: connection.provider,
        status: connection.status,
        updated_at: connection.updatedAt,
      })),
    }));
  }

  async getIntegrations() {
    const [channels, recentSyncIssues, webhookIssues] = await Promise.all([
      this.prisma.channelConnection.findMany({
        select: {
          id: true,
          provider: true,
          name: true,
          status: true,
          externalHotelId: true,
          updatedAt: true,
          property: { select: { id: true, name: true, code: true } },
          _count: { select: { roomMappings: true, rateMappings: true, syncLogs: true } },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.channelSyncLog.findMany({
        where: { status: { in: ['FAILED', 'PARTIAL_FAILED'] } },
        select: {
          id: true,
          syncType: true,
          status: true,
          errorMessage: true,
          createdAt: true,
          channelConnection: {
            select: {
              provider: true,
              name: true,
              property: { select: { id: true, name: true, code: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 25,
      }),
      this.prisma.webhookEvent.findMany({
        where: { status: 'FAILED' },
        select: {
          id: true,
          domain: true,
          provider: true,
          eventType: true,
          processingError: true,
          receivedAt: true,
          property: { select: { id: true, name: true, code: true } },
        },
        orderBy: { receivedAt: 'desc' },
        take: 25,
      }),
    ]);

    return {
      channels: channels.map((channel) => ({
        id: channel.id,
        provider: channel.provider,
        name: channel.name,
        status: channel.status,
        external_hotel_id: channel.externalHotelId,
        updated_at: channel.updatedAt,
        property: channel.property,
        counts: {
          room_mappings: channel._count.roomMappings,
          rate_mappings: channel._count.rateMappings,
          sync_logs: channel._count.syncLogs,
        },
      })),
      recent_sync_issues: recentSyncIssues.map((issue) => ({
        id: issue.id,
        sync_type: issue.syncType,
        status: issue.status,
        error_message: issue.errorMessage,
        created_at: issue.createdAt,
        channel: {
          provider: issue.channelConnection.provider,
          name: issue.channelConnection.name,
          property: issue.channelConnection.property,
        },
      })),
      webhook_issues: webhookIssues.map((event) => ({
        id: event.id,
        domain: event.domain,
        provider: event.provider,
        event_type: event.eventType,
        processing_error: event.processingError,
        received_at: event.receivedAt,
        property: event.property,
      })),
    };
  }

  async getUsers() {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        updatedAt: true,
        property: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ role: 'asc' }, { updatedAt: 'desc' }],
    });

    return users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      is_active: user.isActive,
      updated_at: user.updatedAt,
      property: user.property,
    }));
  }

  async getSystemLogs() {
    const [jobs, webhooks, audits] = await Promise.all([
      this.prisma.backgroundJob.findMany({
        select: {
          id: true,
          type: true,
          status: true,
          attempts: true,
          lastError: true,
          runAt: true,
          updatedAt: true,
          property: { select: { id: true, name: true, code: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 30,
      }),
      this.prisma.webhookEvent.findMany({
        select: {
          id: true,
          domain: true,
          provider: true,
          eventType: true,
          status: true,
          processingError: true,
          receivedAt: true,
          property: { select: { id: true, name: true, code: true } },
        },
        orderBy: { receivedAt: 'desc' },
        take: 30,
      }),
      this.prisma.auditLog.findMany({
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          propertyId: true,
          summary: true,
          createdAt: true,
          user: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
    ]);

    return {
      jobs: jobs.map((job) => ({
        id: job.id,
        type: job.type,
        status: job.status,
        attempts: job.attempts,
        last_error: job.lastError,
        run_at: job.runAt,
        updated_at: job.updatedAt,
        property: job.property,
      })),
      webhooks: webhooks.map((event) => ({
        id: event.id,
        domain: event.domain,
        provider: event.provider,
        event_type: event.eventType,
        status: event.status,
        processing_error: event.processingError,
        received_at: event.receivedAt,
        property: event.property,
      })),
      audit_logs: audits.map((log) => ({
        id: log.id,
        action: log.action,
        entity_type: log.entityType,
        entity_id: log.entityId,
        summary: log.summary,
        created_at: log.createdAt,
        property_id: log.propertyId,
        user: log.user,
      })),
    };
  }

  async getProperty(id: string) {
    const property = await this.prisma.property.findUnique({
      where: { id },
      include: {
        users: {
          select: { id: true, name: true, email: true, role: true, isActive: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' },
        },
        roomCategories: {
          select: { id: true, name: true, code: true, maxOccupancy: true },
          orderBy: { name: 'asc' },
        },
        ratePlans: {
          select: { id: true, name: true, code: true, baseRate: true, currency: true, isActive: true },
          orderBy: { name: 'asc' },
        },
        channelConnections: {
          select: { id: true, provider: true, name: true, status: true, externalHotelId: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' },
        },
      },
    });

    if (!property) {
      throw new NotFoundException('Property not found');
    }

    const [rooms, reservationGroups, recentReservations, recentSyncIssues, recentJobs, recentAuditLogs] =
      await Promise.all([
        this.prisma.room.groupBy({
          by: ['status'],
          where: { propertyId: id },
          _count: { _all: true },
        }),
        this.prisma.reservationGroup.groupBy({
          by: ['status'],
          where: { propertyId: id },
          _count: { _all: true },
        }),
        this.prisma.reservationGroup.findMany({
          where: { propertyId: id },
          select: {
            id: true,
            externalReservationId: true,
            source: true,
            status: true,
            totalAmount: true,
            currency: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { updatedAt: 'desc' },
          take: 8,
        }),
        this.prisma.channelSyncLog.findMany({
          where: {
            channelConnection: { propertyId: id },
            status: { in: ['FAILED', 'PARTIAL_FAILED'] },
          },
          select: {
            id: true,
            syncType: true,
            status: true,
            errorMessage: true,
            createdAt: true,
            channelConnection: { select: { provider: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 8,
        }),
        this.prisma.backgroundJob.findMany({
          where: { propertyId: id },
          select: { id: true, type: true, status: true, attempts: true, lastError: true, runAt: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' },
          take: 8,
        }),
        this.prisma.auditLog.findMany({
          where: { propertyId: id },
          select: { id: true, action: true, entityType: true, entityId: true, summary: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 8,
        }),
      ]);

    return {
      id: property.id,
      name: property.name,
      code: property.code,
      email: property.email,
      phone: property.phone,
      address: property.address,
      timezone: property.timezone,
      is_active: property.isActive,
      created_at: property.createdAt,
      updated_at: property.updatedAt,
      users: property.users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        is_active: user.isActive,
        updated_at: user.updatedAt,
      })),
      room_categories: property.roomCategories.map((category) => ({
        id: category.id,
        name: category.name,
        code: category.code,
        max_occupancy: category.maxOccupancy,
      })),
      rate_plans: property.ratePlans.map((ratePlan) => ({
        id: ratePlan.id,
        name: ratePlan.name,
        code: ratePlan.code,
        base_rate: Number(ratePlan.baseRate),
        currency: ratePlan.currency,
        is_active: ratePlan.isActive,
      })),
      channels: property.channelConnections.map((connection) => ({
        id: connection.id,
        provider: connection.provider,
        name: connection.name,
        status: connection.status,
        external_hotel_id: connection.externalHotelId,
        updated_at: connection.updatedAt,
      })),
      room_status: rooms.map((entry) => ({ status: entry.status, count: entry._count._all })),
      reservation_status: reservationGroups.map((entry) => ({ status: entry.status, count: entry._count._all })),
      recent_reservations: recentReservations.map((reservation) => ({
        id: reservation.id,
        external_reservation_id: reservation.externalReservationId,
        source: reservation.source,
        status: reservation.status,
        total_amount: reservation.totalAmount == null ? null : Number(reservation.totalAmount),
        currency: reservation.currency,
        created_at: reservation.createdAt,
        updated_at: reservation.updatedAt,
      })),
      recent_sync_issues: recentSyncIssues.map((issue) => ({
        id: issue.id,
        sync_type: issue.syncType,
        status: issue.status,
        error_message: issue.errorMessage,
        channel: issue.channelConnection,
        created_at: issue.createdAt,
      })),
      recent_jobs: recentJobs.map((job) => ({
        id: job.id,
        type: job.type,
        status: job.status,
        attempts: job.attempts,
        last_error: job.lastError,
        run_at: job.runAt,
        updated_at: job.updatedAt,
      })),
      recent_audit_logs: recentAuditLogs.map((log) => ({
        id: log.id,
        action: log.action,
        entity_type: log.entityType,
        entity_id: log.entityId,
        summary: log.summary,
        created_at: log.createdAt,
      })),
      api_usage: this.getPropertyApiUsage(id),
    };
  }

  private getPropertyApiUsage(propertyId: string) {
    const now = Date.now();
    const records = this.apiCallTraceService
      .list({ kind: 'SYSTEM', limit: 500 })
      .filter((record) => this.traceBelongsToProperty(record, propertyId));
    const completedRecords = records.filter((record) => record.duration_ms != null);
    const failedRecords = records.filter((record) => record.status === 'FAILED');
    const lastCalledAt = records[0]?.started_at ?? null;
    const callsLast15m = records.filter((record) => now - Date.parse(record.started_at) <= 15 * 60 * 1000).length;
    const callsLast60m = records.filter((record) => now - Date.parse(record.started_at) <= 60 * 60 * 1000).length;
    const averageLatency =
      completedRecords.length > 0
        ? Math.round(completedRecords.reduce((sum, record) => sum + (record.duration_ms ?? 0), 0) / completedRecords.length)
        : null;

    return {
      window: 'recent trace buffer',
      total_calls: records.length,
      failed_calls: failedRecords.length,
      average_latency_ms: averageLatency,
      calls_last_15m: callsLast15m,
      calls_last_60m: callsLast60m,
      last_called_at: lastCalledAt,
      calls_by_hour: this.buildHourlyTraceSeries(records, 24),
      top_routes: this.groupTraceRecords(records, (record) => `${record.method} ${this.normalizeTracePath(record.path)}`, 8),
      top_screens: this.groupTraceRecords(records, (record) => record.screen_name ?? 'Unknown screen', 6),
      top_users: this.groupTraceRecords(records, (record) => record.user_email ?? 'Unknown user', 6),
      recent_calls: records.slice(0, 12).map((record) => ({
        id: record.id,
        user_email: record.user_email,
        user_role: record.user_role,
        screen_name: record.screen_name,
        method: record.method,
        path: this.normalizeTracePath(record.path),
        status: record.status,
        status_code: record.status_code,
        duration_ms: record.duration_ms,
        started_at: record.started_at,
      })),
    };
  }

  private buildHourlyTraceSeries(records: ApiCallTraceRecord[], hours: number) {
    const currentHour = new Date();
    currentHour.setMinutes(0, 0, 0);
    const startTime = currentHour.getTime() - (hours - 1) * 60 * 60 * 1000;
    const buckets = Array.from({ length: hours }, (_, index) => {
      const date = new Date(startTime + index * 60 * 60 * 1000);
      return {
        hour: date.toISOString(),
        label: date.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }),
        calls: 0,
        failed_calls: 0,
        average_latency_ms: null as number | null,
        duration_sum: 0,
        duration_count: 0,
      };
    });

    for (const record of records) {
      const startedAt = Date.parse(record.started_at);
      if (!Number.isFinite(startedAt) || startedAt < startTime) continue;

      const index = Math.floor((startedAt - startTime) / (60 * 60 * 1000));
      const bucket = buckets[index];
      if (!bucket) continue;

      bucket.calls += 1;
      if (record.status === 'FAILED') bucket.failed_calls += 1;
      if (record.duration_ms != null) {
        bucket.duration_sum += record.duration_ms;
        bucket.duration_count += 1;
      }
    }

    return buckets.map((bucket) => ({
      hour: bucket.hour,
      label: bucket.label,
      calls: bucket.calls,
      failed_calls: bucket.failed_calls,
      average_latency_ms: bucket.duration_count > 0 ? Math.round(bucket.duration_sum / bucket.duration_count) : null,
    }));
  }

  private traceBelongsToProperty(record: ApiCallTraceRecord, propertyId: string) {
    return record.property_id === propertyId || record.property_ids.includes(propertyId);
  }

  private groupTraceRecords(records: ApiCallTraceRecord[], keyForRecord: (record: ApiCallTraceRecord) => string, limit: number) {
    const buckets = new Map<string, { label: string; calls: number; failed_calls: number; average_latency_ms: number | null; last_called_at: string | null; duration_sum: number; duration_count: number }>();

    for (const record of records) {
      const label = keyForRecord(record);
      const existing = buckets.get(label) ?? {
        label,
        calls: 0,
        failed_calls: 0,
        average_latency_ms: null,
        last_called_at: null,
        duration_sum: 0,
        duration_count: 0,
      };

      existing.calls += 1;
      if (record.status === 'FAILED') existing.failed_calls += 1;
      if (record.duration_ms != null) {
        existing.duration_sum += record.duration_ms;
        existing.duration_count += 1;
      }
      if (!existing.last_called_at || Date.parse(record.started_at) > Date.parse(existing.last_called_at)) {
        existing.last_called_at = record.started_at;
      }
      buckets.set(label, existing);
    }

    return [...buckets.values()]
      .map((bucket) => ({
        label: bucket.label,
        calls: bucket.calls,
        failed_calls: bucket.failed_calls,
        average_latency_ms: bucket.duration_count > 0 ? Math.round(bucket.duration_sum / bucket.duration_count) : null,
        last_called_at: bucket.last_called_at,
      }))
      .sort((left, right) => right.calls - left.calls || Date.parse(right.last_called_at ?? '0') - Date.parse(left.last_called_at ?? '0'))
      .slice(0, limit);
  }

  private normalizeTracePath(path: string) {
    return path.split('?')[0] || path;
  }

  async deleteProperty(id: string) {
    return this.propertyService.removeProperty(id);
  }

  async deleteUser(id: string, currentUser: AuthenticatedUser) {
    if (id === currentUser.sub) {
      throw new ForbiddenException('You cannot delete your own platform owner account');
    }

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role === UserRole.PLATFORM_OWNER) {
      const platformOwnerCount = await this.prisma.user.count({
        where: { role: UserRole.PLATFORM_OWNER, isActive: true },
      });

      if (platformOwnerCount <= 1) {
        throw new ConflictException('Cannot delete the last active platform owner');
      }
    }

    await this.prisma.$transaction([
      this.prisma.refreshSession.deleteMany({ where: { userId: id } }),
      this.prisma.passwordResetToken.deleteMany({ where: { userId: id } }),
      this.prisma.user.delete({ where: { id } }),
    ]);

    return { id, deleted: true };
  }
}
