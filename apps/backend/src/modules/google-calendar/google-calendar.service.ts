import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { AuditAction, GoogleCalendarConnectionStatus } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuthenticatedUser } from '../auth/auth.guard';
import { assertCanAccessProperty } from '../auth/property-scope';
import { CredentialEncryptionService } from '../email-automation/credential-encryption.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateGoogleCalendarBlockDto } from './dto/create-google-calendar-block.dto';

type StoredGoogleCalendarCredential = {
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
  token_type?: string;
  scope?: string;
};

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

type GoogleCalendarListResponse = {
  items?: Array<{
    id: string;
    summary?: string;
    accessRole?: string;
    primary?: boolean;
  }>;
};

type GoogleUserInfoResponse = {
  email?: string;
  sub?: string;
};

type GoogleCalendarEventResponse = {
  id?: string;
  htmlLink?: string;
  summary?: string;
};

type GoogleCalendarEventsResponse = {
  items?: Array<{
    id?: string;
    summary?: string;
    description?: string;
    start?: { date?: string; dateTime?: string };
    end?: { date?: string; dateTime?: string };
    status?: string;
  }>;
};

@Injectable()
export class GoogleCalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credentialEncryptionService: CredentialEncryptionService,
    private readonly auditLogService: AuditLogService,
  ) {}

  getReadiness() {
    return {
      configured: Boolean(this.clientId(false) && this.clientSecret(false)),
      required_scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly openid email',
      redirect_uri: this.redirectUri(),
    };
  }

  async listConnections(propertyId: string, user?: AuthenticatedUser) {
    assertCanAccessProperty(user, propertyId);
    const connections = await this.prisma.googleCalendarConnection.findMany({
      where: { propertyId, status: { not: GoogleCalendarConnectionStatus.DISCONNECTED } },
      orderBy: { createdAt: 'desc' },
    });
    return connections.map((connection) => this.toConnectionResponse(connection));
  }

  async startConnection(propertyId: string, user?: AuthenticatedUser) {
    assertCanAccessProperty(user, propertyId);
    if (!user) throw new BadRequestException('Authenticated user is required');
    this.clientId(true);
    this.clientSecret(true);
    const state = this.signState({
      property_id: propertyId,
      user_id: user.sub,
      exp: Date.now() + 10 * 60_000,
    });
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', this.clientId(true));
    url.searchParams.set('redirect_uri', this.redirectUri());
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('scope', 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly openid email');
    url.searchParams.set('state', state);
    return { auth_url: url.toString(), configured: true };
  }

  async completeConnection(code: string, state: string) {
    const parsedState = this.verifyState(state);
    const property = await this.prisma.property.findUnique({ where: { id: parsedState.property_id } });
    if (!property) throw new NotFoundException('Property not found');

    const credential = await this.exchangeCode(code);
    const refreshed = await this.refreshCredentialIfNeeded(credential);
    const [profile, calendars] = await Promise.all([
      this.fetchUserInfo(refreshed),
      this.fetchCalendars(refreshed),
    ]);
    const writableCalendar = calendars.find((calendar) => calendar.primary && this.canWrite(calendar.accessRole))
      ?? calendars.find((calendar) => this.canWrite(calendar.accessRole));
    if (!writableCalendar) {
      throw new BadRequestException('No writable Google Calendar was found for this account.');
    }

    const connection = await this.prisma.googleCalendarConnection.upsert({
      where: {
        propertyId_calendarId: {
          propertyId: property.id,
          calendarId: writableCalendar.id,
        },
      },
      create: {
        tenantId: property.organizationId,
        propertyId: property.id,
        status: GoogleCalendarConnectionStatus.CONNECTED,
        emailAddress: profile.email ?? 'unknown@example.invalid',
        providerAccountId: profile.sub ?? profile.email ?? null,
        calendarId: writableCalendar.id,
        calendarSummary: writableCalendar.summary ?? writableCalendar.id,
        encryptedCredential: this.credentialEncryptionService.encrypt(refreshed),
        grantedScopes: refreshed.scope,
        lastSuccessAt: new Date(),
      },
      update: {
        status: GoogleCalendarConnectionStatus.CONNECTED,
        emailAddress: profile.email ?? 'unknown@example.invalid',
        providerAccountId: profile.sub ?? profile.email ?? null,
        calendarSummary: writableCalendar.summary ?? writableCalendar.id,
        encryptedCredential: this.credentialEncryptionService.encrypt(refreshed),
        grantedScopes: refreshed.scope,
        lastErrorCode: null,
        lastErrorMessage: null,
        lastSuccessAt: new Date(),
      },
    });

    return {
      connection_id: connection.id,
      property_id: property.id,
      redirect_url: this.frontendRedirectUrl(),
    };
  }

  async listWritableCalendars(propertyId: string, connectionId: string, user?: AuthenticatedUser) {
    const connection = await this.findConnection(propertyId, connectionId, user);
    const credential = await this.readFreshCredential(connection);
    const calendars = await this.fetchCalendars(credential);
    return calendars
      .filter((calendar) => this.canWrite(calendar.accessRole))
      .map((calendar) => ({
        id: calendar.id,
        summary: calendar.summary ?? calendar.id,
        primary: Boolean(calendar.primary),
        access_role: calendar.accessRole ?? null,
        selected: calendar.id === connection.calendarId,
      }));
  }

  async selectCalendar(propertyId: string, connectionId: string, calendarId: string, user?: AuthenticatedUser) {
    const connection = await this.findConnection(propertyId, connectionId, user);
    const credential = await this.readFreshCredential(connection);
    const calendars = await this.fetchCalendars(credential);
    const selected = calendars.find((calendar) => calendar.id === calendarId);
    if (!selected || !this.canWrite(selected.accessRole)) {
      throw new BadRequestException('Select a calendar where this Google account can make changes.');
    }

    const updated = await this.prisma.googleCalendarConnection.update({
      where: { id: connection.id },
      data: {
        calendarId: selected.id,
        calendarSummary: selected.summary ?? selected.id,
        status: GoogleCalendarConnectionStatus.CONNECTED,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
    return this.toConnectionResponse(updated);
  }

  async disconnect(propertyId: string, connectionId: string, user?: AuthenticatedUser) {
    const connection = await this.findConnection(propertyId, connectionId, user);
    const updated = await this.prisma.googleCalendarConnection.update({
      where: { id: connection.id },
      data: { status: GoogleCalendarConnectionStatus.DISCONNECTED },
    });
    await this.auditLogService.record({
      action: AuditAction.UPDATE,
      entityType: 'google_calendar_connection',
      entityId: updated.id,
      propertyId,
      summary: `Disconnected Google Calendar ${updated.calendarSummary ?? updated.calendarId}`,
      metadata: { calendar_id: updated.calendarId, email_address: updated.emailAddress },
      user,
    });
    return { id: updated.id, status: updated.status };
  }

  async createBusyBlock(dto: CreateGoogleCalendarBlockDto, user?: AuthenticatedUser) {
    assertCanAccessProperty(user, dto.property_id);
    const fromDate = this.parseDateOnly(dto.from_date, 'from_date');
    const toDate = this.parseDateOnly(dto.to_date, 'to_date');

    if (toDate < fromDate) {
      throw new BadRequestException('to_date must be on or after from_date');
    }

    const connection = await this.prisma.googleCalendarConnection.findFirst({
      where: {
        propertyId: dto.property_id,
        status: GoogleCalendarConnectionStatus.CONNECTED,
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (!connection) {
      throw new ServiceUnavailableException('Connect Google Calendar for this property before creating Google busy events.');
    }

    const credential = await this.readFreshCredential(connection);
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.calendarId)}/events`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${credential.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary: dto.summary.trim() || 'Blocked by HMS',
          description: dto.description?.trim() || 'Blocked by HMS',
          start: { date: dto.from_date },
          end: { date: this.formatDate(this.addDays(toDate, 1)) },
          transparency: 'opaque',
          status: 'confirmed',
        }),
      },
    );

    const payload = await this.readJson<GoogleCalendarEventResponse & { error?: { message?: string } }>(response);
    if (!response.ok) {
      await this.markConnectionError(connection.id, response.status === 401 ? GoogleCalendarConnectionStatus.REAUTH_REQUIRED : GoogleCalendarConnectionStatus.ERROR, payload.error?.message || `Google Calendar returned HTTP ${response.status}`);
      throw new BadRequestException(payload.error?.message || `Google Calendar returned HTTP ${response.status}`);
    }

    await this.prisma.googleCalendarConnection.update({
      where: { id: connection.id },
      data: { lastSuccessAt: new Date(), lastErrorCode: null, lastErrorMessage: null },
    });

    return {
      calendar_id: connection.calendarId,
      event_id: payload.id ?? null,
      html_link: payload.htmlLink ?? null,
      summary: payload.summary ?? dto.summary,
      busy: true,
    };
  }

  async deleteBusyBlockEvent(input: {
    propertyId: string;
    calendarId?: string | null;
    eventId?: string | null;
    fromDate?: string;
    toDate?: string;
    summary?: string;
  }, user?: AuthenticatedUser) {
    assertCanAccessProperty(user, input.propertyId);

    const connection = await this.prisma.googleCalendarConnection.findFirst({
      where: {
        propertyId: input.propertyId,
        status: GoogleCalendarConnectionStatus.CONNECTED,
        ...(input.calendarId ? { calendarId: input.calendarId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (!connection) {
      return { deleted: false, reason: 'Google Calendar is not connected for this property.' };
    }

    const credential = await this.readFreshCredential(connection);
    const eventId = input.eventId || await this.findMatchingBusyEventId(connection.calendarId, credential.access_token, input);
    if (!eventId) {
      return { deleted: false, reason: 'No matching Google busy event was found.' };
    }

    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${credential.access_token}` },
      },
    );

    if (response.status === 404 || response.status === 410) {
      return { deleted: false, reason: 'Google busy event was already removed.' };
    }

    if (!response.ok) {
      const payload = await this.readJson<{ error?: { message?: string } }>(response);
      await this.markConnectionError(connection.id, response.status === 401 ? GoogleCalendarConnectionStatus.REAUTH_REQUIRED : GoogleCalendarConnectionStatus.ERROR, payload.error?.message || `Google Calendar returned HTTP ${response.status}`);
      throw new BadRequestException(payload.error?.message || `Google Calendar returned HTTP ${response.status}`);
    }

    await this.prisma.googleCalendarConnection.update({
      where: { id: connection.id },
      data: { lastSuccessAt: new Date(), lastErrorCode: null, lastErrorMessage: null },
    });

    return { deleted: true, event_id: eventId, calendar_id: connection.calendarId };
  }

  private async findConnection(propertyId: string, connectionId: string, user?: AuthenticatedUser) {
    assertCanAccessProperty(user, propertyId);
    const connection = await this.prisma.googleCalendarConnection.findFirst({
      where: { id: connectionId, propertyId, status: { not: GoogleCalendarConnectionStatus.DISCONNECTED } },
    });
    if (!connection) throw new NotFoundException('Google Calendar connection not found');
    return connection;
  }

  private async readFreshCredential(connection: { id: string; encryptedCredential: Buffer }) {
    const credential = this.credentialEncryptionService.decrypt<StoredGoogleCalendarCredential>(Buffer.from(connection.encryptedCredential));
    const refreshed = await this.refreshCredentialIfNeeded(credential);
    if (refreshed !== credential) {
      await this.prisma.googleCalendarConnection.update({
        where: { id: connection.id },
        data: { encryptedCredential: this.credentialEncryptionService.encrypt(refreshed), grantedScopes: refreshed.scope },
      });
    }
    return refreshed;
  }

  private async exchangeCode(code: string) {
    const token = await this.tokenRequest({
      code,
      client_id: this.clientId(true),
      client_secret: this.clientSecret(true),
      redirect_uri: this.redirectUri(),
      grant_type: 'authorization_code',
    });
    return this.toCredential(token);
  }

  private async refreshCredentialIfNeeded(credential: StoredGoogleCalendarCredential) {
    if (credential.expires_at && Date.now() < credential.expires_at - 60_000) {
      return credential;
    }
    if (!credential.refresh_token) {
      throw new BadRequestException('Google Calendar refresh token missing. Reconnect Google Calendar.');
    }
    const token = await this.tokenRequest({
      refresh_token: credential.refresh_token,
      client_id: this.clientId(true),
      client_secret: this.clientSecret(true),
      grant_type: 'refresh_token',
    });
    return { ...credential, ...this.toCredential(token), refresh_token: credential.refresh_token };
  }

  private async fetchCalendars(credential: StoredGoogleCalendarCredential) {
    const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: { Authorization: `Bearer ${credential.access_token}` },
    });
    const payload = await this.readJson<GoogleCalendarListResponse & { error?: { message?: string } }>(response);
    if (!response.ok) {
      throw new BadRequestException(payload.error?.message || `Google Calendar list failed with HTTP ${response.status}`);
    }
    return payload.items ?? [];
  }

  private async fetchUserInfo(credential: StoredGoogleCalendarCredential) {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${credential.access_token}` },
    });
    const payload = await this.readJson<GoogleUserInfoResponse>(response);
    if (!response.ok) return {};
    return payload;
  }

  private async findMatchingBusyEventId(
    calendarId: string,
    accessToken: string,
    input: { fromDate?: string; toDate?: string; summary?: string },
  ) {
    if (!input.fromDate || !input.toDate) return null;
    this.parseDateOnly(input.fromDate, 'from_date');
    const toDate = this.parseDateOnly(input.toDate, 'to_date');
    const eventEndDate = this.formatDate(this.addDays(toDate, 1));
    const params = new URLSearchParams({
      singleEvents: 'true',
      showDeleted: 'false',
      timeMin: `${input.fromDate}T00:00:00.000Z`,
      timeMax: `${this.formatDate(this.addDays(toDate, 2))}T00:00:00.000Z`,
      q: input.summary?.trim() || 'Blocked',
    });
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const payload = await this.readJson<GoogleCalendarEventsResponse & { error?: { message?: string } }>(response);
    if (!response.ok) {
      throw new BadRequestException(payload.error?.message || `Google Calendar returned HTTP ${response.status}`);
    }

    const matches = (payload.items ?? []).filter((event) => (
      event.status !== 'cancelled' &&
      event.start?.date === input.fromDate &&
      event.end?.date === eventEndDate &&
      (event.summary ?? '').toLowerCase().includes('blocked')
    ));

    return matches.length === 1 ? matches[0].id ?? null : null;
  }

  private async tokenRequest(body: Record<string, string>) {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    });
    const payload = await this.readJson<GoogleTokenResponse>(response);
    if (!response.ok) {
      throw new BadRequestException(payload.error_description || payload.error || `Google OAuth token exchange failed with HTTP ${response.status}`);
    }
    return payload;
  }

  private toCredential(token: GoogleTokenResponse): StoredGoogleCalendarCredential {
    const expiresIn = typeof token.expires_in === 'number' ? token.expires_in : 3600;
    if (!token.access_token) throw new BadRequestException('Google OAuth did not return an access token');
    return {
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      token_type: token.token_type,
      scope: token.scope,
      expires_at: Date.now() + expiresIn * 1000,
    };
  }

  private verifyState(state: string) {
    try {
      const [encoded, signature] = state.split('.');
      if (!encoded || !signature) throw new Error('Invalid state');
      const expected = this.stateSignature(encoded);
      const signatureBuffer = Buffer.from(signature, 'base64url');
      const expectedBuffer = Buffer.from(expected, 'base64url');
      if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
        throw new Error('Invalid state signature');
      }
      const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
        property_id?: string;
        user_id?: string;
        exp?: number;
      };
      if (!parsed.property_id || !parsed.user_id || !parsed.exp || parsed.exp < Date.now()) {
        throw new Error('Invalid state');
      }
      return { property_id: parsed.property_id, user_id: parsed.user_id };
    } catch {
      throw new BadRequestException('Invalid Google Calendar OAuth state');
    }
  }

  private signState(payload: { property_id: string; user_id: string; exp: number }) {
    const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return `${encoded}.${this.stateSignature(encoded)}`;
  }

  private stateSignature(encoded: string) {
    return createHmac('sha256', process.env.JWT_SECRET ?? 'dev-only-change-me').update(encoded).digest('base64url');
  }

  private canWrite(accessRole?: string) {
    return accessRole === 'owner' || accessRole === 'writer';
  }

  private async markConnectionError(id: string, status: GoogleCalendarConnectionStatus, message: string) {
    await this.prisma.googleCalendarConnection.update({
      where: { id },
      data: {
        status,
        lastErrorCode: status,
        lastErrorMessage: message,
      },
    });
  }

  private parseDateOnly(value: string, field: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException(`${field} must be YYYY-MM-DD`);
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
      throw new BadRequestException(`${field} must be a valid date`);
    }
    return date;
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  private formatDate(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private toConnectionResponse(connection: {
    id: string;
    propertyId: string;
    status: GoogleCalendarConnectionStatus;
    emailAddress: string;
    calendarId: string;
    calendarSummary: string | null;
    lastSuccessAt: Date | null;
    lastErrorMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: connection.id,
      property_id: connection.propertyId,
      status: connection.status,
      email_address: connection.emailAddress,
      calendar_id: connection.calendarId,
      calendar_summary: connection.calendarSummary,
      last_success_at: connection.lastSuccessAt?.toISOString() ?? null,
      last_error_message: connection.lastErrorMessage,
      created_at: connection.createdAt.toISOString(),
      updated_at: connection.updatedAt.toISOString(),
    };
  }

  private async readJson<T>(response: Response): Promise<T> {
    const text = await response.text();
    if (!text.trim()) return {} as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new BadRequestException('Google returned an invalid response.');
    }
  }

  private redirectUri() {
    return `${this.backendBaseUrl()}/google-calendar/callback`;
  }

  private backendBaseUrl() {
    return (process.env.BACKEND_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 3000}`).replace(/\/$/, '');
  }

  private frontendRedirectUrl() {
    return process.env.GOOGLE_CALENDAR_FRONTEND_REDIRECT_URL ?? process.env.FRONTEND_URL ?? 'http://localhost:5173';
  }

  private clientId(required: true): string;
  private clientId(required: false): string | null;
  private clientId(required: boolean) {
    const value = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim() || process.env.GOOGLE_CLIENT_ID?.trim() || '';
    if (!value && required) throw new BadRequestException('GOOGLE_CALENDAR_CLIENT_ID or GOOGLE_CLIENT_ID is required');
    return value || null;
  }

  private clientSecret(required: true): string;
  private clientSecret(required: false): string | null;
  private clientSecret(required: boolean) {
    const value = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim() || process.env.GOOGLE_CLIENT_SECRET?.trim() || '';
    if (!value && required) throw new BadRequestException('GOOGLE_CALENDAR_CLIENT_SECRET or GOOGLE_CLIENT_SECRET is required');
    return value || null;
  }
}
