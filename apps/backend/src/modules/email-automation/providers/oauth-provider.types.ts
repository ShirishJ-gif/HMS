import { EmailProviderType } from '@prisma/client';
import { NormalizedProviderEmail } from '../types';

export type StoredOAuthCredential = {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  token_type?: string;
  scope?: string;
};

export type OAuthConnectionProfile = {
  emailAddress: string;
  providerAccountId?: string;
  cursor?: string;
};

export type EmailProviderListOptions = {
  fromEmail?: string | null;
  subject?: string | null;
};

export interface OAuthEmailProvider {
  providerType: EmailProviderType;
  buildAuthUrl(state: string): string;
  exchangeCode(code: string): Promise<{ credential: StoredOAuthCredential; profile: OAuthConnectionProfile }>;
  refreshCredential(credential: StoredOAuthCredential): Promise<StoredOAuthCredential>;
  listMessageIds(credential: StoredOAuthCredential, cursor?: string | null, options?: EmailProviderListOptions): Promise<{ ids: string[]; nextCursor: string }>;
  fetchMessage(credential: StoredOAuthCredential, providerMessageId: string): Promise<NormalizedProviderEmail>;
}
