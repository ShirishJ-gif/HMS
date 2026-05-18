import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { AuditAction, ChannelProvider, ChannelSyncStatus, ChannelSyncType, Prisma } from '@prisma/client';
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
import { SaveChannelMappingsBatchDto } from './dto/save-channel-mappings-batch.dto';
import { SetupZodomusChannelDto } from './dto/setup-zodomus-channel.dto';
import { SyncChannelDto } from './dto/sync-channel.dto';
import { UpdateChannelAutomationDto } from './dto/update-channel-automation.dto';
import { InventorySyncPayloadService } from './inventory-sync-payload.service';
import { RateSyncPayloadService } from './rate-sync-payload.service';
import {
  readZodomusAppCredentials,
  readZodomusConnectionConfig,
  ZodomusOtaKey,
} from './providers/zodomus.types';
import { ZodomusReservationImportService } from './zodomus-reservation-import.service';

type InventorySnapshotRow = {
  date: string;
  external_room_id: string;
  room_category_id: string | null;
  room_category_code: string | null;
  total_inventory: number;
  out_of_service: number;
  booked: number;
  available: number;
};

type InventoryReconciliationStatus = 'NO_BASELINE' | 'IN_SYNC' | 'DRIFT_DETECTED';
type InventoryReconciliationRowStatus = 'DRIFTED' | 'SNAPSHOT_ONLY' | 'CURRENT_ONLY';
type InventorySyncRowResultStatus = 'SUCCEEDED' | 'FAILED';

type InventorySyncRowResult = {
  date: string;
  external_room_id: string;
  available: number;
  status: InventorySyncRowResultStatus;
  provider_response?: Prisma.JsonValue | null;
  error_message?: string | null;
};

type DbClient = PrismaService | Prisma.TransactionClient;

