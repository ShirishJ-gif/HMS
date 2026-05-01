import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, ChannelSyncStatus, ChannelSyncType, Prisma } from '@prisma/client';
import { BackgroundJobService } from '../background-job/background-job.service';
import { MetricsService } from '../metrics/metrics.service';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import { paginatedResponse, paginationParams } from '../../common/pagination/paginated-response';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthenticatedUser } from '../auth/auth.guard';
import { assertCanAccessProperty, propertyIdFilter } from '../auth/property-scope';
import { PrismaService } from '../../prisma/prisma.service';
import { ChannelProviderService } from './channel-provider.service';
import { CreateChannelConnectionDto } from './dto/create-channel-connection.dto';
import { CreateChannelRateMappingDto } from './dto/create-channel-rate-mapping.dto';
import { CreateChannelRoomMappingDto } from './dto/create-channel-room-mapping.dto';
import { SyncChannelDto } from './dto/sync-channel.dto';

@Injectable()
export class ChannelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providerService: ChannelProviderService,
    private readonly auditLogService: AuditLogService,
    private readonly idempotencyService: IdempotencyService,
    private readonly backgroundJobService: BackgroundJobService,
    private readonly metricsService: MetricsService,
  ) {}

  async createConnection(dto: CreateChannelConnectionDto, user?: AuthenticatedUser) {
    assertCanAccessProperty(user, dto.property_id);

    try {
      const connection = await this.prisma.channelConnection.create({
        data: {
          propertyId: dto.property_id,
          provider: dto.provider,
          name: dto.name,
          status: dto.status,
          externalHotelId: dto.external_hotel_id,
          credentials: dto.credentials ? (dto.credentials as Prisma.InputJsonValue) : Prisma.JsonNull,
        },
        include: this.connectionInclude(),
      });

      await this.auditLogService.record({
        action: AuditAction.CREATE,
        entityType: 'channel_connection',
        entityId: connection.id,
        propertyId: connection.propertyId,
        summary: `Created ${connection.provider} channel connection`,
        metadata: {
          name: connection.name,
          external_hotel_id: connection.externalHotelId,
        },
        user,
      });

      return this.toConnectionResponse(connection);
    } catch (error) {
      this.handlePrismaError(error, 'Channel connection already exists for this property');
    }
  }

  async findConnections(query: PaginationQueryDto, user?: AuthenticatedUser) {
    const { page, limit, skip, take } = paginationParams(query);
    const scopedPropertyId = propertyIdFilter(user);
    const search = query.search?.trim();
    const where: Prisma.ChannelConnectionWhereInput = {
      ...(scopedPropertyId ? { propertyId: scopedPropertyId } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { externalHotelId: { contains: search, mode: 'insensitive' } },
              { property: { name: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [connections, total] = await this.prisma.$transaction([
      this.prisma.channelConnection.findMany({
        where,
        include: this.connectionInclude(),
        orderBy: [{ property: { name: 'asc' } }, { provider: 'asc' }, { name: 'asc' }],
        skip,
        take,
      }),
      this.prisma.channelConnection.count({ where }),
    ]);

    return paginatedResponse(connections.map((connection) => this.toConnectionResponse(connection)), total, page, limit);
  }

  async createRoomMapping(connectionId: string, dto: CreateChannelRoomMappingDto, user?: AuthenticatedUser) {
    const connection = await this.findConnectionForValidation(connectionId);
    assertCanAccessProperty(user, connection.propertyId);

    const category = await this.prisma.roomCategory.findUnique({
      where: { id: dto.room_category_id },
    });

    if (!category) {
      throw new NotFoundException('Room category not found');
    }

    if (category.propertyId !== connection.propertyId) {
      throw new ConflictException('Room category does not belong to channel property');
    }

    try {
      const mapping = await this.prisma.channelRoomMapping.create({
        data: {
          channelConnectionId: connectionId,
          roomCategoryId: dto.room_category_id,
          externalRoomId: dto.external_room_id,
          externalRoomName: dto.external_room_name,
        },
        include: { roomCategory: true },
      });

      await this.auditLogService.record({
        action: AuditAction.CREATE,
        entityType: 'channel_room_mapping',
        entityId: mapping.id,
        propertyId: connection.propertyId,
        summary: `Mapped room category ${mapping.roomCategory.code} to ${mapping.externalRoomId}`,
        metadata: {
          channel_connection_id: connectionId,
          room_category_id: mapping.roomCategoryId,
        },
        user,
      });

      return this.toRoomMappingResponse(mapping);
    } catch (error) {
      this.handlePrismaError(error, 'Room mapping already exists for this channel');
    }
  }

  async createRateMapping(connectionId: string, dto: CreateChannelRateMappingDto, user?: AuthenticatedUser) {
    const connection = await this.findConnectionForValidation(connectionId);
    assertCanAccessProperty(user, connection.propertyId);

    const ratePlan = await this.prisma.ratePlan.findUnique({
      where: { id: dto.rate_plan_id },
    });

    if (!ratePlan) {
      throw new NotFoundException('Rate plan not found');
    }

    if (ratePlan.propertyId !== connection.propertyId) {
      throw new ConflictException('Rate plan does not belong to channel property');
    }

    try {
      const mapping = await this.prisma.channelRateMapping.create({
        data: {
          channelConnectionId: connectionId,
          ratePlanId: dto.rate_plan_id,
          externalRateId: dto.external_rate_id,
          externalRateName: dto.external_rate_name,
        },
        include: { ratePlan: true },
      });

      await this.auditLogService.record({
        action: AuditAction.CREATE,
        entityType: 'channel_rate_mapping',
        entityId: mapping.id,
        propertyId: connection.propertyId,
        summary: `Mapped rate plan ${mapping.ratePlan.code} to ${mapping.externalRateId}`,
        metadata: {
          channel_connection_id: connectionId,
          rate_plan_id: mapping.ratePlanId,
        },
        user,
      });

      return this.toRateMappingResponse(mapping);
    } catch (error) {
      this.handlePrismaError(error, 'Rate mapping already exists for this channel');
    }
  }

  async sync(connectionId: string, dto: SyncChannelDto, user?: AuthenticatedUser, idempotencyKey?: string) {
    return this.idempotencyService.run(
      idempotencyKey,
      'channels.sync',
      { connectionId, ...dto },
      user,
      () => this.syncOnce(connectionId, dto, user),
    );
  }

  private async syncOnce(connectionId: string, dto: SyncChannelDto, user?: AuthenticatedUser) {
    const connection = await this.prisma.channelConnection.findUnique({
      where: { id: connectionId },
      include: {
        property: true,
        roomMappings: { include: { roomCategory: true } },
        rateMappings: { include: { ratePlan: true } },
      },
    });

    if (!connection) {
      throw new NotFoundException('Channel connection not found');
    }

    assertCanAccessProperty(user, connection.propertyId);

    const requestPayload = await this.buildSyncPayload(connection, dto);
    const queuedLog = await this.prisma.channelSyncLog.create({
      data: {
        channelConnectionId: connection.id,
        syncType: dto.sync_type,
        status: ChannelSyncStatus.QUEUED,
        requestPayload,
      },
    });

    await this.backgroundJobService.enqueue({
      type: 'CHANNEL_SYNC',
      propertyId: connection.propertyId,
      dedupeKey: `channel-sync:${queuedLog.id}`,
      entityType: 'channel_sync_log',
      entityId: queuedLog.id,
      payload: {
        channel_sync_log_id: queuedLog.id,
      },
      maxAttempts: 3,
    });

    this.metricsService.recordChannelSyncQueued(dto.sync_type, connection.provider);

    return this.toSyncLogResponse(queuedLog);
  }

  async processQueuedSyncLog(syncLogId: string) {
    const log = await this.prisma.channelSyncLog.findUnique({
      where: { id: syncLogId },
      include: {
        channelConnection: {
          include: {
            property: true,
            roomMappings: { include: { roomCategory: true } },
            rateMappings: { include: { ratePlan: true } },
          },
        },
      },
    });

    if (!log) {
      throw new NotFoundException('Channel sync log not found');
    }

    const connection = log.channelConnection;
    const responsePayload = await this.providerService.push({
      provider: connection.provider,
      property_id: connection.propertyId,
      external_hotel_id: connection.externalHotelId,
      credentials: connection.credentials,
      sync_type: log.syncType,
      ...(this.readObject(log.requestPayload) as Prisma.InputJsonObject),
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
      },
    });

    this.metricsService.recordChannelSyncCompleted(log.syncType, connection.provider, updated.status);

    return this.toSyncLogResponse(updated);
  }

  async findSyncLogs(connectionId: string, query: PaginationQueryDto, user?: AuthenticatedUser) {
    const { page, limit, skip, take } = paginationParams(query);
    const connection = await this.findConnectionForValidation(connectionId);
    assertCanAccessProperty(user, connection.propertyId);

    const [logs, total] = await this.prisma.$transaction([
      this.prisma.channelSyncLog.findMany({
        where: { channelConnectionId: connectionId },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.channelSyncLog.count({ where: { channelConnectionId: connectionId } }),
    ]);

    return paginatedResponse(logs.map((log) => this.toSyncLogResponse(log)), total, page, limit);
  }

  private async findConnectionForValidation(id: string) {
    const connection = await this.prisma.channelConnection.findUnique({ where: { id } });

    if (!connection) {
      throw new NotFoundException('Channel connection not found');
    }

    return connection;
  }

  private async buildSyncPayload(
    connection: Prisma.ChannelConnectionGetPayload<{
      include: {
        property: true;
        roomMappings: { include: { roomCategory: true } };
        rateMappings: { include: { ratePlan: true } };
      };
    }>,
    dto: SyncChannelDto,
  ) {
    if (dto.sync_type === ChannelSyncType.RATES) {
      return {
        rates: connection.rateMappings.map((mapping) => ({
          external_rate_id: mapping.externalRateId,
          rate_plan_id: mapping.ratePlanId,
          rate_plan_code: mapping.ratePlan.code,
          base_rate: mapping.ratePlan.baseRate.toNumber(),
          currency: mapping.ratePlan.currency,
        })),
      };
    }

    const inventory = await Promise.all(
      connection.roomMappings.map(async (mapping) => {
        const [totalRooms, outOfServiceRooms, bookedRooms] = await Promise.all([
          this.prisma.room.count({
            where: {
              propertyId: connection.propertyId,
              roomCategoryId: mapping.roomCategoryId,
            },
          }),
          this.prisma.room.count({
            where: {
              propertyId: connection.propertyId,
              roomCategoryId: mapping.roomCategoryId,
              status: 'MAINTENANCE',
            },
          }),
          dto.from && dto.to
            ? this.prisma.booking.count({
                where: {
                  propertyId: connection.propertyId,
                  roomCategoryId: mapping.roomCategoryId,
                  status: { in: ['BOOKED', 'CHECKED_IN'] },
                  checkInDate: { lt: new Date(dto.to) },
                  checkOutDate: { gt: new Date(dto.from) },
                },
              })
            : Promise.resolve(0),
        ]);

        return {
          external_room_id: mapping.externalRoomId,
          room_category_id: mapping.roomCategoryId,
          room_category_code: mapping.roomCategory.code,
          total_inventory: totalRooms,
          out_of_service: outOfServiceRooms,
          booked: bookedRooms,
          available: Math.max(totalRooms - outOfServiceRooms - bookedRooms, 0),
        };
      }),
    );

    return { inventory };
  }

  private connectionInclude() {
    return {
      property: true,
      roomMappings: { include: { roomCategory: true }, orderBy: { createdAt: 'asc' } },
      rateMappings: { include: { ratePlan: true }, orderBy: { createdAt: 'asc' } },
      syncLogs: { orderBy: { createdAt: 'desc' }, take: 5 },
    } satisfies Prisma.ChannelConnectionInclude;
  }

  private readObject(value: Prisma.JsonValue | null) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, Prisma.JsonValue>)
      : {};
  }

  private handlePrismaError(error: unknown, conflictMessage: string): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException(conflictMessage);
      }

      if (error.code === 'P2003') {
        throw new NotFoundException('Related property or channel record not found');
      }
    }

    throw error;
  }

  private toConnectionResponse(
    connection: Prisma.ChannelConnectionGetPayload<{
      include: {
        property: true;
        roomMappings: { include: { roomCategory: true } };
        rateMappings: { include: { ratePlan: true } };
        syncLogs: true;
      };
    }>,
  ) {
    return {
      id: connection.id,
      property_id: connection.propertyId,
      provider: connection.provider,
      name: connection.name,
      status: connection.status,
      external_hotel_id: connection.externalHotelId,
      property: {
        id: connection.property.id,
        name: connection.property.name,
        code: connection.property.code,
      },
      room_mappings: connection.roomMappings.map((mapping) => this.toRoomMappingResponse(mapping)),
      rate_mappings: connection.rateMappings.map((mapping) => this.toRateMappingResponse(mapping)),
      recent_sync_logs: connection.syncLogs.map((log) => this.toSyncLogResponse(log)),
      created_at: connection.createdAt,
      updated_at: connection.updatedAt,
    };
  }

  private toRoomMappingResponse(mapping: Prisma.ChannelRoomMappingGetPayload<{ include: { roomCategory: true } }>) {
    return {
      id: mapping.id,
      channel_connection_id: mapping.channelConnectionId,
      room_category_id: mapping.roomCategoryId,
      external_room_id: mapping.externalRoomId,
      external_room_name: mapping.externalRoomName,
      room_category: {
        id: mapping.roomCategory.id,
        name: mapping.roomCategory.name,
        code: mapping.roomCategory.code,
      },
      created_at: mapping.createdAt,
      updated_at: mapping.updatedAt,
    };
  }

  private toRateMappingResponse(mapping: Prisma.ChannelRateMappingGetPayload<{ include: { ratePlan: true } }>) {
    return {
      id: mapping.id,
      channel_connection_id: mapping.channelConnectionId,
      rate_plan_id: mapping.ratePlanId,
      external_rate_id: mapping.externalRateId,
      external_rate_name: mapping.externalRateName,
      rate_plan: {
        id: mapping.ratePlan.id,
        name: mapping.ratePlan.name,
        code: mapping.ratePlan.code,
      },
      created_at: mapping.createdAt,
      updated_at: mapping.updatedAt,
    };
  }

  private toSyncLogResponse(log: {
    id: string;
    channelConnectionId: string;
    syncType: ChannelSyncType;
    status: ChannelSyncStatus;
    requestPayload: Prisma.JsonValue | null;
    responsePayload: Prisma.JsonValue | null;
    errorMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: log.id,
      channel_connection_id: log.channelConnectionId,
      sync_type: log.syncType,
      status: log.status,
      request_payload: log.requestPayload,
      response_payload: log.responsePayload,
      error_message: log.errorMessage,
      created_at: log.createdAt,
      updated_at: log.updatedAt,
    };
  }
}
