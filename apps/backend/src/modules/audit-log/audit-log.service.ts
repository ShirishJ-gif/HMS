import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { paginatedResponse, paginationParams } from '../../common/pagination/paginated-response';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/auth.guard';
import { propertyIdFilter } from '../auth/property-scope';

type CreateAuditLogInput = {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  propertyId?: string | null;
  summary: string;
  metadata?: Prisma.InputJsonValue;
  user?: AuthenticatedUser;
};

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: CreateAuditLogInput) {
    await this.prisma.auditLog.create({
      data: {
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        propertyId: input.propertyId ?? input.user?.property_id ?? null,
        userId: input.user?.sub ?? null,
        summary: input.summary,
        metadata: input.metadata ?? Prisma.JsonNull,
      },
    });
  }

  async findAll(query: PaginationQueryDto, user?: AuthenticatedUser) {
    const { page, limit, skip, take } = paginationParams(query);
    const scopedPropertyId = propertyIdFilter(user);
    const search = query.search?.trim();
    const where: Prisma.AuditLogWhereInput = {
      ...(scopedPropertyId ? { propertyId: scopedPropertyId } : {}),
      ...(search
        ? {
            OR: [
              { summary: { contains: search, mode: 'insensitive' } },
              { entityType: { contains: search, mode: 'insensitive' } },
              { entityId: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [logs, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return paginatedResponse(
      logs.map((log) => ({
        id: log.id,
        property_id: log.propertyId,
        user_id: log.userId,
        action: log.action,
        entity_type: log.entityType,
        entity_id: log.entityId,
        summary: log.summary,
        metadata: log.metadata,
        user: log.user,
        created_at: log.createdAt,
      })),
      total,
      page,
      limit,
    );
  }
}
