import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

type EncryptedEnvelope = {
  version: 1;
  algorithm: 'AES-256-GCM';
  iv: string;
  authTag: string;
  ciphertext: string;
};

@Injectable()
export class WhatsAppEncryptionService {
  private readonly key = this.resolveKey();

  encryptJson(value: unknown) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(value)),
      cipher.final(),
    ]);
    const envelope: EncryptedEnvelope = {
      version: 1,
      algorithm: 'AES-256-GCM',
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    };
    return Buffer.from(JSON.stringify(envelope), 'utf8');
  }

  decryptJson(buffer: Buffer) {
    const envelope = JSON.parse(buffer.toString('utf8')) as EncryptedEnvelope;
    if (envelope.version !== 1 || envelope.algorithm !== 'AES-256-GCM') {
      throw new InternalServerErrorException('Unsupported WhatsApp auth encryption envelope');
    }

    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(envelope.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString('utf8'));
  }

  private resolveKey() {
    const configured = process.env.WHATSAPP_AUTH_ENCRYPTION_KEY?.trim();
    if (configured) {
      const decoded = Buffer.from(configured, 'base64');
      if (decoded.length === 32) return decoded;
      if (configured.length >= 32) return createHash('sha256').update(configured).digest();
    }

    if (process.env.NODE_ENV === 'production') {
      throw new InternalServerErrorException('WHATSAPP_AUTH_ENCRYPTION_KEY must be configured in production');
    }

    return createHash('sha256').update('dev-whatsapp-auth-key-change-me').digest();
  }
}
