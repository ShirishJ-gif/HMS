import { BadRequestException, Injectable } from '@nestjs/common';
import { EmailProviderType } from '@prisma/client';
import { stripHtml } from './provider-utils';
import { EmailProviderListOptions, OAuthConnectionProfile, OAuthEmailProvider, StoredOAuthCredential } from './oauth-provider.types';
import { NormalizedProviderEmail } from '../types';

type GraphMessage = {
  id: string;
  conversationId?: string;
  internetMessageId?: string;
  subject?: string;
  receivedDateTime?: string;
  sentDateTime?: string;
  from?: { emailAddress?: { name?: string; address?: string } };
  toRecipients?: Array<{ emailAddress?: { name?: string; address?: string } }>;
  ccRecipients?: Array<{ emailAddress?: { name?: string; address?: string } }>;
  body?: { contentType?: string; content?: string };
  hasAttachments?: boolean;
};

@Injectable()
export class MicrosoftEmailProvider implements OAuthEmailProvider {
  providerType = EmailProviderType.MICROSOFT;

  buildAuthUrl(state: string) {
    const url = new URL('https://login.microsoftonline.com/common/oauth2/v2.0/authorize');
    url.searchParams.set('client_id', this.requiredEnv('MICROSOFT_CLIENT_ID'));
    url.searchParams.set('redirect_uri', this.redirectUri());
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'offline_access Mail.Read User.Read');
    url.searchParams.set('state', state);
    return url.toString();
  }

  async exchangeCode(code: string) {
    const token = await this.tokenRequest({
      code,
      client_id: this.requiredEnv('MICROSOFT_CLIENT_ID'),
      client_secret: this.requiredEnv('MICROSOFT_CLIENT_SECRET'),
      redirect_uri: this.redirectUri(),
      grant_type: 'authorization_code',
    });
    const credential = this.toCredential(token);
    const me = await this.request<{ id?: string; mail?: string; userPrincipalName?: string }>(credential, 'https://graph.microsoft.com/v1.0/me');
    const emailAddress = (me.mail ?? me.userPrincipalName ?? '').toLowerCase();
    if (!emailAddress) throw new BadRequestException('Microsoft profile did not return an email address');
    return {
      credential,
      profile: { emailAddress, providerAccountId: me.id ?? emailAddress, cursor: new Date().toISOString() } satisfies OAuthConnectionProfile,
    };
  }

  async refreshCredential(credential: StoredOAuthCredential) {
    if (!credential.refresh_token) throw new BadRequestException('Microsoft refresh token missing');
    const token = await this.tokenRequest({
      refresh_token: credential.refresh_token,
      client_id: this.requiredEnv('MICROSOFT_CLIENT_ID'),
      client_secret: this.requiredEnv('MICROSOFT_CLIENT_SECRET'),
      grant_type: 'refresh_token',
    });
    return { ...credential, ...this.toCredential(token), refresh_token: String(token.refresh_token ?? credential.refresh_token) };
  }

  async listMessageIds(credential: StoredOAuthCredential, cursor?: string | null, options?: EmailProviderListOptions) {
    const since = cursor ? new Date(cursor) : new Date(Date.now() - Number(process.env.EMAIL_INITIAL_BACKFILL_HOURS ?? 24) * 60 * 60_000);
    const url = new URL('https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages');
    url.searchParams.set('$top', String(Number(process.env.EMAIL_PROVIDER_SYNC_MAX_MESSAGES ?? 20)));
    url.searchParams.set('$select', 'id,receivedDateTime');
    url.searchParams.set('$orderby', 'receivedDateTime desc');
    const filters = [`receivedDateTime ge ${since.toISOString()}`];
    if (options?.fromEmail?.trim()) {
      filters.push(`from/emailAddress/address eq '${this.escapeOData(options.fromEmail.trim().toLowerCase())}'`);
    }
    if (options?.subject?.trim()) {
      filters.push(`contains(subject,'${this.escapeOData(options.subject.trim())}')`);
    }
    url.searchParams.set('$filter', filters.join(' and '));
    const json = await this.request<{ value?: Array<{ id: string }> }>(credential, url.toString());
    return { ids: (json.value ?? []).map((message) => message.id), nextCursor: new Date().toISOString() };
  }

  async fetchMessage(credential: StoredOAuthCredential, providerMessageId: string): Promise<NormalizedProviderEmail> {
    const message = await this.request<GraphMessage>(
      credential,
      `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(providerMessageId)}?$select=id,conversationId,internetMessageId,subject,receivedDateTime,sentDateTime,from,toRecipients,ccRecipients,body,hasAttachments`,
    );
    const bodyContent = message.body?.content ?? '';
    const isHtml = message.body?.contentType?.toLowerCase() === 'html';
    return {
      providerMessageId: message.id,
      providerThreadId: message.conversationId,
      internetMessageId: message.internetMessageId,
      from: this.address(message.from),
      to: (message.toRecipients ?? []).map((entry) => this.address(entry)),
      cc: (message.ccRecipients ?? []).map((entry) => this.address(entry)),
      subject: message.subject ?? '(no subject)',
      receivedAt: message.receivedDateTime ? new Date(message.receivedDateTime) : new Date(),
      sentAt: message.sentDateTime ? new Date(message.sentDateTime) : undefined,
      plainText: isHtml ? stripHtml(bodyContent) : bodyContent,
      html: isHtml ? bodyContent : undefined,
      attachments: message.hasAttachments ? [{ fileName: 'Provider attachments present' }] : [],
      headers: {},
    };
  }

  private async request<T>(credential: StoredOAuthCredential, url: string): Promise<T> {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${credential.access_token}` } });
    if (!response.ok) throw new BadRequestException(`Microsoft Graph request failed with HTTP ${response.status}`);
    return response.json() as Promise<T>;
  }

  private async tokenRequest(body: Record<string, string>) {
    const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    });
    if (!response.ok) throw new BadRequestException(`Microsoft OAuth token exchange failed with HTTP ${response.status}`);
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

  private address(entry?: { emailAddress?: { name?: string; address?: string } }) {
    return {
      name: entry?.emailAddress?.name,
      email: (entry?.emailAddress?.address ?? 'unknown@example.invalid').toLowerCase(),
    };
  }

  private redirectUri() {
    return `${(process.env.BACKEND_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 3000}`).replace(/\/$/, '')}/integrations/email/microsoft/callback`;
  }

  private requiredEnv(name: string) {
    const value = process.env[name]?.trim();
    if (!value) throw new BadRequestException(`${name} is required for Microsoft OAuth`);
    return value;
  }

  private escapeOData(value: string) {
    return value.replace(/'/g, "''");
  }
}
