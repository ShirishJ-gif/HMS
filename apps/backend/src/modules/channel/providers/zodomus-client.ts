import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { ZodomusAppCredentials } from './zodomus.types';

type HttpMethod = 'GET' | 'POST';

type ZodomusRequestOptions = {
  method?: HttpMethod;
  path: string;
  body?: unknown;
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

  async pushRates(body: unknown) {
    return this.request({ method: 'POST', path: '/rates', body });
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

  async getReservationsSummary(query?: Record<string, string>) {
    const search = new URLSearchParams(query).toString();
    return this.request({
      path: search ? `/reservations-summary?${search}` : '/reservations-summary',
    });
  }

  async createTestReservation(body: Record<string, string | number>) {
    return this.request({ method: 'POST', path: '/reservations-createtest', body });
  }

  private async request({ method = 'GET', path, body }: ZodomusRequestOptions) {
    const response = await fetch(`${this.baseUrl()}${path}`, {
      method,
      headers: this.headers(body !== undefined),
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

  private headers(hasBody: boolean) {
    const encoded = Buffer.from(
      `${this.credentials.api_user}:${this.credentials.api_password}`,
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
