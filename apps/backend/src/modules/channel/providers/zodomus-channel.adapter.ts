import { BadRequestException } from '@nestjs/common';
import { ChannelSyncType, Prisma } from '@prisma/client';
import type {
  ChannelCatalogPayload,
  ChannelConnectionValidationPayload,
  ChannelPropertyActionPayload,
  ChannelReservationActionPayload,
  ChannelPayload,
} from '../channel-provider.service';
import { ZodomusClient } from './zodomus-client';
import { readZodomusAppCredentials, readZodomusConnectionConfig } from './zodomus.types';

export class ZodomusChannelAdapter {
  async validateConnection(payload: ChannelConnectionValidationPayload): Promise<Prisma.InputJsonObject> {
    const appCredentials = readZodomusAppCredentials();
    const connectionConfig = readZodomusConnectionConfig(payload.credentials);
    const client = new ZodomusClient(appCredentials);
    const account = await client.getAccount();
    const channelsResult = await this.tryGetChannels(client);

    return {
      provider: payload.provider,
      accepted: true,
      environment: appCredentials.environment,
      channel_code: connectionConfig.channel_code,
      ota_name: connectionConfig.ota_name,
      account: this.asJsonValue(account),
      channels: this.asJsonValue(channelsResult.channels),
      warnings: this.asJsonValue(channelsResult.warnings),
    };
  }

  async push(payload: ChannelPayload): Promise<Prisma.InputJsonObject> {
    const appCredentials = readZodomusAppCredentials();
    const connectionConfig = readZodomusConnectionConfig(payload.credentials);
    const client = new ZodomusClient(appCredentials);

    if (payload.sync_type === ChannelSyncType.INVENTORY) {
      this.requireExternalHotelId(payload.external_hotel_id, payload.sync_type);
      const inventoryRows = this.readPayloadArray(payload.inventory, 'inventory sync');
      const inventorySegments = this.batchInventoryRows(inventoryRows);
      const rowResults = await this.mapWithConcurrency(
        inventorySegments,
        this.readSyncConcurrency(),
        async (segment) => {
          const response = await client
            .pushAvailability({
              channelId: Number(connectionConfig.channel_code),
              propertyId: payload.external_hotel_id,
              roomId: segment.external_room_id,
              dateFrom: segment.date_from,
              dateTo: segment.date_to,
              availability: segment.available,
              stopSell: segment.stop_sell ? 1 : 0,
              closedToArrival: segment.closed_to_arrival ? 1 : 0,
              closedToDeparture: segment.closed_to_departure ? 1 : 0,
            })
            .then((providerResponse) => {
              const providerError = this.readProviderFailure(providerResponse);

              return segment.rows.map((row) =>
                providerError
                  ? {
                      date: row.date,
                      external_room_id: segment.external_room_id,
                      available: segment.available,
                      status: 'FAILED' as const,
                      error_message: providerError,
                      provider_response: providerResponse,
                    }
                  : {
                      date: row.date,
                      external_room_id: segment.external_room_id,
                      available: segment.available,
                      status: 'SUCCEEDED' as const,
                      provider_response: providerResponse,
                    },
              );
            })
            .catch((error: unknown) =>
              segment.rows.map((row) => ({
                date: row.date,
                external_room_id: segment.external_room_id,
                available: segment.available,
                status: 'FAILED' as const,
                error_message: this.readErrorMessage(error),
              })),
            );

          return response;
        },
      );
      const flattenedRowResults = rowResults.flat();
      const succeededRows = flattenedRowResults.filter((result) => result.status === 'SUCCEEDED');
      const failedRows = flattenedRowResults.filter((result) => result.status === 'FAILED');

      return {
        provider: payload.provider,
        sync_type: payload.sync_type,
        environment: appCredentials.environment,
        external_hotel_id: payload.external_hotel_id,
        ota_name: connectionConfig.ota_name,
        date_from: payload.from ?? null,
        date_to: payload.to ?? null,
        room_count: inventoryRows.length,
        row_results: this.asJsonValue(flattenedRowResults),
        response: this.asJsonValue(
          succeededRows.flatMap((result) => ('provider_response' in result ? [result.provider_response] : [])),
        ),
        summary: {
          total_rows: flattenedRowResults.length,
          succeeded_rows: succeededRows.length,
          failed_rows: failedRows.length,
        },
      };
    }

    if (payload.sync_type === ChannelSyncType.RATES) {
      this.requireExternalHotelId(payload.external_hotel_id, payload.sync_type);
      const propertyId = payload.external_hotel_id!;
      const rateRows = this.readPayloadArray(payload.rates, 'rate sync');
      const rateSegments = this.batchRateRows(rateRows);
      const priceModelId = this.readPriceModelId(payload.price_model_id);
      const rowResults = await this.mapWithConcurrency(
        rateSegments,
        this.readSyncConcurrency(),
        async (segment) => {
          const endpoint = this.rateEndpointForPriceModel(priceModelId);
          return this.pushRateSegment(client, {
            endpoint,
            channelId: Number(connectionConfig.channel_code),
            propertyId,
            segment,
          })
            .then((providerResponse) => {
              const providerError = this.readProviderFailure(providerResponse);

              return segment.rows.map((row) =>
                providerError
                  ? {
                      date: row.date,
                      external_room_id: segment.external_room_id,
                      external_rate_id: segment.external_rate_id,
                      base_rate: segment.base_rate,
                      endpoint,
                      status: 'FAILED' as const,
                      error_message: providerError,
                      provider_response: providerResponse,
                    }
                  : {
                      date: row.date,
                      external_room_id: segment.external_room_id,
                      external_rate_id: segment.external_rate_id,
                      base_rate: segment.base_rate,
                      endpoint,
                      status: 'SUCCEEDED' as const,
                      provider_response: providerResponse,
                    },
              );
            })
            .catch((error: unknown) =>
              segment.rows.map((row) => ({
                date: row.date,
                external_room_id: segment.external_room_id,
                external_rate_id: segment.external_rate_id,
                base_rate: segment.base_rate,
                endpoint,
                status: 'FAILED' as const,
                error_message: this.readErrorMessage(error),
              })),
            );
        },
      );
      const flattenedRowResults = rowResults.flat();
      const succeededRows = flattenedRowResults.filter((result) => result.status === 'SUCCEEDED');
      const failedRows = flattenedRowResults.filter((result) => result.status === 'FAILED');

      return {
        provider: payload.provider,
        sync_type: payload.sync_type,
        environment: appCredentials.environment,
        external_hotel_id: payload.external_hotel_id,
        ota_name: connectionConfig.ota_name,
        price_model_id: priceModelId,
        date_from: payload.from ?? null,
        date_to: payload.to ?? null,
        rate_count: rateRows.length,
        row_results: this.asJsonValue(flattenedRowResults),
        response: this.asJsonValue(
          succeededRows.flatMap((result) => ('provider_response' in result ? [result.provider_response] : [])),
        ),
        summary: {
          total_rows: flattenedRowResults.length,
          succeeded_rows: succeededRows.length,
          failed_rows: failedRows.length,
        },
      };
    }

    if (payload.sync_type === ChannelSyncType.BOOKINGS) {
      const propertyId = this.requiredPropertyId(payload.external_hotel_id, 'reservation sync');
      const targetedReservationImport = this.readWebhookTriggeredReservationImport(payload.reservation_import);
      const reservationImportMode = this.readReservationImportMode(payload.reservation_import);
      if (targetedReservationImport) {
        const targetedReservations = await Promise.all(
          targetedReservationImport.reservationIds.map((reservationId) =>
            this.tryFetchReservationDetailById(
              client,
              connectionConfig.channel_code,
              propertyId,
              reservationId,
            ),
          ),
        );
        const usableTargetedReservations = targetedReservations
          .map((result) => result.reservation)
          .filter((reservation): reservation is unknown => reservation !== null);

        if (usableTargetedReservations.length > 0) {
          return {
            provider: payload.provider,
            sync_type: payload.sync_type,
            environment: appCredentials.environment,
            ota_name: connectionConfig.ota_name,
            reservation_queue: null,
            reservation_summary: null,
            reservations: this.asJsonValue(usableTargetedReservations),
            reservation_import: this.asJsonValue({
              mode: targetedReservationImport.mode,
              strategy: 'targeted_reservation_fetch',
              reservation_id: targetedReservationImport.reservationIds[0] ?? null,
              reservation_ids: targetedReservationImport.reservationIds,
            }),
            message: 'Zodomus webhook-triggered reservation import fetched the targeted reservation directly.',
          };
        }
      }

      if (reservationImportMode === 'summary_backfill') {
        const reservationSummary = await client.getReservationsSummary({
          channelId: connectionConfig.channel_code,
          propertyId,
        });
        const reservations = await this.fetchReservationDetails(
          client,
          reservationSummary,
          connectionConfig.channel_code,
          propertyId,
        );

        return {
          provider: payload.provider,
          sync_type: payload.sync_type,
          environment: appCredentials.environment,
          ota_name: connectionConfig.ota_name,
          reservation_queue: null,
          reservation_summary: this.asJsonValue(reservationSummary),
          reservations: this.asJsonValue(reservations),
          reservation_import: this.asJsonValue({
            mode: 'summary_backfill',
            strategy: 'summary_backfill_reconciliation',
            reservation_id: null,
          }),
          message: 'Zodomus reservation summary fetched for one-time future reservation backfill.',
        };
      }

      const reservationQueue = await client.pullReservationQueue({
        channelId: connectionConfig.channel_code,
        propertyId,
      });
      const reservations = await this.fetchReservationDetails(
        client,
        reservationQueue,
        connectionConfig.channel_code,
        propertyId,
      );

      return {
        provider: payload.provider,
        sync_type: payload.sync_type,
        environment: appCredentials.environment,
        ota_name: connectionConfig.ota_name,
        reservation_queue: this.asJsonValue(reservationQueue),
        reservation_summary: null,
        reservations: this.asJsonValue(reservations),
        reservation_import: this.asJsonValue({
          mode: targetedReservationImport?.mode ?? 'reservation_queue_poll',
          strategy: 'reservation_queue_reconciliation',
          reservation_id: targetedReservationImport?.reservationIds[0] ?? null,
          reservation_ids: targetedReservationImport?.reservationIds ?? [],
        }),
        message: 'Zodomus reservation queue fetched and prepared for local booking import.',
      };
    }

    throw new BadRequestException(`Unsupported Zodomus sync type: ${payload.sync_type}`);
  }

