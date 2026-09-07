import { BadRequestException, Injectable } from '@nestjs/common';
import { EmailProviderType } from '@prisma/client';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

type OAuthStatePayload = {
  provider: EmailProviderType;
  propertyId: string;
  userId: string;
  exp: number;
  nonce: string;
};

@Injectable()
export class OAuthStateService {
  sign(payload: Omit<OAuthStatePayload, 'exp' | 'nonce'>) {
    const state: OAuthStatePayload = {
      ...payload,
      exp: Date.now() + 10 * 60_000,
      nonce: randomBytes(12).toString('hex'),
    };
    const encoded = Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
    return `${encoded}.${this.signature(encoded)}`;
  }

  verify(value: string, provider: EmailProviderType) {
    const [encoded, signature] = value.split('.');
    if (!encoded || !signature) throw new BadRequestException('Invalid OAuth state');
    const expected = this.signature(encoded);
    if (!this.safeEquals(signature, expected)) throw new BadRequestException('Invalid OAuth state signature');
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as OAuthStatePayload;
    if (payload.provider !== provider) throw new BadRequestException('OAuth state provider mismatch');
    if (payload.exp < Date.now()) throw new BadRequestException('OAuth state expired');
    return payload;
  }

  private signature(value: string) {
    return createHmac('sha256', process.env.JWT_SECRET ?? 'dev-only-change-me').update(value).digest('base64url');
  }

  private safeEquals(left: string, right: string) {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }
}
