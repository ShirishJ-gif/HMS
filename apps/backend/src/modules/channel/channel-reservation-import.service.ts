import { Injectable, NotImplementedException } from '@nestjs/common';
import { ChannelProvider, Prisma } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { InventoryService } from '../inventory/inventory.service';
import { MetricsService } from '../metrics/metrics.service';
import { PricingService } from '../pricing/pricing.service';
import { PrismaService } from '../../prisma/prisma.service';

export type ChannelReservationImportInput = {
  provider: ChannelProvider;
  channelConnectionId: string;
  channelSyncLogId?: string;
  propertyId: string;
  responsePayload: Prisma.JsonValue;
};

@Injectable()
export class ChannelReservationImportService {
  private zodomusReservationImportService:
    | {
        importFromSync(input: {
          channelConnectionId: string;
          channelSyncLogId?: string;
          propertyId: string;
          responsePayload: Prisma.JsonValue;
        }): Promise<Prisma.InputJsonObject>;
      }
    | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    private readonly inventoryService: InventoryService,
    private readonly pricingService: PricingService,
    private readonly metricsService: MetricsService,
  ) {}

  async importFromSync(input: ChannelReservationImportInput): Promise<Prisma.InputJsonObject | null> {
    if (input.provider !== ChannelProvider.ZODOMUS) {
      return null;
    }

    return this.zodomusImporter().importFromSync({
      channelConnectionId: input.channelConnectionId,
      channelSyncLogId: input.channelSyncLogId,
      propertyId: input.propertyId,
      responsePayload: input.responsePayload,
    });
  }

  private zodomusImporter() {
    if (this.zodomusReservationImportService) {
      return this.zodomusReservationImportService;
    }

    try {
      const module = require('./zodomus-reservation-import.service') as {
        ZodomusReservationImportService: new (
          prisma: PrismaService,
          auditLogService: AuditLogService,
          inventoryService: InventoryService,
          pricingService: PricingService,
          metricsService: MetricsService,
        ) => NonNullable<ChannelReservationImportService['zodomusReservationImportService']>;
      };
      this.zodomusReservationImportService = new module.ZodomusReservationImportService(
        this.prisma,
        this.auditLogService,
        this.inventoryService,
        this.pricingService,
        this.metricsService,
      );
      return this.zodomusReservationImportService;
    } catch (error) {
      throw new NotImplementedException(
        `ZODOMUS reservation importer is not available: ${error instanceof Error ? error.message : 'unknown load error'}.`,
      );
    }
  }
}
