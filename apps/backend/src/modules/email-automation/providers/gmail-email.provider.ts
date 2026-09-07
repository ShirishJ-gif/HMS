import { BadRequestException, Injectable } from '@nestjs/common';
import { EmailProviderType } from '@prisma/client';
import { decodeBase64Url, stripHtml } from './provider-utils';
import { EmailProviderListOptions, OAuthConnectionProfile, OAuthEmailProvider, StoredOAuthCredential } from './oauth-provider.types';
import { NormalizedProviderEmail } from '../types';

type GmailMessage = {
  id: string;
  threadId?: string;
  internalDate?: string;
  payload?: {
    mimeType?: string;
    body?: { data?: string };
    headers?: Array<{ name: string; value: string }>;
    parts?: GmailMessage['payload'][];
  };
};

@Injectable()
export class GmailEmailProvider implements OAuthEmailProvider {
  providerType = EmailProviderType.GMAIL;

  buildAuthUrl(state: string) {
    const clientId = this.requiredEnv('GOOGLE_CLIENT_ID');
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', this.redirectUri());
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('scope', 'https://www.googleapis.com/auth/gmail.readonly');
    url.searchParams.set('state', state);
    return url.toString();
  }

  async exchangeCode(code: string) {
    const token = await this.tokenRequest({
      code,
      client_id: this.requiredEnv('GOOGLE_CLIENT_ID'),
      client_secret: this.requiredEnv('GOOGLE_CLIENT_SECRET'),
      redirect_uri: this.redirectUri(),
      grant_type: 'authorization_code',
    });
    const credential = this.toCredential(token);
    const profile = await this.fetchProfile(credential);
    return { credential, profile };
  }

  async refreshCredential(credential: StoredOAuthCredential) {
    if (!credential.refresh_token) {
      throw new BadRequestException('Gmail refresh token missing');
    }
    const token = await this.tokenRequest({
      refresh_token: credential.refresh_token,
      client_id: this.requiredEnv('GOOGLE_CLIENT_ID'),
      client_secret: this.requiredEnv('GOOGLE_CLIENT_SECRET'),
      grant_type: 'refresh_token',
    });
    return { ...credential, ...this.toCredential(token), refresh_token: credential.refresh_token };
  }

  async listMessageIds(credential: StoredOAuthCredential, cursor?: string | null, options?: EmailProviderListOptions) {
    const after = cursor ? new Date(cursor) : new Date(Date.now() - this.initialBackfillHours() * 60 * 60_000);
    const scope = this.includeSpam() ? 'in:anywhere -in:trash' : 'in:inbox';
    const filters = [
      options?.fromEmail?.trim() ? `from:${this.quoteQuery(options.fromEmail.trim())}` : null,
      options?.subject?.trim() ? `subject:${this.quoteQuery(options.subject.trim())}` : null,
    ].filter(Boolean);
    const q = [scope, `after:${this.gmailDate(after)}`, ...filters].join(' ');
    const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
    url.searchParams.set('q', q);
    url.searchParams.set('maxResults', String(this.maxMessagesPerSync()));
    const json = await this.request<{ messages?: Array<{ id: string }> }>(credential, url.toString());
    return {
      ids: (json.messages ?? []).map((message) => message.id),
      nextCursor: new Date().toISOString(),
    };
  }