  async fetchCatalog(payload: ChannelCatalogPayload): Promise<Prisma.InputJsonObject> {
    const appCredentials = readZodomusAppCredentials();
    const connectionConfig = readZodomusConnectionConfig(payload.credentials);
    if (!payload.external_hotel_id) {
      throw new BadRequestException('Zodomus catalog lookup requires external_hotel_id on the channel connection.');
    }

    const client = new ZodomusClient(appCredentials);
    const rawPayload = await client.getRoomRates({
      propertyId: payload.external_hotel_id,
      channelId: connectionConfig.channel_code,
    });

    const rooms = this.extractRooms(rawPayload);
    const rates = this.extractRates(rawPayload);

    return {
      provider: payload.provider,
      external_hotel_id: payload.external_hotel_id,
      ota_name: connectionConfig.ota_name,
      rooms: this.asJsonValue(rooms),
      rates: this.asJsonValue(rates),
      raw_payload: this.asJsonValue(rawPayload),
    };
  }

  async getAccount(payload: ChannelConnectionValidationPayload): Promise<Prisma.InputJsonObject> {
    const appCredentials = readZodomusAppCredentials();
    const client = new ZodomusClient(appCredentials);
    return {
      provider: payload.provider,
      environment: appCredentials.environment,
      response: this.asJsonValue(await client.getAccount()),
    };
  }

  async getChannels(payload: ChannelConnectionValidationPayload): Promise<Prisma.InputJsonObject> {
    const appCredentials = readZodomusAppCredentials();
    const client = new ZodomusClient(appCredentials);
    return {
      provider: payload.provider,
      environment: appCredentials.environment,
      response: this.asJsonValue(await client.getChannels()),
    };
  }

