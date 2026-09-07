import { EmailConnectionHealth, NormalizedProviderEmail, ProviderSyncResult } from '../types';

export interface EmailProvider {
  providerType: 'GMAIL' | 'MICROSOFT' | 'IMAP' | 'MANUAL';

  connect(connectionId: string): Promise<void>;
  disconnect(connectionId: string): Promise<void>;
  getConnectionHealth(connectionId: string): Promise<EmailConnectionHealth>;
  fetchMessage(connectionId: string, providerMessageId: string): Promise<NormalizedProviderEmail>;
  syncChanges(connectionId: string, cursor?: string | null): Promise<ProviderSyncResult>;
}