  async fetchMessage(credential: StoredOAuthCredential, providerMessageId: string): Promise<NormalizedProviderEmail> {
    const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${providerMessageId}`);
    url.searchParams.set('format', 'full');
    const message = await this.request<GmailMessage>(credential, url.toString());
    const headers = new Map((message.payload?.headers ?? []).map((header) => [header.name.toLowerCase(), header.value]));
    const body = this.extractBody(message.payload);
    const plainText = body.plainText || stripHtml(body.html) || '';
    return {
      providerMessageId: message.id,
      providerThreadId: message.threadId,
      internetMessageId: headers.get('message-id'),
      from: this.parseAddress(headers.get('from') ?? 'unknown@example.invalid'),
      to: this.parseAddressList(headers.get('to')),
      cc: this.parseAddressList(headers.get('cc')),
      subject: headers.get('subject') ?? '(no subject)',
      receivedAt: message.internalDate ? new Date(Number(message.internalDate)) : new Date(headers.get('date') ?? Date.now()),
      sentAt: headers.get('date') ? new Date(headers.get('date')!) : undefined,
      plainText,
      attachments: [],
      headers: Object.fromEntries(headers),
    };
  }

  private async fetchProfile(credential: StoredOAuthCredential): Promise<OAuthConnectionProfile> {
    const profile = await this.request<{ emailAddress: string; historyId?: string }>(credential, 'https://gmail.googleapis.com/gmail/v1/users/me/profile');
    return {
      emailAddress: profile.emailAddress.toLowerCase(),
      providerAccountId: profile.emailAddress.toLowerCase(),
      cursor: new Date().toISOString(),
    };
  }

  private async request<T>(credential: StoredOAuthCredential, url: string): Promise<T> {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${credential.access_token}` } });
    if (!response.ok) {
      throw new BadRequestException(`Gmail request failed with HTTP ${response.status}`);
    }
    return response.json() as Promise<T>;
  }

  private async tokenRequest(body: Record<string, string>) {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    });
    if (!response.ok) throw new BadRequestException(`Google OAuth token exchange failed with HTTP ${response.status}`);
    return response.json() as Promise<Record<string, unknown>>;
  }

  private toCredential(token: Record<string, unknown>): StoredOAuthCredential {
    const expiresIn = typeof token.expires_in === 'number' ? token.expires_in : 3600;
    return {
      access_token: String(token.access_token),
      refresh_token: token.refresh_token ? String(token.refresh_token) : undefined,
      token_type: token.token_type ? String(token.token_type) : undefined,
      scope: token.scope ? String(token.scope) : undefined,
      expires_at: Date.now() + expiresIn * 1000,
    };
  }

  private extractBody(payload?: GmailMessage['payload']): { plainText?: string; html?: string } {
    if (!payload) return {};
    if (payload.mimeType === 'text/plain' && payload.body?.data) return { plainText: decodeBase64Url(payload.body.data) };
    if (payload.mimeType === 'text/html' && payload.body?.data) return { html: decodeBase64Url(payload.body.data) };
    const merged = { plainText: '', html: '' };
    for (const part of payload.parts ?? []) {
      const body = this.extractBody(part);
      if (body.plainText) merged.plainText += `${body.plainText}\n`;
      if (body.html) merged.html += `${body.html}\n`;
    }
    return { plainText: merged.plainText.trim() || undefined, html: merged.html.trim() || undefined };
  }

  private parseAddress(value: string) {
    const match = value.match(/^(.*?)<([^>]+)>$/);
    return match ? { name: match[1].replace(/"/g, '').trim(), email: match[2].trim().toLowerCase() } : { email: value.trim().toLowerCase() };
  }

  private parseAddressList(value?: string) {
    return value ? value.split(',').map((entry) => this.parseAddress(entry.trim())) : [];
  }

  private gmailDate(date: Date) {
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  }

  private redirectUri() {
    return `${this.backendBaseUrl()}/integrations/email/google/callback`;
  }

  private backendBaseUrl() {
    return (process.env.BACKEND_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 3000}`).replace(/\/$/, '');
  }

  private initialBackfillHours() {
    return Number(process.env.EMAIL_INITIAL_BACKFILL_HOURS ?? 24);
  }

  private maxMessagesPerSync() {
    return Number(process.env.EMAIL_PROVIDER_SYNC_MAX_MESSAGES ?? 20);
  }

  private quoteQuery(value: string) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }

  private includeSpam() {
    return process.env.EMAIL_PROVIDER_INCLUDE_SPAM !== 'false';
  }

  private requiredEnv(name: string) {
    const value = process.env[name]?.trim();
    if (!value) throw new BadRequestException(`${name} is required for Gmail OAuth`);
    return value;
  }
}