  async getCurrencies(payload: ChannelConnectionValidationPayload): Promise<Prisma.InputJsonObject> {
    const appCredentials = readZodomusAppCredentials();
    const client = new ZodomusClient(appCredentials);
    return {
      provider: payload.provider,
      environment: appCredentials.environment,
      response: this.asJsonValue(await client.getCurrencies()),
    };
  }

  private readProviderFailure(response: unknown): string | null {
    const wrapper = this.readObject(response);
    if ('default_rate' in wrapper || 'derived_rate' in wrapper) {
      const defaultRateFailure: string | null = this.readProviderFailure(wrapper.default_rate);
      if (defaultRateFailure) {
        return `Default rate update failed: ${defaultRateFailure}`;
      }

      const derivedRateFailure: string | null = this.readProviderFailure(wrapper.derived_rate);
      if (derivedRateFailure) {
        return `Derived rate update failed: ${derivedRateFailure}`;
      }

      return null;
    }

    const returnCode = this.readProviderReturnCode(response);
    if (returnCode === '200') {
      return null;
    }

    return this.readProviderReturnMessage(response) ?? `Provider returned code ${returnCode ?? 'unknown'}`;
  }

  private readSyncConcurrency() {
    const raw = process.env.ZODOMUS_SYNC_CONCURRENCY?.trim();
    if (!raw) {
      return this.defaultSyncConcurrency();
    }

    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return this.defaultSyncConcurrency();
    }

