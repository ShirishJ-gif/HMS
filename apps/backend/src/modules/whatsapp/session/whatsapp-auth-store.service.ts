import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { WhatsAppEncryptionService } from './whatsapp-encryption.service';

@Injectable()
export class WhatsAppAuthStoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: WhatsAppEncryptionService,
  ) {}

  async read(connectionId: string, key: string) {
    const record = await this.prisma.whatsAppAuthRecord.findUnique({
      where: { connectionId_authKey: { connectionId, authKey: key } },
    });
    return record ? this.encryption.decryptJson(Buffer.from(record.encryptedValue)) : null;
  }

  async write(connectionId: string, key: string, value: unknown) {
    await this.prisma.whatsAppAuthRecord.upsert({
      where: { connectionId_authKey: { connectionId, authKey: key } },
      create: {
        connectionId,
        authKey: key,
        encryptedValue: this.encryption.encryptJson(value),
      },
      update: {
        encryptedValue: this.encryption.encryptJson(value),
      },
    });
  }

  async remove(connectionId: string, key: string) {
    await this.prisma.whatsAppAuthRecord.deleteMany({ where: { connectionId, authKey: key } });
  }

  async clear(connectionId: string) {
    await this.prisma.whatsAppAuthRecord.deleteMany({ where: { connectionId } });
  }
}
