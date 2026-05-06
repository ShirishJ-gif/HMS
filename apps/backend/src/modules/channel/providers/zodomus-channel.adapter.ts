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
      const rowResults = await Promise.all(
        inventoryRows.map(async (inventoryRow) => {
          const row = this.readPayloadRecord(inventoryRow, 'inventory sync item');
          const roomId = this.requiredString(row.external_room_id, 'inventory.external_room_id');
          const date = this.requiredString(row.date, 'inventory.date');
          const availability = this.requiredInteger(row.available, 'inventory.available');
          const response = await client
            .pushAvailability({
              channelId: Number(connectionConfig.channel_code),
              propertyId: payload.external_hotel_id,
              roomId,
              dateFrom: date,
              dateTo: date,
              availability,
            })
            .then((providerResponse) => ({
              date,
              external_room_id: roomId,
              available: availability,
              status: 'SUCCEEDED',
              provider_response: providerResponse,
            }))
            .catch((error: unknown) => ({
              date,
              external_room_id: roomId,
              available: availability,
              status: 'FAILED',
              error_message: this.readErrorMessage(error),
            }));

          return response;
        }),
      );
      const succeededRows = rowResults.filter((result) => result.status === 'SUCCEEDED');
      const failedRows = rowResults.filter((result) => result.status === 'FAILED');

      return {
        provider: payload.provider,
        sync_type: payload.sync_type,
        environment: appCredentials.environment,
        external_hotel_id: payload.external_hotel_id,
        ota_name: connectionConfig.ota_name,
        date_from: payload.from ?? null,
        date_to: payload.to ?? null,
        room_count: inventoryRows.length,
        row_results: this.asJsonValue(rowResults),
        response: this.asJsonValue(
          succeededRows.flatMap((result) => ('provider_response' in result ? [result.provider_response] : [])),
        ),
        summary: {
          total_rows: rowResults.length,
          succeeded_rows: succeededRows.length,
          failed_rows: failedRows.length,
        },
      };
    }

    if (payload.sync_type === ChannelSyncType.RATES) {
      this.requireExternalHotelId(payload.external_hotel_id, payload.sync_type);
      const rateWindow = this.requiredDateWindow(payload.from, payload.to, 'rate sync');
      const rateRows = this.readPayloadArray(payload.rates, 'rate sync');
      const responses = await Promise.all(
        rateRows.map(async (rateRow) => {
          const row = this.readPayloadRecord(rateRow, 'rate sync item');
          const roomId = this.requiredString(row.external_room_id, 'rates.external_room_id');
          const rateId = this.requiredString(row.external_rate_id, 'rates.external_rate_id');
          const currencyCode = this.requiredString(row.currency, 'rates.currency');
          const baseRate = this.requiredNumber(row.base_rate, 'rates.base_rate');

          return client.pushRates({
            channelId: Number(connectionConfig.channel_code),
            propertyId: payload.external_hotel_id,
            roomId,
            rateId,
            dateFrom: rateWindow.from,
            dateTo: rateWindow.to,
            currencyCode,
            prices: {
              price: baseRate.toFixed(2),
            },
          });
        }),
      );

      return {
        provider: payload.provider,
        sync_type: payload.sync_type,
        environment: appCredentials.environment,
        external_hotel_id: payload.external_hotel_id,
        ota_name: connectionConfig.ota_name,
        date_from: rateWindow.from,
        date_to: rateWindow.to,
        rate_count: rateRows.length,
        response: this.asJsonValue(responses),
      };
    }

    if (payload.sync_type === ChannelSyncType.BOOKINGS) {
      const propertyId = this.requiredPropertyId(payload.external_hotel_id, 'reservation sync');
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
        reservations: this.asJsonValue(reservations),
        message: 'Reservation queue fetched from Zodomus and prepared for local booking import.',
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
    queuePayload: unknown,
    channelId: string,
    propertyId: string,
  ) {
    const references = this.extractReservationReferences(queuePayload);
    const reservations = await Promise.all(
      references.map(async (reference) => {
        try {
          return await client.getReservation({
            channelId,
            propertyId,
            reservationId: reference.reservationId,
          });
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

  private extractReservationReferences(queuePayload: unknown) {
    const items = this.readArray(queuePayload);
    const references: Array<Record<string, string>> = [];

    for (const item of items) {
      const record = this.readObject(item);
      const reservationId = this.firstString(
        record,
        'reservation_id',
        'reservationId',
        'id',
        'booking_id',
        'bookingId',
        'code',
      );

      if (!reservationId) {
        continue;
      }

      references.push({ reservationId });
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
}