    return Math.min(parsed, 32);
  }

  private defaultSyncConcurrency() {
    return process.env.ZODOMUS_ENVIRONMENT?.trim() === 'sandbox' ? 1 : 8;
  }

  private async mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    iteratee: (item: T, index: number) => Promise<R>,
  ) {
    if (items.length === 0) {
      return [] as R[];
    }

    const results = new Array<R>(items.length);
    let cursor = 0;
    const workerCount = Math.min(concurrency, items.length);

    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (cursor < items.length) {
          const index = cursor;
          cursor += 1;
          results[index] = await iteratee(items[index], index);
        }
      }),
    );

    return results;
  }

  private readProviderReturnCode(response: unknown) {
    const status = this.readProviderStatusRecord(response);
    const code = status.returnCode;

    if (typeof code === 'number' && Number.isFinite(code)) {
      return String(code);
    }

    return typeof code === 'string' && code.trim() ? code.trim() : null;
  }

  private readProviderReturnMessage(response: unknown) {
    const status = this.readProviderStatusRecord(response);
    const message = status.returnMessage;

    if (typeof message === 'string' && message.trim()) {
      return message.trim();
    }

    if (message && typeof message === 'object') {
      return JSON.stringify(message);
    }

    return null;
  }

  private readProviderStatusRecord(response: unknown) {
    const wrapper = this.readPayloadRecord(response, 'provider response');
    const responseRecord =
      'response' in wrapper ? this.readPayloadRecord(wrapper.response, 'provider response body') : wrapper;
    return 'status' in responseRecord
      ? this.readPayloadRecord(responseRecord.status, 'provider response status')
      : responseRecord;
  }

  async getPriceModels(payload: ChannelConnectionValidationPayload): Promise<Prisma.InputJsonObject> {
    const appCredentials = readZodomusAppCredentials();
    const client = new ZodomusClient(appCredentials);
    return {
      provider: payload.provider,
      environment: appCredentials.environment,
      response: this.asJsonValue(await client.getPriceModels()),
    };
  }

  async checkProperty(payload: ChannelPropertyActionPayload): Promise<Prisma.InputJsonObject> {
    const appCredentials = readZodomusAppCredentials();
    const connectionConfig = readZodomusConnectionConfig(payload.credentials);
    if (!payload.external_hotel_id) {
      throw new BadRequestException('Zodomus property check requires external_hotel_id on the channel connection.');
    }

    const client = new ZodomusClient(appCredentials);
    const response = await client.checkProperty({
      channelId: Number(connectionConfig.channel_code),
      propertyId: payload.external_hotel_id,
    });

    return {
      provider: payload.provider,
      external_hotel_id: payload.external_hotel_id,
      channel_id: Number(connectionConfig.channel_code),
      ota_name: connectionConfig.ota_name,
      response: this.asJsonValue(response),
    };
  }

  async activateProperty(payload: ChannelPropertyActionPayload): Promise<Prisma.InputJsonObject> {
    const appCredentials = readZodomusAppCredentials();
    const connectionConfig = readZodomusConnectionConfig(payload.credentials);
    if (!payload.external_hotel_id) {
      throw new BadRequestException('Zodomus property activation requires external_hotel_id on the channel connection.');
    }

    if (!payload.price_model_id) {
      throw new BadRequestException('Zodomus property activation requires price_model_id.');
    }

    const client = new ZodomusClient(appCredentials);
    const response = await client.activateProperty({
      channelId: Number(connectionConfig.channel_code),
      propertyId: payload.external_hotel_id,
      priceModelId: payload.price_model_id,
      ...(payload.token ? { token: payload.token } : {}),
    });

    return {
      provider: payload.provider,
      external_hotel_id: payload.external_hotel_id,
      channel_id: Number(connectionConfig.channel_code),
      ota_name: connectionConfig.ota_name,
      price_model_id: payload.price_model_id,
      response: this.asJsonValue(response),
    };
  }

  async activateRooms(payload: ChannelPropertyActionPayload): Promise<Prisma.InputJsonObject> {
    const appCredentials = readZodomusAppCredentials();
    const connectionConfig = readZodomusConnectionConfig(payload.credentials);
    if (!payload.external_hotel_id) {
      throw new BadRequestException('Zodomus room activation requires external_hotel_id on the channel connection.');
    }

    const rooms = this.readPayloadArray(payload.rooms, 'rooms activation');
    const normalizedRooms = rooms.map((room) => {
      const record = this.readPayloadRecord(room, 'rooms activation item');
      return {
        roomId: this.requiredString(record.roomId, 'rooms.roomId'),
        roomName: this.requiredString(record.roomName, 'rooms.roomName'),
        quantity: this.requiredInteger(record.quantity, 'rooms.quantity'),
        status: this.requiredInteger(record.status, 'rooms.status'),
        rates: this.readStringArray(record.rates, 'rooms.rates'),
      };
    });

    const client = new ZodomusClient(appCredentials);
    const response = await client.activateRooms({
      channelId: Number(connectionConfig.channel_code),
      propertyId: payload.external_hotel_id,
      rooms: normalizedRooms,
    });

    return {
      provider: payload.provider,
      external_hotel_id: payload.external_hotel_id,
      channel_id: Number(connectionConfig.channel_code),
      ota_name: connectionConfig.ota_name,
      rooms: this.asJsonValue(normalizedRooms),
      response: this.asJsonValue(response),
    };
  }

  async disconnectProperty(payload: ChannelPropertyActionPayload): Promise<Prisma.InputJsonObject> {
    const appCredentials = readZodomusAppCredentials();
    const connectionConfig = readZodomusConnectionConfig(payload.credentials);
    if (!payload.external_hotel_id) {
      throw new BadRequestException('Zodomus property disconnection requires external_hotel_id on the channel connection.');
    }

    const client = new ZodomusClient(appCredentials);
    const response = await client.cancelProperty({
      channelId: Number(connectionConfig.channel_code),
      propertyId: payload.external_hotel_id,
    });

    return {
      provider: payload.provider,
      external_hotel_id: payload.external_hotel_id,
      channel_id: Number(connectionConfig.channel_code),
      ota_name: connectionConfig.ota_name,
      response: this.asJsonValue(response),
    };
  }

  async getReservationsQueue(payload: ChannelReservationActionPayload): Promise<Prisma.InputJsonObject> {
    const appCredentials = readZodomusAppCredentials();
    const connectionConfig = readZodomusConnectionConfig(payload.credentials);
    const propertyId = this.requiredPropertyId(payload.external_hotel_id, 'reservations queue');
    const client = new ZodomusClient(appCredentials);
    return {
      provider: payload.provider,
      channel_id: Number(connectionConfig.channel_code),
      ota_name: connectionConfig.ota_name,
      external_hotel_id: propertyId,
      response: this.asJsonValue(
        await client.pullReservationQueue({
          channelId: connectionConfig.channel_code,
          propertyId,
        }),
      ),
    };
  }

  async getReservation(payload: ChannelReservationActionPayload): Promise<Prisma.InputJsonObject> {
    const appCredentials = readZodomusAppCredentials();
    const connectionConfig = readZodomusConnectionConfig(payload.credentials);
    const propertyId = this.requiredPropertyId(payload.external_hotel_id, 'reservation detail');
    if (!payload.reservation_id) {
      throw new BadRequestException('Reservation detail lookup requires reservation_id.');
    }
    const client = new ZodomusClient(appCredentials);
    return {
      provider: payload.provider,
      channel_id: Number(connectionConfig.channel_code),
      ota_name: connectionConfig.ota_name,
      external_hotel_id: propertyId,
      reservation_id: payload.reservation_id,
      response: this.asJsonValue(
        await client.getReservation({
          channelId: connectionConfig.channel_code,
          propertyId,
          reservationId: payload.reservation_id,
        }),
      ),
    };
  }

  async getReservationCC(payload: ChannelReservationActionPayload): Promise<Prisma.InputJsonObject> {
    const appCredentials = readZodomusAppCredentials();
    const connectionConfig = readZodomusConnectionConfig(payload.credentials);
    const propertyId = this.requiredPropertyId(payload.external_hotel_id, 'reservation card detail');
    if (!payload.reservation_id) {
      throw new BadRequestException('Reservation card detail lookup requires reservation_id.');
    }
    const client = new ZodomusClient(appCredentials);
    return {
      provider: payload.provider,
      channel_id: Number(connectionConfig.channel_code),
      ota_name: connectionConfig.ota_name,
      external_hotel_id: propertyId,
      reservation_id: payload.reservation_id,
      response: this.asJsonValue(
        await client.getReservationCC({
          channelId: connectionConfig.channel_code,
          propertyId,
          reservationId: payload.reservation_id,
        }),
      ),
    };
  }

  async getReservationsSummary(payload: ChannelReservationActionPayload): Promise<Prisma.InputJsonObject> {
    const appCredentials = readZodomusAppCredentials();
    const connectionConfig = readZodomusConnectionConfig(payload.credentials);
    const propertyId = this.requiredPropertyId(payload.external_hotel_id, 'reservations summary');
    const client = new ZodomusClient(appCredentials);
    return {
      provider: payload.provider,
      channel_id: Number(connectionConfig.channel_code),
      ota_name: connectionConfig.ota_name,
      external_hotel_id: propertyId,
      response: this.asJsonValue(
        await client.getReservationsSummary({
          channelId: connectionConfig.channel_code,
          propertyId,
        }),
      ),
    };
  }

  async createTestReservation(payload: ChannelReservationActionPayload): Promise<Prisma.InputJsonObject> {
    const appCredentials = readZodomusAppCredentials();
    const connectionConfig = readZodomusConnectionConfig(payload.credentials);
    const propertyId = this.requiredPropertyId(payload.external_hotel_id, 'test reservation');
    const status = payload.status?.trim() || 'new';
    const client = new ZodomusClient(appCredentials);
    return {
      provider: payload.provider,
      channel_id: Number(connectionConfig.channel_code),
      ota_name: connectionConfig.ota_name,
      external_hotel_id: propertyId,
      reservation_id: payload.reservation_id ?? null,
      status,
      response: this.asJsonValue(
        await client.createTestReservation({
          channelId: Number(connectionConfig.channel_code),
          propertyId,
          status,
          ...(payload.reservation_id ? { reservationId: payload.reservation_id } : {}),
        }),
      ),
    };
  }

  private requireExternalHotelId(
    externalHotelId: string | null | undefined,
    syncType: ChannelSyncType,
  ) {
    if (!externalHotelId) {
      throw new BadRequestException(
        `Zodomus ${syncType.toLowerCase()} sync requires external_hotel_id on the channel connection.`,
      );
    }
  }

  private requiredPropertyId(externalHotelId: string | null | undefined, action: string) {
    if (!externalHotelId) {
      throw new BadRequestException(`Zodomus ${action} requires external_hotel_id on the channel connection.`);
    }

    return externalHotelId;
  }

  private requiredDateWindow(from: string | undefined, to: string | undefined, context: string) {
    if (!from || !to) {
      throw new BadRequestException(`Zodomus ${context} requires from and to dates.`);
    }

    return { from, to };
  }

  private readPayloadArray(value: unknown, field: string) {
    if (!Array.isArray(value)) {
      throw new BadRequestException(`Zodomus ${field} payload must be an array.`);
    }

    return value;
  }

  private readPayloadRecord(value: unknown, field: string) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException(`Zodomus ${field} payload must be an object.`);
    }

    return value as Record<string, unknown>;
  }

  private requiredString(value: unknown, field: string) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`Zodomus ${field} is required.`);
    }

    return value.trim();
  }

  private requiredInteger(value: unknown, field: string) {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      throw new BadRequestException(`Zodomus ${field} must be an integer.`);
    }

    return value;
  }

  private requiredNumber(value: unknown, field: string) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new BadRequestException(`Zodomus ${field} must be a finite number.`);
    }

    return value;
  }

  private readStringArray(value: unknown, field: string) {
    if (!Array.isArray(value) || value.length === 0) {
      throw new BadRequestException(`Zodomus ${field} must be a non-empty array.`);
    }

    return value.map((entry, index) => {
      if (typeof entry !== 'string' || !entry.trim()) {
        throw new BadRequestException(`Zodomus ${field}[${index}] must be a non-empty string.`);
      }

      return entry.trim();
    });
  }

  private asJsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
  }

  private extractRooms(payload: unknown) {
    const items = this.collectRecords(payload);
    const seen = new Set<string>();
    const rooms: Array<{ external_room_id: string; external_room_name: string | null }> = [];

    for (const item of items) {
      const roomId = this.firstString(item, 'room_id', 'room_type_id', 'id', 'external_room_id');
      if (!roomId || seen.has(roomId)) {
        continue;
      }

      seen.add(roomId);
      rooms.push({
        external_room_id: roomId,
        external_room_name:
          this.firstString(item, 'room_name', 'room_type_name', 'name', 'title') ?? null,
      });
    }

    return rooms;
  }

  private extractRates(payload: unknown) {
    const seen = new Set<string>();
    const rates: Array<{
      external_rate_id: string;
      external_rate_name: string | null;
      external_room_id: string | null;
    }> = [];

    const rooms = this.collectRecords(payload).filter((item) => Array.isArray(item.rates));

    for (const room of rooms) {
      const roomId = this.firstString(room, 'room_id', 'room_type_id', 'id', 'external_room_id');
      const roomRates = this.readArray(room.rates);

      for (const candidate of roomRates) {
        if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
          continue;
        }

        const item = candidate as Record<string, unknown>;
        const rateId = this.firstString(item, 'rate_id', 'rate_plan_id', 'id', 'external_rate_id');
        if (!rateId) {
          continue;
        }

        const dedupeKey = `${roomId ?? ''}:${rateId}`;
        if (seen.has(dedupeKey)) {
          continue;
        }

        seen.add(dedupeKey);
        rates.push({
          external_rate_id: rateId,
          external_rate_name:
            this.firstString(item, 'rate_name', 'rate_plan_name', 'name', 'title') ?? null,
          external_room_id: roomId ?? null,
        });
      }
    }

    if (rates.length > 0) {
      return rates;
    }

    const items = this.collectRecords(payload);
    for (const item of items) {
      const rateId = this.firstString(item, 'rate_id', 'rate_plan_id', 'id', 'external_rate_id');
      const roomId = this.firstString(item, 'room_id', 'room_type_id', 'external_room_id') ?? null;
      if (!rateId) {
        continue;
      }

      const dedupeKey = `${roomId ?? ''}:${rateId}`;
      if (seen.has(dedupeKey)) {
        continue;
      }

      seen.add(dedupeKey);
      rates.push({
        external_rate_id: rateId,
        external_rate_name:
          this.firstString(item, 'rate_name', 'rate_plan_name', 'name', 'title') ?? null,
        external_room_id: roomId,
      });
    }

    return rates;
  }

  private async tryGetChannels(client: ZodomusClient) {
    try {
      const channels = await client.getChannels();
      return {
        channels,
        warnings: [] as string[],
      };
    } catch (error) {
      return {
        channels: [],
        warnings: [
          error instanceof Error
            ? `Optional validation step failed for /channels: ${error.message}`
            : 'Optional validation step failed for /channels.',
        ],
      };
    }
  }

  private async fetchReservationDetails(
    client: ZodomusClient,
    summaryPayload: unknown,
    channelId: string,
    propertyId: string,
  ) {
    const references = this.extractReservationReferences(summaryPayload);
    const reservations = await Promise.all(
      references.map(async (reference) => {
        try {
          const detail = await client.getReservation({
            channelId,
            propertyId,
            reservationId: reference.reservationId,
          });

          if (this.isDownloadedReservationLimitResponse(detail)) {
            return null;
          }

          return detail;
        } catch (error) {
          return {
            reference,
            error: error instanceof Error ? error.message : 'Failed to fetch reservation detail',
          };
        }
      }),
    );

    return reservations.filter((entry) => entry !== null);
  }

  private batchInventoryRows(rows: unknown[]) {
    const sortedRows = rows
      .map((row) => this.readPayloadRecord(row, 'inventory sync item'))
      .map((row) => ({
        date: this.requiredString(row.date, 'inventory.date'),
        external_room_id: this.requiredString(row.external_room_id, 'inventory.external_room_id'),
        available: this.requiredInteger(row.available, 'inventory.available'),
        stop_sell: this.optionalBoolean(row.stop_sell),
        closed_to_arrival: this.optionalBoolean(row.closed_to_arrival),
        closed_to_departure: this.optionalBoolean(row.closed_to_departure),
      }))
      .sort((left, right) => {
        if (left.external_room_id !== right.external_room_id) {
          return left.external_room_id.localeCompare(right.external_room_id);
        }

        return left.date.localeCompare(right.date);
      });

    const segments: Array<{
      external_room_id: string;
      available: number;
      stop_sell: boolean;
      closed_to_arrival: boolean;
      closed_to_departure: boolean;
      date_from: string;
      date_to: string;
      rows: Array<{ date: string }>;
    }> = [];

    for (const row of sortedRows) {
      const previous = segments[segments.length - 1];
      if (
        previous &&
        previous.external_room_id === row.external_room_id &&
        previous.available === row.available &&
        previous.stop_sell === row.stop_sell &&
        previous.closed_to_arrival === row.closed_to_arrival &&
        previous.closed_to_departure === row.closed_to_departure &&
        previous.date_to === row.date
      ) {
        previous.rows.push({ date: row.date });
        previous.date_to = this.nextDate(row.date);
        continue;
      }

      segments.push({
        external_room_id: row.external_room_id,
        available: row.available,
        stop_sell: row.stop_sell,
        closed_to_arrival: row.closed_to_arrival,
        closed_to_departure: row.closed_to_departure,
        date_from: row.date,
        date_to: this.nextDate(row.date),
        rows: [{ date: row.date }],
      });
    }

    return segments;
  }

  private batchRateRows(rows: unknown[]) {
    const sortedRows = rows
      .map((row) => this.readPayloadRecord(row, 'rate sync item'))
      .map((row) => ({
        date: this.requiredString(row.date, 'rates.date'),
        external_room_id: this.requiredString(row.external_room_id, 'rates.external_room_id'),
        external_rate_id: this.requiredString(row.external_rate_id, 'rates.external_rate_id'),
        currency: this.requiredString(row.currency, 'rates.currency'),
        base_rate: this.requiredNumber(row.base_rate, 'rates.base_rate'),
        room_category_max_occupancy: this.optionalPositiveInteger(row.room_category_max_occupancy),
        pricing_config: this.readObject(row.pricing_config),
        pricing_config_key: JSON.stringify(this.readObject(row.pricing_config)),
        closed: this.optionalBoolean(row.closed),
        closed_to_arrival: this.optionalBoolean(row.closed_to_arrival),
        closed_to_departure: this.optionalBoolean(row.closed_to_departure),
        min_stay: this.optionalPositiveInteger(row.min_stay),
        max_stay: this.optionalPositiveInteger(row.max_stay),
      }))
      .sort((left, right) => {
        const roomCompare = left.external_room_id.localeCompare(right.external_room_id);
        if (roomCompare !== 0) {
          return roomCompare;
        }

        const rateCompare = left.external_rate_id.localeCompare(right.external_rate_id);
        if (rateCompare !== 0) {
          return rateCompare;
        }

        return left.date.localeCompare(right.date);
      });

    const segments: Array<{
      external_room_id: string;
      external_rate_id: string;
      currency: string;
      base_rate: number;
      room_category_max_occupancy: number | null;
      pricing_config: Record<string, unknown>;
      pricing_config_key: string;
      closed: boolean;
      closed_to_arrival: boolean;
      closed_to_departure: boolean;
      min_stay: number | null;
      max_stay: number | null;
      date_from: string;
      date_to: string;
      rows: Array<{ date: string }>;
    }> = [];

    for (const row of sortedRows) {
      const previous = segments[segments.length - 1];
      if (
        previous &&
        previous.external_room_id === row.external_room_id &&
        previous.external_rate_id === row.external_rate_id &&
        previous.currency === row.currency &&
        previous.base_rate === row.base_rate &&
        previous.room_category_max_occupancy === row.room_category_max_occupancy &&
        previous.pricing_config_key === row.pricing_config_key &&
        previous.closed === row.closed &&
        previous.closed_to_arrival === row.closed_to_arrival &&
        previous.closed_to_departure === row.closed_to_departure &&
        previous.min_stay === row.min_stay &&
        previous.max_stay === row.max_stay &&
        previous.date_to === row.date
      ) {
        previous.rows.push({ date: row.date });
        previous.date_to = this.nextDate(row.date);
        continue;
      }

      segments.push({
        external_room_id: row.external_room_id,
        external_rate_id: row.external_rate_id,
        currency: row.currency,
        base_rate: row.base_rate,
        room_category_max_occupancy: row.room_category_max_occupancy,
        pricing_config: row.pricing_config,
        pricing_config_key: row.pricing_config_key,
        closed: row.closed,
        closed_to_arrival: row.closed_to_arrival,
        closed_to_departure: row.closed_to_departure,
        min_stay: row.min_stay,
        max_stay: row.max_stay,
        date_from: row.date,
        date_to: this.nextDate(row.date),
        rows: [{ date: row.date }],
      });
    }

    return segments;
  }

  private readPriceModelId(value: unknown) {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      return value;
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = Number.parseInt(value, 10);
      if (Number.isInteger(parsed) && parsed > 0) {
        return parsed;
      }
    }

    return 1;
  }

  private rateEndpointForPriceModel(
    priceModelId: number,
  ): 'rates' | 'rates-derived' | 'rates-occupancy' | 'rates-per-day' | 'rates-length-of-stay' {
    if (priceModelId === 3) {
      return 'rates-occupancy';
    }

    if (priceModelId === 4) {
      return 'rates-per-day';
    }

    if (priceModelId === 5) {
      return 'rates-length-of-stay';
    }

    return priceModelId === 2 ? 'rates-derived' : 'rates';
  }

  private async pushRateSegment(
    client: ZodomusClient,
    input: {
      endpoint: 'rates' | 'rates-derived' | 'rates-occupancy' | 'rates-per-day' | 'rates-length-of-stay';
      channelId: number;
      propertyId: string;
      segment: {
        external_room_id: string;
        external_rate_id: string;
        currency: string;
        base_rate: number;
        room_category_max_occupancy: number | null;
        pricing_config: Record<string, unknown>;
        closed: boolean;
        closed_to_arrival: boolean;
        closed_to_departure: boolean;
        min_stay: number | null;
        max_stay: number | null;
        date_from: string;
        date_to: string;
      };
    },
  ) {
    const defaultRateResponse = await client.pushRates({
      channelId: input.channelId,
      propertyId: input.propertyId,
      roomId: input.segment.external_room_id,
      rateId: input.segment.external_rate_id,
      dateFrom: input.segment.date_from,
      dateTo: input.segment.date_to,
      currencyCode: input.segment.currency,
      ...(input.endpoint === 'rates-per-day' || input.endpoint === 'rates-length-of-stay'
        ? { baseOccupancy: this.perDayBaseOccupancy(input.segment) }
        : {}),
      prices:
        input.endpoint === 'rates-derived'
          ? { price: input.segment.base_rate.toFixed(2) }
          : input.endpoint === 'rates-occupancy'
            ? this.occupancyPricesForSegment(input.segment)
            : input.endpoint === 'rates-per-day'
              ? { price: input.segment.base_rate.toFixed(2) }
              : input.endpoint === 'rates-length-of-stay'
                ? this.lengthOfStayPricesForSegment(input.segment)
          : this.ratePricesForSegment(input.segment),
      closed: input.segment.closed ? '1' : '0',
      closedToArrival: input.segment.closed_to_arrival ? '1' : '0',
      closedToDeparture: input.segment.closed_to_departure ? '1' : '0',
      minimumStay: (input.segment.min_stay ?? 1).toString(),
      maximumStay: (input.segment.max_stay ?? 31).toString(),
    });

    if (input.endpoint !== 'rates-derived') {
      return defaultRateResponse;
    }

    const defaultRateError = this.readProviderFailure(defaultRateResponse);
    if (defaultRateError) {
      return defaultRateResponse;
    }

    const derivedRateResponse = await client.pushDerivedRates({
      channelId: input.channelId,
      propertyId: input.propertyId,
      roomId: input.segment.external_room_id,
      rateId: input.segment.external_rate_id,
      baseOccupancy: this.derivedBaseOccupancy(input.segment),
      occupancy: this.derivedOccupancyOffsets(input.segment),
    });

    return {
      default_rate: defaultRateResponse,
      derived_rate: derivedRateResponse,
    };
  }

  private ratePricesForSegment(segment: { base_rate: number; room_category_max_occupancy: number | null }) {
    const price = segment.base_rate.toFixed(2);
    if (segment.room_category_max_occupancy !== null && segment.room_category_max_occupancy <= 1) {
      return { price };
    }

    const singlePrice = this.optionalPrice(this.readObject((segment as { pricing_config?: unknown }).pricing_config).single_price);
    return {
      price,
      priceSingle: singlePrice ?? price,
    };
  }

  private occupancyPricesForSegment(segment: {
    base_rate: number;
    room_category_max_occupancy: number | null;
    pricing_config?: Record<string, unknown>;
  }) {
    const configuredPrices = this.readArray(segment.pricing_config?.occupancy_prices ?? segment.pricing_config?.prices)
      .map((item) => {
        const record = this.readObject(item);
        const guests = this.optionalPositiveInteger(record.guests);
        const price = this.optionalPrice(record.price);
        return guests && price ? { guests: guests.toString(), price } : null;
      })
      .filter((item): item is { guests: string; price: string } => item !== null);

    if (configuredPrices.length > 0) {
      return configuredPrices;
    }

    const maxOccupancy = segment.room_category_max_occupancy ?? 1;
    const price = segment.base_rate.toFixed(2);

    return Array.from({ length: maxOccupancy }, (_, index) => ({
      guests: (index + 1).toString(),
      price,
    }));
  }

  private lengthOfStayPricesForSegment(segment: { base_rate: number; pricing_config?: Record<string, unknown> }) {
    const configuredPrices = this.readArray(
      segment.pricing_config?.length_of_stay_prices ?? segment.pricing_config?.los_prices ?? segment.pricing_config?.prices,
    )
      .map((item) => {
        const record = this.readObject(item);
        const days = this.optionalPositiveInteger(record.days);
        const price = this.optionalPrice(record.price);
        return days && price ? { days: days.toString(), price } : null;
      })
      .filter((item): item is { days: string; price: string } => item !== null);

    if (configuredPrices.length > 0) {
      return configuredPrices;
    }

    const price = segment.base_rate.toFixed(2);

    return Array.from({ length: 31 }, (_, index) => ({
      days: (index + 1).toString(),
      price,
    }));
  }

  private derivedBaseOccupancy(segment: { room_category_max_occupancy: number | null }) {
    const configuredBaseOccupancy = this.optionalPositiveInteger(
      this.readObject((segment as { pricing_config?: unknown }).pricing_config).baseOccupancy ??
        this.readObject((segment as { pricing_config?: unknown }).pricing_config).base_occupancy,
    );
    if (configuredBaseOccupancy) {
      return configuredBaseOccupancy.toString();
    }

    const maxOccupancy = segment.room_category_max_occupancy ?? 2;
    return Math.min(Math.max(maxOccupancy, 1), 2).toString();
  }

  private perDayBaseOccupancy(segment: { room_category_max_occupancy: number | null }) {
    const configuredBaseOccupancy = this.optionalPositiveInteger(
      this.readObject((segment as { pricing_config?: unknown }).pricing_config).baseOccupancy ??
        this.readObject((segment as { pricing_config?: unknown }).pricing_config).base_occupancy,
    );
    if (configuredBaseOccupancy) {
      return configuredBaseOccupancy.toString();
    }

    const maxOccupancy = segment.room_category_max_occupancy ?? 1;
    return Math.min(Math.max(maxOccupancy, 1), 2).toString();
  }

  private derivedOccupancyOffsets(segment: { room_category_max_occupancy: number | null; pricing_config?: Record<string, unknown> }) {
    const configuredOffsets = this.readArray(segment.pricing_config?.derived_offsets ?? segment.pricing_config?.offsets)
      .map((item) => {
        const record = this.readObject(item);
        const persons = this.optionalPositiveInteger(record.persons);
        if (!persons) {
          return null;
        }

        const percentage = this.optionalStringOrNumber(record.percentage);
        const additional = this.optionalStringOrNumber(record.additional);
        const round = this.optionalStringOrNumber(record.round) ?? '1';
        if (!percentage && !additional) {
          return null;
        }

        return {
          persons: persons.toString(),
          ...(percentage ? { percentage } : {}),
          ...(additional ? { additional } : {}),
          round,
        };
      })
      .filter(
        (
          item,
        ): item is { persons: string; percentage?: string; additional?: string; round: string } => item !== null,
      );

    if (configuredOffsets.length > 0) {
      return configuredOffsets;
    }

    const maxOccupancy = segment.room_category_max_occupancy ?? 2;
    const baseOccupancy = Number.parseInt(this.derivedBaseOccupancy(segment), 10);
    const offsets: Array<{ persons: string; percentage: string; round: string }> = [];

    for (let persons = 1; persons <= maxOccupancy; persons += 1) {
      if (persons === baseOccupancy) {
        continue;
      }

      offsets.push({
        persons: persons.toString(),
        percentage: '0',
        round: '1',
      });
    }

    return offsets;
  }

  private optionalPositiveInteger(value: unknown) {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
      return value;
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = Number.parseInt(value, 10);
      if (Number.isInteger(parsed) && parsed > 0) {
        return parsed;
      }
    }

    return null;
  }

  private optionalBoolean(value: unknown) {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value === 'number') {
      return value === 1;
    }

    if (typeof value === 'string' && value.trim()) {
      return ['1', 'true', 'yes'].includes(value.trim().toLowerCase());
    }

    return false;
  }

  private optionalPrice(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value.toFixed(2);
    }

    if (typeof value === 'string' && value.trim()) {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed)) {
        return parsed.toFixed(2);
      }
    }

    return null;
  }

  private optionalStringOrNumber(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value.toString();
    }

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    return null;
  }

  private async tryFetchReservationDetailById(
    client: ZodomusClient,
    channelId: string,
    propertyId: string,
    reservationId: string,
  ) {
    try {
      const detail = await client.getReservation({
        channelId,
        propertyId,
        reservationId,
      });

      if (this.isDownloadedReservationLimitResponse(detail)) {
        return { reservation: null };
      }

      if (this.readProviderFailure(detail)) {
        return { reservation: null };
      }

      return { reservation: detail };
    } catch {
      return { reservation: null };
    }
  }

  private readWebhookTriggeredReservationImport(value: unknown) {
    const record = this.readObject(value);
    const mode = this.firstString(record, 'mode');
    const reservationIds = this.readReservationIdList(record);
    if (mode !== 'webhook_trigger' || reservationIds.length === 0) {
      return null;
    }

    return {
      mode,
      reservationIds,
    };
  }

  private readReservationIdList(record: Record<string, unknown>) {
    const seen = new Set<string>();
    const ids: string[] = [];
    const add = (value: unknown) => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        const normalized = String(value);
        if (!seen.has(normalized)) {
          seen.add(normalized);
          ids.push(normalized);
        }
        return;
      }

      if (typeof value !== 'string' || !value.trim()) {
        return;
      }

      const normalized = value.trim();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        ids.push(normalized);
      }
    };

    add(record.reservation_id);
    add(record.reservationId);
    for (const key of ['reservation_ids', 'reservationIds']) {
      const value = record[key];
      if (Array.isArray(value)) {
        value.forEach(add);
      } else {
        add(value);
      }
    }

    return ids;
  }

  private readReservationImportMode(value: unknown) {
    const record = this.readObject(value);
    return this.firstString(record, 'mode');
  }

  private isDownloadedReservationLimitResponse(response: unknown) {
    const providerError = this.readProviderFailure(response);
    if (!providerError) {
      return false;
    }

    const normalized = providerError.trim().toLowerCase();
    return normalized.includes('reservation already downloaded') && normalized.includes('limit was reached');
  }

  private extractReservationReferences(...payloads: unknown[]) {
    const references: Array<Record<string, string>> = [];
    const seenReservationIds = new Set<string>();

    for (const payload of payloads) {
      const items = this.readArray(payload);

      for (const item of items) {
        const record = this.readObject(item);
        const reservationEnvelope = this.readObject(record.reservations);
        const reservationCandidates = [
          this.readObject(record.reservation),
          this.readObject(reservationEnvelope.reservation),
          reservationEnvelope,
        ];
        const reservationRecord =
          reservationCandidates.find((candidate) => Object.keys(candidate).length > 0) ?? {};
        const reservationId =
          this.firstString(
            reservationRecord,
            'reservation_id',
            'reservationId',
            'id',
            'booking_id',
            'bookingId',
            'code',
          ) ??
          this.firstString(
            record,
            'reservation_id',
            'reservationId',
            'id',
            'booking_id',
            'bookingId',
            'code',
          );

        if (!reservationId || seenReservationIds.has(reservationId)) {
          continue;
        }

        seenReservationIds.add(reservationId);
        references.push({ reservationId });
      }
    }

    return references;
  }

  private collectRecords(value: unknown): Array<Record<string, unknown>> {
    const arrays = this.readArray(value);
    if (arrays.length > 0) {
      return arrays
        .map((item) => this.readObject(item))
        .filter((record) => Object.keys(record).length > 0);
    }

    const record = this.readObject(value);
    const candidateArrays = ['room_rates', 'rooms', 'rates', 'data', 'items']
      .map((key) => this.readArray(record[key]))
      .filter((entries) => entries.length > 0);

    return candidateArrays.flatMap((entries) =>
      entries
        .map((item) => this.readObject(item))
        .filter((entry) => Object.keys(entry).length > 0),
    );
  }

  private readObject(value: unknown) {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private readArray(value: unknown): unknown[] {
    if (Array.isArray(value)) {
      return value;
    }

    const record = this.readObject(value);
    if (Array.isArray(record.items)) {
      return record.items;
    }
    if (Array.isArray(record.reservations)) {
      return record.reservations;
    }
    if (Array.isArray(record.data)) {
      return record.data;
    }

    return [];
  }

  private firstString(record: Record<string, unknown>, ...keys: string[]) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return null;
  }

  private readErrorMessage(error: unknown) {
    if (error instanceof Error && error.message.trim()) {
      return error.message.trim();
    }

    return 'Inventory row push failed';
  }

  private nextDate(value: string) {
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Invalid inventory date: ${value}`);
    }

    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
  }
}