@Injectable()
export class ChannelService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChannelService.name);
  private schedulerTimer?: NodeJS.Timeout;
  private scheduling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerService: ChannelProviderService,
    private readonly auditLogService: AuditLogService,
    private readonly idempotencyService: IdempotencyService,
    private readonly backgroundJobService: BackgroundJobService,
    private readonly inventorySyncPayloadService: InventorySyncPayloadService,
    private readonly rateSyncPayloadService: RateSyncPayloadService,
    private readonly metricsService: MetricsService,
    private readonly zodomusReservationImportService: ZodomusReservationImportService,
  ) {}

  onModuleInit() {
    if (process.env.CHANNEL_SYNC_SCHEDULER_DISABLED === 'true') {
      return;
    }

    const pollMs = this.readPositiveInteger(process.env.CHANNEL_SYNC_SCHEDULER_POLL_MS, 60_000);
    this.schedulerTimer = setInterval(() => {
      void this.scheduleDueZodomusSyncs().catch((error: unknown) => {
        this.logger.error(
          error instanceof Error ? error.message : 'Zodomus channel sync scheduler failed',
        );
      });
    }, pollMs);
    this.schedulerTimer.unref();
  }

  onModuleDestroy() {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
    }
  }

  async createConnection(dto: CreateChannelConnectionDto, user?: AuthenticatedUser) {
    assertCanAccessProperty(user, dto.property_id);
    let normalizedCredentials = dto.credentials ? ({ ...dto.credentials } as Record<string, unknown>) : undefined;

    if (dto.provider === ChannelProvider.ZODOMUS) {
      const appCredentials = readZodomusAppCredentials();
      const connectionConfig = readZodomusConnectionConfig(dto.credentials);
      normalizedCredentials = {
        channel_code: connectionConfig.channel_code,
        ota_key: connectionConfig.ota_key,
        ota_name: connectionConfig.ota_name,
        environment: appCredentials.environment,
        automation: this.defaultZodomusAutomationConfig(),
        setup_status: this.defaultZodomusSetupStatus(),
      };
    }

    const normalizedOtaName =
      typeof normalizedCredentials?.ota_name === 'string' ? normalizedCredentials.ota_name : null;

    if (dto.provider === ChannelProvider.MOCK || dto.provider === ChannelProvider.ZODOMUS) {
      await this.providerService.validateConnection({
        provider: dto.provider,
        external_hotel_id: dto.external_hotel_id,
        credentials: normalizedCredentials,
      });
    }

    try {
      const connection = await this.prisma.channelConnection.create({
        data: {
          propertyId: dto.property_id,
          provider: dto.provider,
          name: dto.name,
          status: dto.status,
          externalHotelId: dto.external_hotel_id,
          credentials: normalizedCredentials ? (normalizedCredentials as Prisma.InputJsonValue) : Prisma.JsonNull,
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
          ota_name: normalizedOtaName,
          connection_check: 'validated',
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

  async deleteConnection(connectionId: string, user?: AuthenticatedUser) {
    const connection = await this.prisma.channelConnection.findUnique({
      where: { id: connectionId },
      include: this.connectionInclude(),
    });

    if (!connection) {
      throw new NotFoundException('Channel connection not found');
    }

    assertCanAccessProperty(user, connection.propertyId);
    const providerConfigSummary = this.readProviderConfigSummary(connection.provider, connection.credentials);

    await this.prisma.channelConnection.delete({
      where: { id: connectionId },
    });

    await this.auditLogService.record({
      action: AuditAction.DELETE,
      entityType: 'channel_connection',
      entityId: connection.id,
      propertyId: connection.propertyId,
      summary: `Deleted ${connection.provider} channel connection`,
      metadata: {
        name: connection.name,
        external_hotel_id: connection.externalHotelId,
        ota_name: providerConfigSummary?.ota_name ?? null,
        room_mapping_count: connection.roomMappings.length,
        rate_mapping_count: connection.rateMappings.length,
        recent_sync_log_count: connection.syncLogs.length,
      },
      user,
    });

    return {
      id: connection.id,
      deleted: true,
    };
  }

  async setupZodomusConnection(dto: SetupZodomusChannelDto, user?: AuthenticatedUser) {
    const connectionConfig = readZodomusConnectionConfig({ ota_key: dto.ota_key });
    const priceModelId = dto.price_model_id ?? this.defaultZodomusPriceModel(dto.ota_key);
    this.assertValidZodomusPriceModel(connectionConfig.ota_key, priceModelId);

    const createdConnection = await this.createConnection(
      {
        property_id: dto.property_id,
        provider: ChannelProvider.ZODOMUS,
        name: `${connectionConfig.ota_name} OTA`,
        external_hotel_id: dto.external_hotel_id,
        credentials: {
          ota_key: dto.ota_key,
        },
      },
      user,
    );

    const account = await this.getProviderAccount(createdConnection.id, user);
    const channels = await this.getProviderChannels(createdConnection.id, user);
    const activation = await this.activateProviderProperty(createdConnection.id, priceModelId, user);
    const propertyCheck = await this.checkProviderProperty(createdConnection.id, user);
    const catalog = await this.fetchProviderCatalog(createdConnection.id, user);
    const connection = await this.getConnectionResponse(createdConnection.id);

    return {
      connection,
      catalog,
      setup_status: {
        checked: true,
        activated: true,
        catalog_loaded: true,
        rooms_activated: false,
        ready: Boolean(connection.provider_config_summary?.setup_status?.ready),
        price_model_id: priceModelId,
        ota_name: connectionConfig.ota_name,
      },
      provider_responses: {
        account,
        channels,
        property_check: propertyCheck,
        activation,
      },
    };
  }

  async pauseConnection(connectionId: string, user?: AuthenticatedUser) {
    const connection = await this.findAccessibleConnection(connectionId, user);
    const updated = await this.prisma.channelConnection.update({
      where: { id: connectionId },
      data: { status: 'PAUSED' },
      include: this.connectionInclude(),
    });

    await this.auditLogService.record({
      action: AuditAction.UPDATE,
      entityType: 'channel_connection',
      entityId: updated.id,
      propertyId: updated.propertyId,
      summary: `Paused ${updated.provider} channel connection`,
      metadata: {
        previous_status: connection.status,
        next_status: updated.status,
      },
      user,
    });

    return this.toConnectionResponse(updated);
  }

  async resumeConnection(connectionId: string, user?: AuthenticatedUser) {
    const connection = await this.findAccessibleConnection(connectionId, user);
    const providerSummary = this.readProviderConfigSummary(connection.provider, connection.credentials);

    if (providerSummary?.setup_status?.disconnected) {
      throw new BadRequestException(
        'This connection was remotely disconnected from Zodomus. Create a new connection or reactivate it before resuming sync.',
      );
    }

    const updated = await this.prisma.channelConnection.update({
      where: { id: connectionId },
      data: { status: 'ACTIVE' },
      include: this.connectionInclude(),
    });

    await this.auditLogService.record({
      action: AuditAction.UPDATE,
      entityType: 'channel_connection',
      entityId: updated.id,
      propertyId: updated.propertyId,
      summary: `Resumed ${updated.provider} channel connection`,
      metadata: {
        previous_status: connection.status,
        next_status: updated.status,
      },
      user,
    });

    return this.toConnectionResponse(updated);
  }

  async disconnectConnection(connectionId: string, user?: AuthenticatedUser) {
    const connection = await this.findAccessibleConnection(connectionId, user);

    const response = await this.providerService.disconnectProperty({
      provider: connection.provider,
      external_hotel_id: connection.externalHotelId,
      credentials: connection.credentials,
    });

    await this.updateZodomusConnectionConfig(connection.id, connection.credentials, {
      setup_status: {
        disconnected: true,
        disconnected_at: new Date().toISOString(),
        last_disconnect_message: this.readProviderReturnMessage(response),
        last_disconnect_code: this.readProviderReturnCode(response),
        ready: false,
        ready_at: null,
      },
    });

    const updated = await this.prisma.channelConnection.update({
      where: { id: connectionId },
      data: { status: 'PAUSED' },
      include: this.connectionInclude(),
    });

    await this.auditLogService.record({
      action: AuditAction.UPDATE,
      entityType: 'channel_connection',
      entityId: updated.id,
      propertyId: updated.propertyId,
      summary: `Disconnected ${updated.provider} property connection`,
      metadata: {
        external_hotel_id: updated.externalHotelId,
      },
      user,
    });

    return {
      connection: this.toConnectionResponse(updated),
      provider_response: response,
    };
  }

  async updateAutomation(connectionId: string, dto: UpdateChannelAutomationDto, user?: AuthenticatedUser) {
    const connection = await this.findAccessibleConnection(connectionId, user);
    if (connection.provider !== ChannelProvider.ZODOMUS) {
      throw new BadRequestException('Automation settings are only implemented for Zodomus connections.');
    }

    const normalizedSyncWindowDays =
      dto.sync_window_days !== undefined
        ? this.normalizeZodomusSyncWindowDays(dto.sync_window_days)
        : undefined;

    await this.updateZodomusConnectionConfig(connection.id, connection.credentials, {
      automation: {
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.inventory_interval_minutes !== undefined
          ? { inventory_interval_minutes: dto.inventory_interval_minutes }
          : {}),
        ...(dto.rates_interval_minutes !== undefined ? { rates_interval_minutes: dto.rates_interval_minutes } : {}),
        ...(dto.bookings_interval_minutes !== undefined
          ? { bookings_interval_minutes: dto.bookings_interval_minutes }
          : {}),
        ...(normalizedSyncWindowDays !== undefined ? { sync_window_days: normalizedSyncWindowDays } : {}),
      },
    });

    const updated = await this.getConnectionResponse(connection.id);

    await this.auditLogService.record({
      action: AuditAction.UPDATE,
      entityType: 'channel_connection',
      entityId: connection.id,
      propertyId: connection.propertyId,
      summary: `Updated ${connection.provider} automation settings`,
      metadata: {
        automation: {
          ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
          ...(dto.inventory_interval_minutes !== undefined
            ? { inventory_interval_minutes: dto.inventory_interval_minutes }
            : {}),
          ...(dto.rates_interval_minutes !== undefined ? { rates_interval_minutes: dto.rates_interval_minutes } : {}),
          ...(dto.bookings_interval_minutes !== undefined
            ? { bookings_interval_minutes: dto.bookings_interval_minutes }
            : {}),
          ...(normalizedSyncWindowDays !== undefined ? { sync_window_days: normalizedSyncWindowDays } : {}),
        },
      },
      user,
    });

    return updated;
  }

  async fetchProviderCatalog(connectionId: string, user?: AuthenticatedUser) {
    const connection = await this.prisma.channelConnection.findUnique({ where: { id: connectionId } });

    if (!connection) {
      throw new NotFoundException('Channel connection not found');
    }

    assertCanAccessProperty(user, connection.propertyId);

    const response = await this.providerService.fetchCatalog({
      provider: connection.provider,
      external_hotel_id: connection.externalHotelId,
      credentials: connection.credentials,
    });

    if (connection.provider === ChannelProvider.ZODOMUS) {
      const catalog = response as unknown as {
        rooms?: unknown[];
        rates?: unknown[];
      };

      await this.updateZodomusConnectionConfig(connection.id, connection.credentials, {
        setup_status: {
          catalog_loaded: true,
          catalog_loaded_at: new Date().toISOString(),
          catalog_room_count: Array.isArray(catalog.rooms) ? catalog.rooms.length : 0,
          catalog_rate_count: Array.isArray(catalog.rates) ? catalog.rates.length : 0,
        },
      });
    }

    return response;
  }

  async checkProviderProperty(connectionId: string, user?: AuthenticatedUser) {
    const connection = await this.prisma.channelConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      throw new NotFoundException('Channel connection not found');
    }

    assertCanAccessProperty(user, connection.propertyId);

    const response = await this.providerService.checkProperty({
      provider: connection.provider,
      external_hotel_id: connection.externalHotelId,
      credentials: connection.credentials,
    });

    if (connection.provider === ChannelProvider.ZODOMUS) {
      const credentialsRecord =
        connection.credentials && typeof connection.credentials === 'object' && !Array.isArray(connection.credentials)
          ? (connection.credentials as Record<string, Prisma.JsonValue>)
          : {};
      const setupStatus = this.readZodomusSetupStatus(credentialsRecord);
      const providerReady = this.isZodomusReadyCheckResponse(response);
      const ready = providerReady && setupStatus.rooms_activated;
      await this.updateZodomusConnectionConfig(connection.id, connection.credentials, {
        setup_status: {
          checked: true,
          disconnected: false,
          checked_at: new Date().toISOString(),
          last_check_message: this.readProviderReturnMessage(response),
          last_check_code: this.readProviderReturnCode(response),
          ready,
          ready_at: ready ? new Date().toISOString() : null,
        },
      });
    }

    return response;
  }

  async activateProviderProperty(connectionId: string, priceModelId: number, user?: AuthenticatedUser) {
    const connection = await this.prisma.channelConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      throw new NotFoundException('Channel connection not found');
    }

    assertCanAccessProperty(user, connection.propertyId);

    if (connection.provider === ChannelProvider.ZODOMUS) {
      const connectionConfig = readZodomusConnectionConfig(connection.credentials);
      this.assertValidZodomusPriceModel(connectionConfig.ota_key, priceModelId);
    }

    const response = await this.providerService.activateProperty({
      provider: connection.provider,
      external_hotel_id: connection.externalHotelId,
      credentials: connection.credentials,
      price_model_id: priceModelId,
    });

    await this.auditLogService.record({
      action: AuditAction.UPDATE,
      entityType: 'channel_connection',
      entityId: connection.id,
      propertyId: connection.propertyId,
      summary: `Activated ${connection.provider} property connection`,
      metadata: {
        price_model_id: priceModelId,
      },
      user,
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

    return response;
  }

  async activateProviderRooms(connectionId: string, user?: AuthenticatedUser) {
    const connection = await this.prisma.channelConnection.findUnique({
      where: { id: connectionId },
      include: {
        roomMappings: { include: { roomCategory: true } },
        rateMappings: { include: { ratePlan: true } },
      },
    });

    if (!connection) {
      throw new NotFoundException('Channel connection not found');
    }

    assertCanAccessProperty(user, connection.propertyId);

    if (connection.provider !== ChannelProvider.ZODOMUS) {
      throw new BadRequestException('Room activation is currently supported only for Zodomus connections.');
    }

    const rooms = await this.buildZodomusRoomsActivationPayload(connection);
    const activation = await this.providerService.activateRooms({
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
      },
      user,
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

    return {
      activation,
      connection: await this.getConnectionResponse(connection.id),
    };
  }

  async getProviderAccount(connectionId: string, user?: AuthenticatedUser) {
    const connection = await this.findAccessibleConnection(connectionId, user);
    return this.providerService.getAccount({
      provider: connection.provider,
      external_hotel_id: connection.externalHotelId,
      credentials: connection.credentials,
    });
  }

  async getProviderChannels(connectionId: string, user?: AuthenticatedUser) {
    const connection = await this.findAccessibleConnection(connectionId, user);
    return this.providerService.getChannels({
      provider: connection.provider,
      external_hotel_id: connection.externalHotelId,
      credentials: connection.credentials,
    });
  }

  async getProviderCurrencies(connectionId: string, user?: AuthenticatedUser) {
    const connection = await this.findAccessibleConnection(connectionId, user);
    return this.providerService.getCurrencies({
      provider: connection.provider,
      external_hotel_id: connection.externalHotelId,
      credentials: connection.credentials,
    });
  }

  async getProviderPriceModels(connectionId: string, user?: AuthenticatedUser) {
    const connection = await this.findAccessibleConnection(connectionId, user);
    return this.providerService.getPriceModels({
      provider: connection.provider,
      external_hotel_id: connection.externalHotelId,
      credentials: connection.credentials,
    });
  }

  async getProviderReservationsQueue(connectionId: string, user?: AuthenticatedUser) {
    const connection = await this.findAccessibleConnection(connectionId, user);
    return this.providerService.getReservationsQueue({
      provider: connection.provider,
      external_hotel_id: connection.externalHotelId,
      credentials: connection.credentials,
    });
  }

  async getProviderReservationsSummary(connectionId: string, user?: AuthenticatedUser) {
    const connection = await this.findAccessibleConnection(connectionId, user);
    return this.providerService.getReservationsSummary({
      provider: connection.provider,
      external_hotel_id: connection.externalHotelId,
      credentials: connection.credentials,
    });
  }

  async getProviderReservation(connectionId: string, reservationId: string, user?: AuthenticatedUser) {
    const connection = await this.findAccessibleConnection(connectionId, user);
    return this.providerService.getReservation({
      provider: connection.provider,
      external_hotel_id: connection.externalHotelId,
      credentials: connection.credentials,
      reservation_id: reservationId,
    });
  }

  async getProviderReservationCC(connectionId: string, reservationId: string, user?: AuthenticatedUser) {
    const connection = await this.findAccessibleConnection(connectionId, user);
    return this.providerService.getReservationCC({
      provider: connection.provider,
      external_hotel_id: connection.externalHotelId,
      credentials: connection.credentials,
      reservation_id: reservationId,
    });
  }

  async createProviderTestReservation(
    connectionId: string,
    status: string,
    reservationId: string | undefined,
    user?: AuthenticatedUser,
  ) {
    const normalizedReservationId = this.normalizeProviderReservationId(status, reservationId);
    const connection = await this.findAccessibleConnection(connectionId, user);
    const providerResponse = await this.providerService.createTestReservation({
      provider: connection.provider,
      external_hotel_id: connection.externalHotelId,
      credentials: connection.credentials,
      status,
      reservation_id: normalizedReservationId,
    });

    if (connection.provider !== ChannelProvider.ZODOMUS || !this.isSuccessfulZodomusReservationCreate(providerResponse)) {
      return providerResponse;
    }

    const createdReservationId =
      this.extractCreatedReservationId(providerResponse) ?? normalizedReservationId ?? null;

    if (!createdReservationId) {
      return {
        ...providerResponse,
        import_summary: null,
        import_skipped_reason: 'Zodomus accepted reservation creation but did not return a reservation id.',
      };
    }

    const detailResponse = await this.providerService.getReservation({
      provider: connection.provider,
      external_hotel_id: connection.externalHotelId,
      credentials: connection.credentials,
      reservation_id: createdReservationId,
    });
    const providerReservationDetail = this.readObject(
      this.readObject(detailResponse as unknown as Prisma.JsonValue).response,
    );
    const importSummary = await this.zodomusReservationImportService.importFromSync({
      channelConnectionId: connection.id,
      propertyId: connection.propertyId,
      responsePayload: JSON.parse(
        JSON.stringify({
          reservations: [providerReservationDetail],
        }),
      ) as Prisma.JsonValue,
    });

    await this.backgroundJobService.finalizeImportedReservationImport({
      sourceConnectionId: connection.id,
      propertyId: connection.propertyId,
      importSummary,
    });

    return {
      ...providerResponse,
      reservation_id: createdReservationId,
      import_summary: importSummary,
    };
  }

  private normalizeProviderReservationId(status: string, reservationId: string | undefined) {
    const normalizedStatus = status.trim().toLowerCase();
    const trimmedReservationId = reservationId?.trim();

    if (normalizedStatus !== 'new' && !trimmedReservationId) {
      throw new BadRequestException('reservation_id is required for modified or cancelled provider reservation events.');
    }

    if (!trimmedReservationId) {
      return undefined;
    }

    const placeholderValues = new Set(['reservation_id', '{{reservation_id}}', 'paste_returned_real_reservation_id_here']);
    if (placeholderValues.has(trimmedReservationId.toLowerCase())) {
      throw new BadRequestException('Replace reservation_id with the real Zodomus reservation id before submitting.');
    }

    return trimmedReservationId;
  }

  async createRoomMapping(connectionId: string, dto: CreateChannelRoomMappingDto, user?: AuthenticatedUser) {
    const result = await this.saveMappingsBatch(
      connectionId,
      {
        room_mappings: [dto],
      },
      user,
    );

    return result.room_mappings[0];
  }

  async mapExternalProperty(connectionId: string, externalHotelId: string, user?: AuthenticatedUser) {
    const connection = await this.findAccessibleConnection(connectionId, user);

    const updated = await this.prisma.channelConnection.update({
      where: { id: connectionId },
      data: {
        externalHotelId: externalHotelId.trim(),
      },
      include: this.connectionInclude(),
    });

    await this.auditLogService.record({
      action: AuditAction.UPDATE,
      entityType: 'channel_connection',
      entityId: updated.id,
      propertyId: updated.propertyId,
      summary: `Updated external hotel mapping for ${updated.provider} connection`,
      metadata: {
        previous_external_hotel_id: connection.externalHotelId,
        next_external_hotel_id: updated.externalHotelId,
      },
      user,
    });

    return this.toConnectionResponse(updated);
  }

  async createRateMapping(connectionId: string, dto: CreateChannelRateMappingDto, user?: AuthenticatedUser) {
    const result = await this.saveMappingsBatch(
      connectionId,
      {
        rate_mappings: [dto],
      },
      user,
    );

    return result.rate_mappings[0];
  }

  async updateRateMappingPricingConfig(
    connectionId: string,
    mappingId: string,
    pricingConfig: Record<string, unknown>,
    user?: AuthenticatedUser,
  ) {
    const connection = await this.findAccessibleConnection(connectionId, user);
    const existing = await this.prisma.channelRateMapping.findUnique({
      where: { id: mappingId },
    });
    if (!existing || existing.channelConnectionId !== connection.id) {
      throw new NotFoundException('Channel rate mapping not found');
    }

    const updated = await this.prisma.channelRateMapping.update({
      where: {
        id: mappingId,
      },
      data: {
        pricingConfig: this.normalizePricingConfig(pricingConfig) ?? Prisma.JsonNull,
      },
      include: { ratePlan: true },
    });

    return this.toRateMappingResponse(updated);
  }

  async updateRoomMappingActivation(
    connectionId: string,
    mappingId: string,
    isActivationEnabled: boolean,
    user?: AuthenticatedUser,
  ) {
    const connection = await this.findAccessibleConnection(connectionId, user);
    const existing = await this.prisma.channelRoomMapping.findUnique({
      where: { id: mappingId },
    });
    if (!existing || existing.channelConnectionId !== connection.id) {
      throw new NotFoundException('Channel room mapping not found');
    }

    const updated = await this.prisma.channelRoomMapping.update({
      where: { id: mappingId },
      data: { isActivationEnabled },
      include: { roomCategory: true },
    });

    if (connection.provider === ChannelProvider.ZODOMUS) {
      await this.updateZodomusConnectionConfig(connection.id, connection.credentials, {
        setup_status: {
          rooms_activated: false,
          ready: false,
          ready_at: null,
        },
      });
    }

    return this.toRoomMappingResponse(updated);
  }

  async updateRateMappingActivation(
    connectionId: string,
    mappingId: string,
    isActivationEnabled: boolean,
    user?: AuthenticatedUser,
  ) {
    const connection = await this.findAccessibleConnection(connectionId, user);
    const existing = await this.prisma.channelRateMapping.findUnique({
      where: { id: mappingId },
    });
    if (!existing || existing.channelConnectionId !== connection.id) {
      throw new NotFoundException('Channel rate mapping not found');
    }

    const updated = await this.prisma.channelRateMapping.update({
      where: { id: mappingId },
      data: { isActivationEnabled },
      include: { ratePlan: true },
    });

    if (connection.provider === ChannelProvider.ZODOMUS) {
      await this.updateZodomusConnectionConfig(connection.id, connection.credentials, {
        setup_status: {
          rooms_activated: false,
          ready: false,
          ready_at: null,
        },
      });
    }

    return this.toRateMappingResponse(updated);
  }

  async saveMappingsBatch(connectionId: string, dto: SaveChannelMappingsBatchDto, user?: AuthenticatedUser) {
    const connection = await this.findConnectionForValidation(connectionId);
    assertCanAccessProperty(user, connection.propertyId);
    const roomInputs = (dto.room_mappings ?? []).map((mapping) => ({
      room_category_id: mapping.room_category_id,
      external_room_id: mapping.external_room_id.trim(),
      external_room_name: mapping.external_room_name?.trim() || undefined,
    }));
    const rateInputs = (dto.rate_mappings ?? []).map((mapping) => ({
      rate_plan_id: mapping.rate_plan_id,
      external_room_id: mapping.external_room_id?.trim() || undefined,
      external_rate_id: mapping.external_rate_id.trim(),
      external_rate_name: mapping.external_rate_name?.trim() || undefined,
      pricing_config: this.normalizePricingConfig(mapping.pricing_config),
    }));

    if (roomInputs.length === 0 && rateInputs.length === 0) {
      throw new BadRequestException('At least one room or rate mapping is required');
    }

    this.assertDistinctRoomMappingInputs(roomInputs);
    this.assertDistinctRateMappingInputs(rateInputs);

    const [categories, ratePlans] = await Promise.all([
      roomInputs.length > 0
        ? this.prisma.roomCategory.findMany({
            where: {
              id: { in: roomInputs.map((mapping) => mapping.room_category_id) },
            },
          })
        : Promise.resolve([]),
      rateInputs.length > 0
        ? this.prisma.ratePlan.findMany({
            where: {
              id: { in: rateInputs.map((mapping) => mapping.rate_plan_id) },
            },
          })
        : Promise.resolve([]),
    ]);

    const existingRoomMappings =
      ratePlans.length > 0
        ? await this.prisma.channelRoomMapping.findMany({
            where: {
              channelConnectionId: connectionId,
              roomCategoryId: {
                in: Array.from(new Set(ratePlans.map((ratePlan) => ratePlan.roomCategoryId))),
              },
            },
          })
        : [];

    const categoriesById = new Map(categories.map((category) => [category.id, category]));
    const ratePlansById = new Map(ratePlans.map((ratePlan) => [ratePlan.id, ratePlan]));
    const existingRoomMappingsByCategoryId = new Map(
      existingRoomMappings.map((mapping) => [mapping.roomCategoryId, mapping]),
    );
    const stagedRoomIdsByCategoryId = new Map(
      roomInputs.map((mapping) => [mapping.room_category_id, mapping.external_room_id]),
    );

    roomInputs.forEach((mapping) => {
      const category = categoriesById.get(mapping.room_category_id);
      if (!category) {
        throw new NotFoundException('Room category not found');
      }

      if (category.propertyId !== connection.propertyId) {
        throw new ConflictException('Room category does not belong to channel property');
      }
    });

    rateInputs.forEach((mapping) => {
      const ratePlan = ratePlansById.get(mapping.rate_plan_id);
      if (!ratePlan) {
        throw new NotFoundException('Rate plan not found');
      }

      if (ratePlan.propertyId !== connection.propertyId) {
        throw new ConflictException('Rate plan does not belong to channel property');
      }

      const stagedExternalRoomId = stagedRoomIdsByCategoryId.get(ratePlan.roomCategoryId) ?? null;
      const mappedRoom = existingRoomMappingsByCategoryId.get(ratePlan.roomCategoryId) ?? null;
      const externalRoomId = mapping.external_room_id ?? stagedExternalRoomId ?? mappedRoom?.externalRoomId ?? null;

      if (!externalRoomId) {
        throw new BadRequestException(
          `Map the HMS room category for rate plan ${ratePlan.code} before saving its provider rate mapping.`,
        );
      }

      if (mappedRoom && externalRoomId !== mappedRoom.externalRoomId) {
        throw new ConflictException(
          `Rate plan ${ratePlan.code} belongs to room category ${ratePlan.roomCategoryId}, which is mapped to provider room ${mappedRoom.externalRoomId}.`,
        );
      }
    });

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const createdRoomMappings: Prisma.ChannelRoomMappingGetPayload<{ include: { roomCategory: true } }>[] = [];
        const createdRateMappings: Prisma.ChannelRateMappingGetPayload<{ include: { ratePlan: true } }>[] = [];

        for (const mapping of roomInputs) {
          createdRoomMappings.push(
            await tx.channelRoomMapping.create({
              data: {
                channelConnectionId: connectionId,
                roomCategoryId: mapping.room_category_id,
                externalRoomId: mapping.external_room_id,
                externalRoomName: mapping.external_room_name,
              },
              include: { roomCategory: true },
            }),
          );
        }

        const txRoomMappingsByCategoryId = new Map(
          createdRoomMappings.map((mapping) => [mapping.roomCategoryId, mapping.externalRoomId]),
        );

        for (const mapping of rateInputs) {
          const ratePlan = ratePlansById.get(mapping.rate_plan_id)!;
          const persistedRoomMapping =
            existingRoomMappingsByCategoryId.get(ratePlan.roomCategoryId) ??
            (await tx.channelRoomMapping.findUnique({
              where: {
                channelConnectionId_roomCategoryId: {
                  channelConnectionId: connectionId,
                  roomCategoryId: ratePlan.roomCategoryId,
                },
              },
            }));
          const externalRoomId =
            mapping.external_room_id ??
            txRoomMappingsByCategoryId.get(ratePlan.roomCategoryId) ??
            persistedRoomMapping?.externalRoomId ??
            null;

          createdRateMappings.push(
            await tx.channelRateMapping.create({
              data: {
                channelConnectionId: connectionId,
                ratePlanId: mapping.rate_plan_id,
                externalRoomId,
                externalRateId: mapping.external_rate_id,
                externalRateName: mapping.external_rate_name,
                pricingConfig: mapping.pricing_config,
              },
              include: { ratePlan: true },
            }),
          );
        }

        return {
          room_mappings: createdRoomMappings.map((mapping) => this.toRoomMappingResponse(mapping)),
          rate_mappings: createdRateMappings.map((mapping) => this.toRateMappingResponse(mapping)),
        };
      });

      for (const mapping of result.room_mappings) {
        await this.auditLogService.record({
          action: AuditAction.CREATE,
          entityType: 'channel_room_mapping',
          entityId: mapping.id,
          propertyId: connection.propertyId,
          summary: `Mapped room category ${mapping.room_category.code} to ${mapping.external_room_id}`,
          metadata: {
            channel_connection_id: connectionId,
            room_category_id: mapping.room_category_id,
          },
          user,
        });
      }

      for (const mapping of result.rate_mappings) {
        await this.auditLogService.record({
          action: AuditAction.CREATE,
          entityType: 'channel_rate_mapping',
          entityId: mapping.id,
          propertyId: connection.propertyId,
          summary: `Mapped rate plan ${mapping.rate_plan.code} to ${mapping.external_rate_id}`,
          metadata: {
            channel_connection_id: connectionId,
            rate_plan_id: mapping.rate_plan_id,
            external_room_id: mapping.external_room_id,
          },
          user,
        });
      }

      if (result.room_mappings.length > 0) {
        await this.backgroundJobService.queueInventorySyncsForProperty(connection.propertyId, {
          trigger: 'room_mapping_created',
        });
      }

      return result;
    } catch (error) {
      this.handlePrismaError(error, 'One or more mappings already exist for this channel');
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

  async backfillReservationsSummary(connectionId: string, user?: AuthenticatedUser) {
    const connection = await this.prisma.channelConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      throw new NotFoundException('Channel connection not found');
    }

    assertCanAccessProperty(user, connection.propertyId);

    if (connection.provider !== ChannelProvider.ZODOMUS) {
      throw new BadRequestException('Reservation summary backfill is currently supported only for Zodomus connections.');
    }

    const setupStatus = this.readZodomusSetupStatus(
      connection.credentials && typeof connection.credentials === 'object' && !Array.isArray(connection.credentials)
        ? (connection.credentials as Record<string, Prisma.JsonValue>)
        : {},
    );

    if (!setupStatus.ready || !setupStatus.rooms_activated || setupStatus.disconnected) {
      throw new BadRequestException('Reservation summary backfill requires a ready Zodomus connection.');
    }

    const queuedLog = await this.prisma.channelSyncLog.create({
      data: {
        channelConnectionId: connection.id,
        syncType: ChannelSyncType.BOOKINGS,
        status: ChannelSyncStatus.QUEUED,
        requestPayload: {
          reservation_import: {
            mode: 'summary_backfill',
          },
          trigger: 'manual_summary_backfill',
        } satisfies Prisma.InputJsonObject,
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

    this.metricsService.recordChannelSyncQueued(ChannelSyncType.BOOKINGS, connection.provider);

    return this.toSyncLogResponse(queuedLog);
  }

  private async syncOnce(connectionId: string, dto: SyncChannelDto, user?: AuthenticatedUser) {
    const connection = await this.prisma.channelConnection.findUnique({
      where: { id: connectionId },
      include: {
        property: true,
        roomMappings: { include: { roomCategory: true } },
        rateMappings: { include: { ratePlan: { include: { roomCategory: true } } } },
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
            rateMappings: { include: { ratePlan: { include: { roomCategory: true } } } },
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

    const syncOutcome = this.resolveSyncOutcome(log.syncType, responsePayload);
    const updated = await this.prisma.channelSyncLog.update({
      where: { id: log.id },
      data: {
        status: syncOutcome.status,
        responsePayload,
        errorMessage: syncOutcome.errorMessage,
      },
    });
    if (log.syncType === ChannelSyncType.INVENTORY) {
      await this.persistInventorySyncRows(updated.id, connection.id, responsePayload);
    }

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

  async findInventoryReconciliation(connectionId: string, user?: AuthenticatedUser) {
    const connection = await this.prisma.channelConnection.findUnique({
      where: { id: connectionId },
      include: {
        roomMappings: { include: { roomCategory: true }, orderBy: { createdAt: 'asc' } },
      },
    });

    if (!connection) {
      throw new NotFoundException('Channel connection not found');
    }

    assertCanAccessProperty(user, connection.propertyId);

    const latestSuccessfulInventorySync = await this.prisma.channelSyncLog.findFirst({
      where: {
        channelConnectionId: connectionId,
        syncType: ChannelSyncType.INVENTORY,
        status: ChannelSyncStatus.SUCCEEDED,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!latestSuccessfulInventorySync) {
      return this.emptyInventoryReconciliation(
        'NO_BASELINE',
        'No successful inventory sync snapshot exists yet. Run an inventory sync first.',
      );
    }

    const snapshot = this.readInventorySnapshot(latestSuccessfulInventorySync.requestPayload);
    if (!snapshot.window || snapshot.rows.length === 0) {
      return this.emptyInventoryReconciliation(
        'NO_BASELINE',
        'The latest successful inventory sync does not contain a usable snapshot payload.',
        latestSuccessfulInventorySync,
      );
    }

    const currentRows = await this.inventorySyncPayloadService.buildDailyInventoryRows(
      connection.propertyId,
      connection.roomMappings,
      snapshot.window,
    );

    return this.compareInventorySnapshots({
      snapshotRows: snapshot.rows,
      currentRows: currentRows.map((row) => ({
        date: row.date,
        external_room_id: row.external_room_id,
        room_category_id: row.room_category_id,
        room_category_code: row.room_category_code,
        total_inventory: row.total_inventory,
        out_of_service: row.out_of_service,
        booked: row.booked,
        available: row.available,
      })),
      latestSyncLog: latestSuccessfulInventorySync,
      window: snapshot.window,
      trigger: snapshot.trigger,
    });
  }

  async findInventoryRowResults(connectionId: string, user?: AuthenticatedUser) {
    const connection = await this.findAccessibleConnection(connectionId, user);
    const inventorySyncRows = (this.prisma as PrismaService & {
      inventorySyncRow: {
        groupBy: (...args: unknown[]) => Promise<unknown[]>;
        findMany: (...args: unknown[]) => Promise<unknown[]>;
      };
    }).inventorySyncRow;
    const [summaryCounts, recentFailedRows, groupedFailures] = await Promise.all([
      inventorySyncRows.groupBy({
        by: ['status'],
        where: { channelConnectionId: connection.id },
        _count: { _all: true },
      }),
      inventorySyncRows.findMany({
        where: {
          channelConnectionId: connection.id,
          status: 'FAILED',
        },
        orderBy: [{ createdAt: 'desc' }, { syncDate: 'desc' }],
        take: 20,
      }),
      inventorySyncRows.groupBy({
        by: ['externalRoomId'],
        where: {
          channelConnectionId: connection.id,
          status: 'FAILED',
        },
        _count: { _all: true },
        _max: { createdAt: true, syncDate: true },
        orderBy: {
          _count: { externalRoomId: 'desc' },
        },
        take: 10,
      }),
    ]);
    const typedSummaryCounts = summaryCounts as Array<{ status: string; _count: { _all: number } }>;
    const typedRecentFailedRows = recentFailedRows as Array<{
      id: string;
      channelSyncLogId: string;
      syncDate: Date;
      externalRoomId: string;
      available: number;
      errorMessage: string | null;
      providerResponse: unknown;
      createdAt: Date;
    }>;
    const typedGroupedFailures = groupedFailures as Array<{
      externalRoomId: string;
      _count: { _all: number };
      _max: { createdAt: Date | null; syncDate: Date | null };
    }>;

    return {
      summary: {
        total_rows: typedSummaryCounts.reduce((sum, entry) => sum + entry._count._all, 0),
        failed_rows: typedSummaryCounts.find((entry) => entry.status === 'FAILED')?._count._all ?? 0,
        succeeded_rows: typedSummaryCounts.find((entry) => entry.status === 'SUCCEEDED')?._count._all ?? 0,
        failed_rooms: typedGroupedFailures.length,
      },
      recent_failed_rows: typedRecentFailedRows.map((row) => ({
        id: row.id,
        channel_sync_log_id: row.channelSyncLogId,
        sync_date: row.syncDate.toISOString().slice(0, 10),
        external_room_id: row.externalRoomId,
        available: row.available,
        error_message: row.errorMessage,
        provider_response: row.providerResponse,
        created_at: row.createdAt,
      })),
      grouped_failures: typedGroupedFailures.map((row) => ({
        external_room_id: row.externalRoomId,
        failure_count: row._count._all,
        last_failed_at: row._max.createdAt?.toISOString() ?? null,
        last_failed_date: row._max.syncDate?.toISOString().slice(0, 10) ?? null,
      })),
    };
  }

  async retryFailedInventoryRows(connectionId: string, syncLogId: string, user?: AuthenticatedUser) {
    const connection = await this.findAccessibleConnection(connectionId, user);
    const sourceLog = await this.prisma.channelSyncLog.findUnique({
      where: { id: syncLogId },
    });

    if (!sourceLog || sourceLog.channelConnectionId !== connection.id) {
      throw new NotFoundException('Channel sync log not found for this connection');
    }

    if (sourceLog.syncType !== ChannelSyncType.INVENTORY) {
      throw new BadRequestException('Failed-row retry is only supported for inventory sync logs.');
    }

    const failedRows = this.extractFailedInventoryRows(sourceLog.responsePayload, sourceLog.requestPayload);
    if (failedRows.length === 0) {
      throw new BadRequestException('This inventory sync log has no failed rows to retry.');
    }

    const sortedDates = failedRows.map((row) => row.date).sort((left, right) => left.localeCompare(right));
    const queuedLog = await this.prisma.channelSyncLog.create({
      data: {
        channelConnectionId: connection.id,
        syncType: ChannelSyncType.INVENTORY,
        status: ChannelSyncStatus.QUEUED,
        requestPayload: {
          from: sortedDates[0],
          to: sortedDates[sortedDates.length - 1],
          inventory: failedRows,
          trigger: 'retry_failed_rows',
          retry_of_sync_log_id: sourceLog.id,
        } satisfies Prisma.InputJsonObject,
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

    this.metricsService.recordChannelSyncQueued(ChannelSyncType.INVENTORY, connection.provider);
    return this.toSyncLogResponse(queuedLog);
  }

  private async findConnectionForValidation(id: string) {
    const connection = await this.prisma.channelConnection.findUnique({ where: { id } });

    if (!connection) {
      throw new NotFoundException('Channel connection not found');
    }

    return connection;
  }

  private async findAccessibleConnection(id: string, user?: AuthenticatedUser) {
    const connection = await this.findConnectionForValidation(id);
    assertCanAccessProperty(user, connection.propertyId);
    return connection;
  }

  private async getConnectionResponse(connectionId: string) {
    const connection = await this.prisma.channelConnection.findUnique({
      where: { id: connectionId },
      include: this.connectionInclude(),
    });

    if (!connection) {
      throw new NotFoundException('Channel connection not found');
    }

    return this.toConnectionResponse(connection);
  }

  private async scheduleDueZodomusSyncs() {
    if (this.scheduling) {
      return 0;
    }

    this.scheduling = true;
    let scheduled = 0;

    try {
      const connections = await this.prisma.channelConnection.findMany({
        where: {
          provider: ChannelProvider.ZODOMUS,
          status: 'ACTIVE',
        },
        include: {
          property: true,
          roomMappings: { include: { roomCategory: true } },
          rateMappings: { include: { ratePlan: { include: { roomCategory: true } } } },
          syncLogs: { orderBy: { createdAt: 'desc' }, take: 12 },
        },
        orderBy: { createdAt: 'asc' },
      });

      for (const connection of connections) {
        scheduled += await this.scheduleConnectionSyncs(connection);
      }

      return scheduled;
    } finally {
      this.scheduling = false;
    }
  }

  private async scheduleConnectionSyncs(
    connection: Prisma.ChannelConnectionGetPayload<{
      include: {
        property: true;
        roomMappings: { include: { roomCategory: true } };
        rateMappings: { include: { ratePlan: { include: { roomCategory: true } } } };
        syncLogs: true;
      };
    }>,
  ) {
    const providerSummary = this.readProviderConfigSummary(connection.provider, connection.credentials);
    if (connection.provider !== ChannelProvider.ZODOMUS || !providerSummary?.automation?.enabled) {
      return 0;
    }

    if (
      providerSummary.setup_status?.disconnected ||
      !providerSummary.setup_status?.activated ||
      !providerSummary.setup_status?.catalog_loaded ||
      !providerSummary.setup_status?.rooms_activated ||
      !providerSummary.setup_status?.ready
    ) {
      return 0;
    }

    if (this.isZodomusSyncInCooldown(connection.syncLogs, providerSummary.environment)) {
      return 0;
    }

    const syncWindow = this.currentSyncWindow(providerSummary.automation.sync_window_days);
    const activeRoomMappingCount = connection.roomMappings.filter((mapping) => mapping.isActivationEnabled).length;
    const activeRateMappingCount = connection.rateMappings.filter((mapping) => mapping.isActivationEnabled).length;
    let scheduled = 0;

    if (
      activeRoomMappingCount > 0 &&
      this.isScheduledSyncDue(
        connection.syncLogs,
        ChannelSyncType.INVENTORY,
        providerSummary.automation.inventory_interval_minutes,
      )
    ) {
      await this.queueAutomatedSync(connection, {
        sync_type: ChannelSyncType.INVENTORY,
        from: syncWindow.from,
        to: syncWindow.to,
      });
      scheduled += 1;
    }

    if (
      activeRoomMappingCount > 0 &&
      activeRateMappingCount > 0 &&
      this.isScheduledSyncDue(
        connection.syncLogs,
        ChannelSyncType.RATES,
        providerSummary.automation.rates_interval_minutes,
      )
    ) {
      await this.queueAutomatedSync(connection, {
        sync_type: ChannelSyncType.RATES,
        from: syncWindow.from,
        to: syncWindow.to,
      });
      scheduled += 1;
    }

    if (
      this.isScheduledSyncDue(
        connection.syncLogs,
        ChannelSyncType.BOOKINGS,
        providerSummary.automation.bookings_interval_minutes,
      )
    ) {
      await this.queueAutomatedSync(connection, {
        sync_type: ChannelSyncType.BOOKINGS,
      });
      scheduled += 1;
    }

    return scheduled;
  }

  private async queueAutomatedSync(
    connection: Prisma.ChannelConnectionGetPayload<{
      include: {
        property: true;
        roomMappings: { include: { roomCategory: true } };
        rateMappings: { include: { ratePlan: { include: { roomCategory: true } } } };
        syncLogs: true;
      };
    }>,
    dto: SyncChannelDto,
  ) {
    const requestPayload = await this.buildSyncPayload(connection, dto);
    const queuedLog = await this.prisma.channelSyncLog.create({
      data: {
        channelConnectionId: connection.id,
        syncType: dto.sync_type,
        status: ChannelSyncStatus.QUEUED,
        requestPayload: {
          ...requestPayload,
          trigger: 'scheduler',
        } satisfies Prisma.InputJsonObject,
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
  }

  private isScheduledSyncDue(
    syncLogs: Array<{
      syncType: ChannelSyncType;
      createdAt: Date;
    }>,
    syncType: ChannelSyncType,
    intervalMinutes: number,
  ) {
    if (intervalMinutes <= 0) {
      return false;
    }

    const latest = syncLogs.find((log) => log.syncType === syncType);
    if (!latest) {
      return true;
    }

    return Date.now() - latest.createdAt.getTime() >= intervalMinutes * 60_000;
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

  private async buildSyncPayload(
    connection: Prisma.ChannelConnectionGetPayload<{
      include: {
        property: true;
        roomMappings: { include: { roomCategory: true } };
        rateMappings: { include: { ratePlan: { include: { roomCategory: true } } } };
      };
    }>,
    dto: SyncChannelDto,
  ) {
    if (dto.sync_type === ChannelSyncType.BOOKINGS) {
      return {
        reservation_import: {
          mode: 'reservation_queue_poll',
          from: dto.from ?? null,
          to: dto.to ?? null,
        },
      };
    }

    if (dto.sync_type === ChannelSyncType.RATES) {
      if (!dto.from || !dto.to) {
        throw new BadRequestException('Zodomus rate sync requires both from and to dates.');
      }

      const providerSummary = this.readProviderConfigSummary(connection.provider, connection.credentials);
      const zodomusConnectionConfig =
        connection.provider === ChannelProvider.ZODOMUS ? readZodomusConnectionConfig(connection.credentials) : null;
      const priceModelId =
        providerSummary?.setup_status?.price_model_id ??
        (zodomusConnectionConfig ? this.defaultZodomusPriceModel(zodomusConnectionConfig.ota_key) : null);
      const activeRoomMappings = connection.roomMappings.filter((mapping) => mapping.isActivationEnabled);
      const activeRateMappings = connection.rateMappings.filter((mapping) => mapping.isActivationEnabled);
      const roomMappingByCategoryId = new Map(
        activeRoomMappings.map((mapping) => [mapping.roomCategoryId, mapping] as const),
      );
      const rates = await this.rateSyncPayloadService.buildDailyRateRows(
        connection.propertyId,
        activeRateMappings.map((mapping) => ({
          externalRoomId:
            mapping.externalRoomId ??
            roomMappingByCategoryId.get(mapping.ratePlan.roomCategoryId)?.externalRoomId ??
            this.missingRoomMappingForRate(mapping.ratePlan.code, mapping.ratePlan.roomCategory.code),
          externalRateId: mapping.externalRateId,
          ratePlanId: mapping.ratePlanId,
          ratePlanCode: mapping.ratePlan.code,
          roomCategoryId: mapping.ratePlan.roomCategoryId,
          roomCategoryCode: mapping.ratePlan.roomCategory.code,
          roomCategoryMaxOccupancy: mapping.ratePlan.roomCategory.maxOccupancy,
          pricingConfig: mapping.pricingConfig,
          ratePlan: {
            id: mapping.ratePlan.id,
            baseRate: mapping.ratePlan.baseRate,
            currency: mapping.ratePlan.currency,
          },
        })),
        {
          from: dto.from,
          to: dto.to,
        },
      );

      return {
        from: dto.from,
        to: dto.to,
        ...(priceModelId ? { price_model_id: priceModelId } : {}),
        rates,
      };
    }

    if (!dto.from || !dto.to) {
      throw new BadRequestException('Zodomus inventory sync requires both from and to dates.');
    }

    const inventory = await this.inventorySyncPayloadService.buildDailyInventoryRows(
      connection.propertyId,
      connection.roomMappings.filter((mapping) => mapping.isActivationEnabled),
      {
        from: dto.from,
        to: dto.to,
      },
    );

    return {
      from: dto.from,
      to: dto.to,
      inventory,
    };
  }

  private connectionInclude() {
    return {
      property: true,
      roomMappings: { include: { roomCategory: true }, orderBy: { createdAt: 'asc' } },
      rateMappings: {
        include: { ratePlan: { include: { roomCategory: true } } },
        orderBy: { createdAt: 'asc' },
      },
      syncLogs: { orderBy: { createdAt: 'desc' }, take: 12 },
    } satisfies Prisma.ChannelConnectionInclude;
  }

  private readObject(value: unknown) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, Prisma.JsonValue>)
      : {};
  }

  private isSuccessfulZodomusReservationCreate(payload: Prisma.InputJsonObject) {
    const response = this.readObject(payload.response);
    const status = this.readObject(response.status);
    const returnCode = status.returnCode;

    if (typeof returnCode === 'number' && Number.isFinite(returnCode)) {
      return returnCode === 200;
    }

    return typeof returnCode === 'string' && returnCode.trim() === '200';
  }

  private extractCreatedReservationId(payload: Prisma.InputJsonObject) {
    const directReservationId =
      this.readStringValue(payload.reservation_id) ??
      this.readStringValue(payload.reservationId);
    if (directReservationId) {
      return directReservationId;
    }

    const response = this.readObject(payload.response);
    const status = this.readObject(response.status);
    const returnMessage = this.readStringValue(status.returnMessage);
    if (!returnMessage) {
      return null;
    }

    const match = returnMessage.match(/reservationid\s*=\s*([A-Za-z0-9_-]+)/i);
    return match?.[1] ?? null;
  }

  private readStringValue(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
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
        rateMappings: { include: { ratePlan: { include: { roomCategory: true } } } };
        syncLogs: true;
      };
    }>,
  ) {
    const providerConfigSummary = this.readProviderConfigSummary(connection.provider, connection.credentials);

    return {
      id: connection.id,
      property_id: connection.propertyId,
      provider: connection.provider,
      name: connection.name,
      status: connection.status,
      external_hotel_id: connection.externalHotelId,
      provider_config_summary: providerConfigSummary,
      property: {
        id: connection.property.id,
        name: connection.property.name,
        code: connection.property.code,
      },
      room_mappings: connection.roomMappings.map((mapping) => this.toRoomMappingResponse(mapping)),
      rate_mappings: connection.rateMappings.map((mapping) => this.toRateMappingResponse(mapping)),
      recent_sync_logs: connection.syncLogs.map((log) => this.toSyncLogResponse(log)),
      sync_summary: this.buildSyncSummary(connection.syncLogs, providerConfigSummary),
      created_at: connection.createdAt,
      updated_at: connection.updatedAt,
    };
  }

  private readProviderConfigSummary(provider: ChannelProvider, credentials: Prisma.JsonValue | null) {
    const record =
      credentials && typeof credentials === 'object' && !Array.isArray(credentials)
        ? (credentials as Record<string, Prisma.JsonValue>)
        : {};

    if (provider === ChannelProvider.ZODOMUS) {
      const channelId = typeof record.channel_code === 'string' ? record.channel_code : null;
      const environment = typeof record.environment === 'string' ? record.environment : null;
      const otaName = typeof record.ota_name === 'string' ? record.ota_name : null;

      return {
        channel_id: channelId,
        ota_name: otaName,
        environment: environment ?? process.env.ZODOMUS_ENVIRONMENT?.trim() ?? null,
        setup_status: this.readZodomusSetupStatus(record),
        automation: this.readZodomusAutomationConfig(record),
      };
    }

    return null;
  }

  private defaultZodomusPriceModel(otaKey: ZodomusOtaKey) {
    if (otaKey === 'BOOKING_COM') return 1;
    if (otaKey === 'EXPEDIA') return 3;
    return 4;
  }

  private allowedZodomusPriceModels(otaKey: ZodomusOtaKey) {
    if (otaKey === 'BOOKING_COM') return [1, 2, 4, 5];
    if (otaKey === 'EXPEDIA') return [3, 4, 5];
    return [4];
  }

  private zodomusOtaLabel(otaKey: ZodomusOtaKey) {
    if (otaKey === 'BOOKING_COM') return 'Booking.com';
    if (otaKey === 'EXPEDIA') return 'Expedia';
    return 'Airbnb';
  }

  private assertValidZodomusPriceModel(otaKey: ZodomusOtaKey, priceModelId: number) {
    const allowedPriceModels = this.allowedZodomusPriceModels(otaKey);

    if (!allowedPriceModels.includes(priceModelId)) {
      throw new BadRequestException(
        `Price model ${priceModelId} is not supported for ${this.zodomusOtaLabel(otaKey)}. ` +
          `Allowed price models: ${allowedPriceModels.join(', ')}.`,
      );
    }
  }

  private defaultZodomusAutomationConfig() {
    const environment = process.env.ZODOMUS_ENVIRONMENT?.trim() ?? null;

    return {
      enabled: (process.env.ZODOMUS_AUTO_SYNC_ENABLED?.trim() ?? 'true') !== 'false',
      inventory_interval_minutes: this.normalizeZodomusIntervalMinutes(
        this.readPositiveInteger(process.env.ZODOMUS_AUTO_SYNC_INVENTORY_MINUTES, 15),
        'inventory',
        environment,
      ),
      rates_interval_minutes: this.normalizeZodomusIntervalMinutes(
        this.readPositiveInteger(process.env.ZODOMUS_AUTO_SYNC_RATES_MINUTES, 60),
        'rates',
        environment,
      ),
      bookings_interval_minutes: this.normalizeZodomusIntervalMinutes(
        this.readPositiveInteger(process.env.ZODOMUS_AUTO_SYNC_BOOKINGS_MINUTES, 5),
        'bookings',
        environment,
      ),
      sync_window_days: this.defaultZodomusSyncWindowDays(environment),
      full_sync_window_days: this.defaultZodomusFullSyncWindowDays(environment),
    };
  }

  private productionMinimumZodomusSyncWindowDays() {
    return this.readPositiveInteger(process.env.ZODOMUS_PRODUCTION_ROUTINE_SYNC_WINDOW_DAYS, 90);
  }

  private productionFullZodomusSyncWindowDays() {
    return this.readPositiveInteger(process.env.ZODOMUS_PRODUCTION_FULL_SYNC_WINDOW_DAYS, 365);
  }

  private sandboxMaximumZodomusSyncWindowDays() {
    return this.readPositiveInteger(process.env.ZODOMUS_SANDBOX_MAX_SYNC_WINDOW_DAYS, 7);
  }

  private defaultZodomusSyncWindowDays(environment?: string | null) {
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

  private defaultZodomusFullSyncWindowDays(environment?: string | null) {
    return this.normalizeZodomusFullSyncWindowDays(
      this.readPositiveInteger(
        process.env.ZODOMUS_FULL_SYNC_WINDOW_DAYS,
        environment === 'sandbox'
          ? this.sandboxMaximumZodomusSyncWindowDays()
          : this.productionFullZodomusSyncWindowDays(),
      ),
      environment,
    );
  }

  private defaultZodomusSetupStatus() {
    return {
      checked: false,
      activated: false,
      rooms_activated: false,
      catalog_loaded: false,
      ready: false,
      disconnected: false,
      checked_at: null,
      activated_at: null,
      rooms_activated_at: null,
      catalog_loaded_at: null,
      ready_at: null,
      disconnected_at: null,
      price_model_id: null,
      last_check_message: null,
      last_check_code: null,
      last_activation_message: null,
      last_activation_code: null,
      last_rooms_activation_message: null,
      last_rooms_activation_code: null,
      last_disconnect_message: null,
      last_disconnect_code: null,
      activated_room_count: 0,
      catalog_room_count: 0,
      catalog_rate_count: 0,
    };
  }

  private readZodomusSetupStatus(record: Record<string, Prisma.JsonValue>) {
    const setup = this.readNestedRecord(record.setup_status);
    const defaults = this.defaultZodomusSetupStatus();

    return {
      checked: this.readBoolean(setup.checked, defaults.checked),
      activated: this.readBoolean(setup.activated, defaults.activated),
      rooms_activated: this.readBoolean(setup.rooms_activated, defaults.rooms_activated),
      catalog_loaded: this.readBoolean(setup.catalog_loaded, defaults.catalog_loaded),
      ready: this.readBoolean(setup.ready, defaults.ready),
      disconnected: this.readBoolean(setup.disconnected, defaults.disconnected),
      checked_at: this.readOptionalString(setup.checked_at),
      activated_at: this.readOptionalString(setup.activated_at),
      rooms_activated_at: this.readOptionalString(setup.rooms_activated_at),
      catalog_loaded_at: this.readOptionalString(setup.catalog_loaded_at),
      ready_at: this.readOptionalString(setup.ready_at),
      disconnected_at: this.readOptionalString(setup.disconnected_at),
      price_model_id: this.readOptionalNumber(setup.price_model_id),
      last_check_message: this.readOptionalString(setup.last_check_message),
      last_check_code: this.readOptionalStringOrNumber(setup.last_check_code),
      last_activation_message: this.readOptionalString(setup.last_activation_message),
      last_activation_code: this.readOptionalStringOrNumber(setup.last_activation_code),
      last_rooms_activation_message: this.readOptionalString(setup.last_rooms_activation_message),
      last_rooms_activation_code: this.readOptionalStringOrNumber(setup.last_rooms_activation_code),
      last_disconnect_message: this.readOptionalString(setup.last_disconnect_message),
      last_disconnect_code: this.readOptionalStringOrNumber(setup.last_disconnect_code),
      activated_room_count: this.readNumber(setup.activated_room_count, defaults.activated_room_count),
      catalog_room_count: this.readNumber(setup.catalog_room_count, defaults.catalog_room_count),
      catalog_rate_count: this.readNumber(setup.catalog_rate_count, defaults.catalog_rate_count),
    };
  }

  private buildSyncSummary(
    syncLogs: Array<{
      syncType: ChannelSyncType;
      status: ChannelSyncStatus;
      createdAt: Date;
      errorMessage: string | null;
    }>,
    providerConfigSummary: ReturnType<ChannelService['readProviderConfigSummary']>,
  ) {
    return {
      inventory: this.syncStateFor(
        syncLogs,
        ChannelSyncType.INVENTORY,
        providerConfigSummary?.automation?.inventory_interval_minutes ?? null,
      ),
      rates: this.syncStateFor(
        syncLogs,
        ChannelSyncType.RATES,
        providerConfigSummary?.automation?.rates_interval_minutes ?? null,
      ),
      bookings: this.syncStateFor(
        syncLogs,
        ChannelSyncType.BOOKINGS,
        providerConfigSummary?.automation?.bookings_interval_minutes ?? null,
      ),
    };
  }

  private syncStateFor(
    syncLogs: Array<{
      syncType: ChannelSyncType;
      status: ChannelSyncStatus;
      createdAt: Date;
      errorMessage: string | null;
    }>,
    syncType: ChannelSyncType,
    intervalMinutes: number | null,
  ) {
    const latest = syncLogs.find((log) => log.syncType === syncType);
    const nextDueAt =
      latest && intervalMinutes && intervalMinutes > 0
        ? new Date(latest.createdAt.getTime() + intervalMinutes * 60_000).toISOString()
        : null;

    return {
      last_status: latest?.status ?? null,
      last_synced_at: latest?.createdAt.toISOString() ?? null,
      last_error: latest?.errorMessage ?? null,
      next_due_at: nextDueAt,
    };
  }

  private readZodomusAutomationConfig(record: Record<string, Prisma.JsonValue>) {
    const automation = this.readNestedRecord(record.automation);
    const defaults = this.defaultZodomusAutomationConfig();
    const environment =
      this.readOptionalString(record.environment) ?? process.env.ZODOMUS_ENVIRONMENT?.trim() ?? null;
    const syncWindowDays = this.normalizeZodomusSyncWindowDays(
      this.readNumber(automation.sync_window_days, defaults.sync_window_days),
      environment,
    );
    const fullSyncWindowDays = this.normalizeZodomusFullSyncWindowDays(
      this.readNumber(automation.full_sync_window_days, defaults.full_sync_window_days),
      environment,
    );

    return {
      enabled: this.readBoolean(automation.enabled, defaults.enabled),
      inventory_interval_minutes: this.normalizeZodomusIntervalMinutes(
        this.readNumber(automation.inventory_interval_minutes, defaults.inventory_interval_minutes),
        'inventory',
        environment,
      ),
      rates_interval_minutes: this.normalizeZodomusIntervalMinutes(
        this.readNumber(automation.rates_interval_minutes, defaults.rates_interval_minutes),
        'rates',
        environment,
      ),
      bookings_interval_minutes: this.normalizeZodomusIntervalMinutes(
        this.readNumber(automation.bookings_interval_minutes, defaults.bookings_interval_minutes),
        'bookings',
        environment,
      ),
      sync_window_days: syncWindowDays,
      full_sync_window_days: fullSyncWindowDays,
    };
  }

  private normalizeZodomusIntervalMinutes(
    value: number,
    syncType: 'inventory' | 'rates' | 'bookings',
    environment?: string | null,
  ) {
    const normalized = Math.max(value, 0);
    if (environment !== 'sandbox') {
      return normalized;
    }

    if (syncType === 'inventory') {
      return Math.max(normalized, this.readPositiveInteger(process.env.ZODOMUS_SANDBOX_MIN_INVENTORY_SYNC_MINUTES, 60));
    }

    if (syncType === 'rates') {
      return Math.max(normalized, this.readPositiveInteger(process.env.ZODOMUS_SANDBOX_MIN_RATES_SYNC_MINUTES, 180));
    }

    return Math.max(normalized, this.readPositiveInteger(process.env.ZODOMUS_SANDBOX_MIN_BOOKINGS_SYNC_MINUTES, 15));
  }

  private normalizeZodomusSyncWindowDays(value: number, environment?: string | null) {
    const normalized = Math.max(value, 1);
    if (environment === 'sandbox') {
      return Math.min(normalized, this.sandboxMaximumZodomusSyncWindowDays());
    }

    return normalized;
  }

  private normalizeZodomusFullSyncWindowDays(value: number, environment?: string | null) {
    const normalized = Math.max(value, 1);
    if (environment === 'sandbox') {
      return Math.min(normalized, this.sandboxMaximumZodomusSyncWindowDays());
    }

    return Math.max(normalized, this.productionFullZodomusSyncWindowDays());
  }

  private isZodomusSyncInCooldown(
    syncLogs: Array<{
      createdAt: Date;
      errorMessage: string | null;
    }>,
    environment?: string | null,
  ) {
    const latestFailure = syncLogs.find((log) => log.errorMessage);
    if (!latestFailure?.errorMessage) {
      return false;
    }

    const cooldownMs = this.zodomusCooldownMs(latestFailure.errorMessage, environment);
    if (cooldownMs <= 0) {
      return false;
    }

    return Date.now() - latestFailure.createdAt.getTime() < cooldownMs;
  }

  private zodomusCooldownMs(message: string, environment?: string | null) {
    const normalized = message.toLowerCase();

    if (
      normalized.includes('status 401') ||
      normalized.includes('status 403') ||
      normalized.includes('suspend')
    ) {
      const minutes = environment === 'sandbox'
        ? this.readPositiveInteger(process.env.ZODOMUS_SANDBOX_AUTH_BACKOFF_MINUTES, 180)
        : this.readPositiveInteger(process.env.ZODOMUS_AUTH_BACKOFF_MINUTES, 60);
      return minutes * 60_000;
    }

    if (
      normalized.includes('status 429') ||
      normalized.includes('too many requests') ||
      normalized.includes('rate limit')
    ) {
      const minutes = environment === 'sandbox'
        ? this.readPositiveInteger(process.env.ZODOMUS_SANDBOX_RATE_LIMIT_BACKOFF_MINUTES, 60)
        : this.readPositiveInteger(process.env.ZODOMUS_RATE_LIMIT_BACKOFF_MINUTES, 30);
      return minutes * 60_000;
    }

    return 0;
  }

  private async updateZodomusConnectionConfig(
    connectionId: string,
    existingCredentials: Prisma.JsonValue | null,
    patch: Record<string, unknown>,
  ) {
    const existing = this.readPlainRecord(existingCredentials);
    const setupPatch = this.readUnknownRecord(patch.setup_status);
    const automationPatch = this.readUnknownRecord(patch.automation);
    const nextCredentials = {
      ...existing,
      ...patch,
      ...(Object.keys(setupPatch).length > 0
        ? {
            setup_status: {
              ...this.readUnknownRecord(existing.setup_status),
              ...setupPatch,
            },
          }
        : {}),
      ...(Object.keys(automationPatch).length > 0
        ? {
            automation: {
              ...this.readUnknownRecord(existing.automation),
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

  private async buildZodomusRoomsActivationPayload(
    connection: Prisma.ChannelConnectionGetPayload<{
      include: {
        roomMappings: { include: { roomCategory: true } };
        rateMappings: { include: { ratePlan: true } };
      };
    }>,
  ) {
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

    const rooms = await Promise.all(
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

    if (rooms.length === 0) {
      throw new BadRequestException('Enable at least one room/rate pair before Zodomus room activation.');
    }

    return rooms;
  }

  private isZodomusReadyCheckResponse(response: unknown) {
    const wrapper = this.readUnknownRecord(response);
    const rawResponse = this.readUnknownRecord(wrapper.response);
    const status = this.readUnknownRecord(rawResponse.status);
    const returnCode = this.readUnknownRecord({ value: status.returnCode }).value;
    const returnMessage = this.readUnknownRecord(status.returnMessage);

    const propertyStatus = this.readLooseStatusValue(returnMessage['Property status']);
    const channelStatus = this.readLooseStatusValue(returnMessage['Channel status']);
    const productStatus = this.readLooseStatusValue(returnMessage['Product status']);
    const roomStatus = this.readLooseStatusValue(returnMessage['Room status']);

    return (
      (returnCode === 200 || returnCode === '200') &&
      propertyStatus === 'active' &&
      channelStatus === 'ok' &&
      productStatus === 'ok' &&
      roomStatus === 'ok'
    );
  }

  private readLooseStatusValue(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null;
  }

  private readPositiveInteger(value: string | undefined, fallback: number) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
  }

  private readPlainRecord(value: Prisma.JsonValue | null) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private readUnknownRecord(value: unknown) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private readNestedRecord(value: Prisma.JsonValue | undefined) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, Prisma.JsonValue>)
      : {};
  }

  private readBoolean(value: Prisma.JsonValue | undefined, fallback: boolean) {
    return typeof value === 'boolean' ? value : fallback;
  }

  private readNumber(value: Prisma.JsonValue | undefined, fallback: number) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  private readOptionalNumber(value: Prisma.JsonValue | undefined) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private readOptionalString(value: Prisma.JsonValue | undefined) {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private readOptionalStringOrNumber(value: Prisma.JsonValue | undefined) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value.toString();
    }

    return null;
  }

  private missingRoomMappingForRate(ratePlanCode: string, roomCategoryCode: string): never {
    throw new BadRequestException(
      `Rate sync cannot continue because rate plan ${ratePlanCode} belongs to room category ${roomCategoryCode}, and that room category is not mapped for this channel connection.`,
    );
  }

  private assertDistinctRoomMappingInputs(
    roomMappings: Array<{
      room_category_id: string;
      external_room_id: string;
    }>,
  ) {
    const categoryIds = new Set<string>();
    const externalRoomIds = new Set<string>();

    for (const mapping of roomMappings) {
      if (categoryIds.has(mapping.room_category_id)) {
        throw new BadRequestException('Duplicate HMS room category found in room mappings batch');
      }

      if (externalRoomIds.has(mapping.external_room_id)) {
        throw new BadRequestException('Duplicate provider room ID found in room mappings batch');
      }

      categoryIds.add(mapping.room_category_id);
      externalRoomIds.add(mapping.external_room_id);
    }
  }

  private normalizePricingConfig(value: unknown): Prisma.InputJsonValue | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }

    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('pricing_config must be a JSON object');
    }

    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }

  private assertDistinctRateMappingInputs(
    rateMappings: Array<{
      rate_plan_id: string;
      external_room_id?: string;
      external_rate_id: string;
    }>,
  ) {
    const ratePlanIds = new Set<string>();
    const providerPairs = new Set<string>();

    for (const mapping of rateMappings) {
      if (ratePlanIds.has(mapping.rate_plan_id)) {
        throw new BadRequestException('Duplicate HMS rate plan found in rate mappings batch');
      }

      const providerKey = `${mapping.external_room_id ?? ''}::${mapping.external_rate_id}`;
      if (providerPairs.has(providerKey)) {
        throw new BadRequestException('Duplicate provider room/rate pair found in rate mappings batch');
      }

      ratePlanIds.add(mapping.rate_plan_id);
      providerPairs.add(providerKey);
    }
  }

  private toRoomMappingResponse(mapping: Prisma.ChannelRoomMappingGetPayload<{ include: { roomCategory: true } }>) {
    return {
      id: mapping.id,
      channel_connection_id: mapping.channelConnectionId,
      room_category_id: mapping.roomCategoryId,
      external_room_id: mapping.externalRoomId,
      external_room_name: mapping.externalRoomName,
      is_activation_enabled: mapping.isActivationEnabled,
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
      external_room_id: mapping.externalRoomId,
      external_rate_id: mapping.externalRateId,
      external_rate_name: mapping.externalRateName,
      is_activation_enabled: mapping.isActivationEnabled,
      pricing_config: mapping.pricingConfig,
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

  private emptyInventoryReconciliation(
    status: InventoryReconciliationStatus,
    message: string,
    latestSyncLog?: {
      id: string;
      createdAt: Date;
    } | null,
  ) {
    return {
      status,
      message,
      latest_sync_log_id: latestSyncLog?.id ?? null,
      latest_synced_at: latestSyncLog?.createdAt.toISOString() ?? null,
      compared_window: null,
      trigger: null,
      summary: {
        snapshot_row_count: 0,
        current_row_count: 0,
        compared_row_count: 0,
        unchanged_rows: 0,
        drifted_rows: 0,
        snapshot_only_rows: 0,
        current_only_rows: 0,
        total_available_delta: 0,
      },
      drift_rows: [],
    };
  }

  private readInventorySnapshot(requestPayload: Prisma.JsonValue | null) {
    const payload = this.readObject(requestPayload);
    const rows = Array.isArray(payload.inventory)
      ? payload.inventory
          .map((value) => this.readInventorySnapshotRow(value))
          .filter((row): row is InventorySnapshotRow => row !== null)
      : [];

    const explicitFrom = typeof payload.from === 'string' && payload.from.trim() ? payload.from.trim() : null;
    const explicitTo = typeof payload.to === 'string' && payload.to.trim() ? payload.to.trim() : null;
    const derivedDates = rows.map((row) => row.date).sort((left, right) => left.localeCompare(right));
    const window =
      explicitFrom && explicitTo
        ? { from: explicitFrom, to: explicitTo }
        : derivedDates.length > 0
          ? { from: derivedDates[0], to: derivedDates[derivedDates.length - 1] }
          : null;

    return {
      rows,
      window,
      trigger: typeof payload.trigger === 'string' && payload.trigger.trim() ? payload.trigger.trim() : null,
    };
  }

  private readInventorySnapshotRow(value: Prisma.JsonValue) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const row = value as Record<string, Prisma.JsonValue>;
    const date = this.readOptionalString(row.date);
    const externalRoomId = this.readOptionalString(row.external_room_id);

    if (!date || !externalRoomId) {
      return null;
    }

    return {
      date,
      external_room_id: externalRoomId,
      room_category_id: this.readOptionalString(row.room_category_id),
      room_category_code: this.readOptionalString(row.room_category_code),
      total_inventory: this.readNumber(row.total_inventory, 0),
      out_of_service: this.readNumber(row.out_of_service, 0),
      booked: this.readNumber(row.booked, 0),
      available: this.readNumber(row.available, 0),
    } satisfies InventorySnapshotRow;
  }

  private compareInventorySnapshots(input: {
    snapshotRows: InventorySnapshotRow[];
    currentRows: InventorySnapshotRow[];
    latestSyncLog: { id: string; createdAt: Date };
    window: { from: string; to: string };
    trigger: string | null;
  }) {
    const snapshotByKey = new Map(input.snapshotRows.map((row) => [this.inventoryRowKey(row), row] as const));
    const currentByKey = new Map(input.currentRows.map((row) => [this.inventoryRowKey(row), row] as const));
    const keys = Array.from(new Set([...snapshotByKey.keys(), ...currentByKey.keys()])).sort((left, right) =>
      left.localeCompare(right),
    );

    let unchangedRows = 0;
    let driftedRows = 0;
    let snapshotOnlyRows = 0;
    let currentOnlyRows = 0;
    let totalAvailableDelta = 0;

    const driftRows = keys.flatMap((key) => {
      const snapshotRow = snapshotByKey.get(key) ?? null;
      const currentRow = currentByKey.get(key) ?? null;

      if (snapshotRow && currentRow) {
        const availableDelta = currentRow.available - snapshotRow.available;
        totalAvailableDelta += availableDelta;

        if (this.inventoryRowsEqual(snapshotRow, currentRow)) {
          unchangedRows += 1;
          return [];
        }

        driftedRows += 1;
        return [
          this.toInventoryReconciliationRow('DRIFTED', snapshotRow, currentRow),
        ];
      }

      if (snapshotRow) {
        snapshotOnlyRows += 1;
        totalAvailableDelta -= snapshotRow.available;
        return [this.toInventoryReconciliationRow('SNAPSHOT_ONLY', snapshotRow, null)];
      }

      currentOnlyRows += 1;
      totalAvailableDelta += currentRow?.available ?? 0;
      return [this.toInventoryReconciliationRow('CURRENT_ONLY', null, currentRow ?? null)];
    });

    return {
      status: driftRows.length > 0 ? ('DRIFT_DETECTED' as const) : ('IN_SYNC' as const),
      message:
        driftRows.length > 0
          ? 'HMS inventory has drifted from the latest successful provider snapshot.'
          : 'HMS inventory matches the latest successful provider snapshot.',
      latest_sync_log_id: input.latestSyncLog.id,
      latest_synced_at: input.latestSyncLog.createdAt.toISOString(),
      compared_window: input.window,
      trigger: input.trigger,
      summary: {
        snapshot_row_count: input.snapshotRows.length,
        current_row_count: input.currentRows.length,
        compared_row_count: keys.length,
        unchanged_rows: unchangedRows,
        drifted_rows: driftedRows,
        snapshot_only_rows: snapshotOnlyRows,
        current_only_rows: currentOnlyRows,
        total_available_delta: totalAvailableDelta,
      },
      drift_rows: driftRows,
    };
  }

  private inventoryRowKey(row: InventorySnapshotRow) {
    return `${row.date}::${row.external_room_id}`;
  }

  private inventoryRowsEqual(left: InventorySnapshotRow, right: InventorySnapshotRow) {
    return (
      left.date === right.date &&
      left.external_room_id === right.external_room_id &&
      left.room_category_id === right.room_category_id &&
      left.room_category_code === right.room_category_code &&
      left.total_inventory === right.total_inventory &&
      left.out_of_service === right.out_of_service &&
      left.booked === right.booked &&
      left.available === right.available
    );
  }

  private toInventoryReconciliationRow(
    status: InventoryReconciliationRowStatus,
    snapshotRow: InventorySnapshotRow | null,
    currentRow: InventorySnapshotRow | null,
  ) {
    const baseline = snapshotRow
      ? {
          total_inventory: snapshotRow.total_inventory,
          out_of_service: snapshotRow.out_of_service,
          booked: snapshotRow.booked,
          available: snapshotRow.available,
        }
      : null;
    const current = currentRow
      ? {
          total_inventory: currentRow.total_inventory,
          out_of_service: currentRow.out_of_service,
          booked: currentRow.booked,
          available: currentRow.available,
        }
      : null;

    return {
      status,
      date: snapshotRow?.date ?? currentRow?.date ?? '',
      external_room_id: snapshotRow?.external_room_id ?? currentRow?.external_room_id ?? '',
      room_category_id: currentRow?.room_category_id ?? snapshotRow?.room_category_id ?? null,
      room_category_code: currentRow?.room_category_code ?? snapshotRow?.room_category_code ?? null,
      last_pushed: baseline,
      current_expected: current,
      delta:
        baseline && current
          ? {
              total_inventory: current.total_inventory - baseline.total_inventory,
              out_of_service: current.out_of_service - baseline.out_of_service,
              booked: current.booked - baseline.booked,
              available: current.available - baseline.available,
            }
          : null,
    };
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
      ? payload.row_results.reduce<InventorySyncRowResult[]>((rows, value) => {
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
    rowResults: InventorySyncRowResult[],
    syncLogId: string,
  ) {
    const deduped = new Map<string, InventorySyncRowResult>();
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
        `Deduplicated ${duplicateCount} duplicate inventory row result(s) before persisting sync log ${syncLogId}.`,
      );
    }

    return [...deduped.values()];
  }

  private extractFailedInventoryRows(
    responsePayload: Prisma.JsonValue | null,
    requestPayload: Prisma.JsonValue | null,
  ) {
    const response = this.readObject(responsePayload);
    const rowResults = Array.isArray(response.row_results) ? response.row_results : [];
    const failedRowKeys = new Set(
      rowResults.flatMap((value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          return [];
        }

        const row = value as Record<string, Prisma.JsonValue>;
        const status = this.readOptionalString(row.status);
        const date = this.readOptionalString(row.date);
        const externalRoomId = this.readOptionalString(row.external_room_id);
        if (status !== 'FAILED' || !date || !externalRoomId) {
          return [];
        }

        return [`${date}::${externalRoomId}`];
      }),
    );

    const request = this.readObject(requestPayload);
    const inventoryRows = Array.isArray(request.inventory) ? request.inventory : [];

    return inventoryRows.flatMap((value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return [];
      }

      const row = value as Record<string, Prisma.JsonValue>;
      const date = this.readOptionalString(row.date);
      const externalRoomId = this.readOptionalString(row.external_room_id);
      if (!date || !externalRoomId || !failedRowKeys.has(`${date}::${externalRoomId}`)) {
        return [];
      }

      return [
        {
          date,
          external_room_id: externalRoomId,
          room_category_id: this.readOptionalString(row.room_category_id),
          room_category_code: this.readOptionalString(row.room_category_code),
          total_inventory: this.readNumber(row.total_inventory, 0),
          out_of_service: this.readNumber(row.out_of_service, 0),
          booked: this.readNumber(row.booked, 0),
          available: this.readNumber(row.available, 0),
        } satisfies Prisma.InputJsonObject,
      ];
    });
  }

  private readInventorySyncRowResult(value: Prisma.JsonValue) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return null;
    }

    const row = value as Record<string, Prisma.JsonValue>;
    const date = this.readOptionalString(row.date);
    const externalRoomId = this.readOptionalString(row.external_room_id);
    const status = this.readOptionalString(row.status);
    if (!date || !externalRoomId || (status !== 'SUCCEEDED' && status !== 'FAILED')) {
      return null;
    }

    return {
      date,
      external_room_id: externalRoomId,
      available: this.readNumber(row.available, 0),
      status,
      error_message: this.readOptionalString(row.error_message),
      provider_response: row.provider_response ?? null,
    } satisfies InventorySyncRowResult;
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

      const status = this.readOptionalString((value as Record<string, Prisma.JsonValue>).status);
      return status === 'FAILED' ? count + 1 : count;
    }, 0);
    const succeededRowsFromResults = rowResults.reduce<number>((count, value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return count;
      }

      const status = this.readOptionalString((value as Record<string, Prisma.JsonValue>).status);
      return status === 'SUCCEEDED' ? count + 1 : count;
    }, 0);

    const failedRows =
      this.readCount(summary.failed_rows) ??
      (rowResults.length > 0 ? failedRowsFromResults : null);
    const succeededRows =
      this.readCount(summary.succeeded_rows) ??
      (rowResults.length > 0 ? succeededRowsFromResults : null);

    if ((failedRows ?? 0) > 0) {
      return {
        status: (succeededRows ?? 0) > 0 ? ('PARTIAL_FAILED' as ChannelSyncStatus) : ChannelSyncStatus.FAILED,
        errorMessage:
          syncType === ChannelSyncType.RATES
            ? `${failedRows} rate row(s) failed while ${succeededRows ?? 0} succeeded.`
            : `${failedRows} inventory row(s) failed while ${succeededRows ?? 0} succeeded.`,
      };
    }

    if ((succeededRows ?? 0) > 0) {
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
    const queueReturnMessage = this.readOptionalString(queueStatus.returnMessage);
    const reservationSummary = this.readNestedRecord(payload.reservation_summary);
    const summaryStatus = this.readNestedRecord(reservationSummary.status);
    const summaryReturnCode = this.readOptionalStringOrNumber(summaryStatus.returnCode);
    const summaryReturnMessage = this.readOptionalString(summaryStatus.returnMessage);

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
      this.readCount(importSummary.failed) ?? 0,
      this.readStringArray(importSummary.errors).length,
    );
    const completedImports =
      (this.readCount(importSummary.created) ?? 0) +
      (this.readCount(importSummary.updated) ?? 0) +
      (this.readCount(importSummary.cancelled) ?? 0) +
      (this.readCount(importSummary.skipped) ?? 0);

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

      return this.readOptionalString((entry as Record<string, Prisma.JsonValue>).error) ? count + 1 : count;
    }, 0);
  }

  private readCount(value: Prisma.JsonValue | undefined): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value.trim());
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  private readStringArray(value: Prisma.JsonValue | undefined) {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  }
}
