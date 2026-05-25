import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { ZodomusAppCredentials } from './zodomus.types';

type HttpMethod = 'GET' | 'POST';

type ZodomusRequestOptions = {
  method?: HttpMethod;
  path: string;
  body?: unknown;
  password?: string;
};

export class ZodomusClient {
  constructor(private readonly credentials: ZodomusAppCredentials) {}

  async getAccount() {
    return this.request({ path: '/account' });
  }

  async getChannels() {
    return this.request({ path: '/channels' });
  }

  async getCurrencies() {
    return this.request({ path: '/currencies' });
  }

  async getPriceModels() {
    return this.request({ path: '/price-model' });
  }

  async getRoomRates(query?: Record<string, string>) {
    const search = new URLSearchParams(query).toString();
    return this.request({
      path: search ? `/room-rates?${search}` : '/room-rates',
    });
  }

  async activateAirbnbHost(body: Record<string, string | number>) {
    return this.request({ method: 'POST', path: '/airbnb-host-activation', body });
  }

  async activateAirbnbOauthTest(body: Record<string, string | number>) {
    return this.request({ method: 'POST', path: '/airbnb-oauth2-tests', body });
  }

  async cancelAirbnbHost(body: Record<string, string | number>) {
    return this.request({ method: 'POST', path: '/airbnb-host-cancellation', body });
  }

  async getAirbnbHostStatus(query?: Record<string, string>) {
    const search = new URLSearchParams(query).toString();
    return this.request({
      path: search ? `/airbnb-host-status?${search}` : '/airbnb-host-status',
    });
  }

  async getAirbnbHostInfo(query?: Record<string, string>) {
    const search = new URLSearchParams(query).toString();
    return this.request({
      path: search ? `/airbnb-host-info?${search}` : '/airbnb-host-info',
    });
  }

  async getAirbnbListings(query?: Record<string, string>) {
    const search = new URLSearchParams(query).toString();
    return this.request({
      path: search ? `/airbnb-listings?${search}` : '/airbnb-listings',
    });
  }

  async checkProperty(body: Record<string, string | number>) {
    return this.request({ method: 'POST', path: '/property-check', body });
  }

  async activateProperty(body: Record<string, string | number>) {
    return this.request({ method: 'POST', path: '/property-activation', body });
  }

  async activateRooms(body: unknown) {
    return this.request({ method: 'POST', path: '/rooms-activation', body });
  }

  async cancelProperty(body: Record<string, string | number>) {
    return this.request({ method: 'POST', path: '/property-cancellation', body });
  }

  async pushAvailability(body: unknown) {
    return this.request({ method: 'POST', path: '/availability', body });
  }

  async getAvailability(query?: Record<string, string>) {
    const search = new URLSearchParams(query).toString();
    return this.request({
      path: search ? `/availability?${search}` : '/availability',
    });
  }

  async pushAvailabilityMultiple(body: unknown) {
    return this.request({ method: 'POST', path: '/availability-multiple', body });
  }

  async pushRates(body: unknown) {
    return this.request({ method: 'POST', path: '/rates', body });
  }

  async pushRatesMultiple(body: unknown) {
    return this.request({ method: 'POST', path: '/rates-multiple', body });
  }

  async pushDerivedRates(body: unknown) {
    return this.request({ method: 'POST', path: '/rates-derived', body });
  }

  async pullReservationQueue(query?: Record<string, string>) {
    const search = new URLSearchParams(query).toString();
    return this.request({
      path: search ? `/reservations-queue?${search}` : '/reservations-queue',
    });
  }

  async getReservation(query?: Record<string, string>) {
    const search = new URLSearchParams(query).toString();
    return this.request({
      path: search ? `/reservations?${search}` : '/reservations',
    });
  }

  async getReservationCC(query?: Record<string, string>) {
    const search = new URLSearchParams(query).toString();
    return this.request({
      path: search ? `/reservations-cc?${search}` : '/reservations-cc',
      password: this.credentials.credit_card_api_password ?? this.credentials.api_password,
    });
  }

  async getReservationsSummary(query?: Record<string, string>) {
    const search = new URLSearchParams(query).toString();
    return this.request({
      path: search ? `/reservations-summary?${search}` : '/reservations-summary',
    });
  }

  async createTestReservation(body: Record<string, string | number>) {
    return this.request({ method: 'POST', path: '/reservations-createtest', body });
  }

  private async request({ method = 'GET', path, body, password }: ZodomusRequestOptions) {
    const response = await fetch(`${this.baseUrl()}${path}`, {
      method,
      headers: this.headers(body !== undefined, password),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    const payload = await this.readResponseBody(response);

    if (!response.ok) {
      throw new BadRequestException(
        `Zodomus ${method} ${path} failed with status ${response.status}.`,
      );
    }

    return payload;
  }

  private headers(hasBody: boolean, password = this.credentials.api_password) {
    const encoded = Buffer.from(
      `${this.credentials.api_user}:${password}`,
      'utf8',
    ).toString('base64');

    return {
      Accept: 'application/json',
      Authorization: `Basic ${encoded}`,
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    };
  }

  private baseUrl() {
    if (this.credentials.environment === 'sandbox') {
      return process.env.ZODOMUS_SANDBOX_BASE_URL?.trim() || 'https://api.zodomus.com';
    }

    return process.env.ZODOMUS_BASE_URL?.trim() || 'https://api.zodomus.com';
  }

  private async readResponseBody(response: Response) {
    const contentType = response.headers.get('content-type') ?? '';

    try {
      if (contentType.includes('application/json')) {
        return (await response.json()) as unknown;
      }

      return await response.text();
    } catch (error) {
      throw new BadGatewayException(
        error instanceof Error ? error.message : 'Failed to parse Zodomus response.',
      );
    }
  }
}
