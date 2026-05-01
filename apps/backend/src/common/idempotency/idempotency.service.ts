import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../modules/auth/auth.guard';

@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  async run<T>(
    key: string | undefined,
    scope: string,
    body: unknown,
    user: AuthenticatedUser | undefined,
    action: () => Promise<T>,
  ): Promise<T> {
    if (!key) {
      return action();
    }

    return this.prisma.$transaction(async (tx) => {
      await this.acquireLock(tx, key);

      const requestHash = this.hash({ scope, body, user_id: user?.sub ?? null });
      const existing = await tx.idempotencyKey.findUnique({ where: { key } });

      if (existing) {
        if (existing.scope !== scope || existing.requestHash !== requestHash) {
          throw new ConflictException('Idempotency key was already used for a different request');
        }

        return existing.responseBody as T;
      }

      const response = await action();
      const jsonResponse = JSON.parse(JSON.stringify(response)) as Prisma.InputJsonValue;
      await tx.idempotencyKey.create({
        data: {
          key,
          userId: user?.sub,
          scope,
          requestHash,
          responseBody: jsonResponse,
        },
      });

      return response;
    });
  }

  private hash(value: unknown) {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private async acquireLock(tx: Prisma.TransactionClient, key: string) {
    await tx.$queryRaw`
      SELECT COUNT(*)::int
      FROM (
        SELECT pg_advisory_xact_lock(hashtext(${key}))
      ) AS idempotency_lock
    `;
  }
}
