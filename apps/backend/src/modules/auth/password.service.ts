import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

@Injectable()
export class PasswordService {
  async hash(password: string) {
    const salt = randomBytes(16).toString('hex');
    const derivedKey = (await scrypt(password, salt, 64)) as Buffer;

    return `scrypt:${salt}:${derivedKey.toString('hex')}`;
  }

  async verify(password: string, passwordHash: string) {
    const [algorithm, salt, storedHash] = passwordHash.split(':');

    if (algorithm !== 'scrypt' || !salt || !storedHash) {
      return false;
    }

    const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
    const storedKey = Buffer.from(storedHash, 'hex');

    return storedKey.length === derivedKey.length && timingSafeEqual(storedKey, derivedKey);
  }
}
