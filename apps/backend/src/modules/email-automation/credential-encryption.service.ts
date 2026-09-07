import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

@Injectable()
export class CredentialEncryptionService {
  encrypt(value: unknown) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([Buffer.from('v1:'), iv, tag, encrypted]);
  }

  decrypt<T>(encrypted: Buffer): T {
    const prefix = encrypted.subarray(0, 3).toString('utf8');
    if (prefix !== 'v1:') {
      throw new Error('Unsupported credential format');
    }
    const iv = encrypted.subarray(3, 15);
    const tag = encrypted.subarray(15, 31);
    const ciphertext = encrypted.subarray(31);
    const decipher = createDecipheriv('aes-256-gcm', this.key(), iv);
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')) as T;
  }

  private key() {
    const configured = process.env.EMAIL_CREDENTIAL_ENCRYPTION_KEY?.trim();
    if (configured) {
      const decoded = Buffer.from(configured, 'base64');
      if (decoded.length === 32) return decoded;
    }
    return createHash('sha256').update(process.env.JWT_SECRET ?? 'dev-only-change-me').digest();
  }
}
