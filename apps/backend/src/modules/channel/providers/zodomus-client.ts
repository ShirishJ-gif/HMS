import {
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ApiCallTraceService,
  redactSensitiveText,
  redactSensitiveUrl,
} from '../../../common/api-call-trace/api-call-trace.service';
import { ZodomusAppCredentials } from './zodomus.types';

type HttpMethod = 'GET' | 'POST';

type ZodomusRequestOptions = {
  method?: HttpMethod;
  path: string;
  body?: unknown;
  password?: string;
};

type ZodomusRequestAttemptResult = {
  response: Response;
  payload: unknown;
};

type ZodomusErrorInput = {
  method: HttpMethod;
  path: string;
  message: string;
  statusCode: number | null;
};

export class ZodomusClient {
  private static readonly retryableStatusCodes = new Set([408, 429, 500, 502, 503, 504]);

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

  async setAirbnbPricingAvailability(body: Record<string, string | number>) {
    return this.request({ method: 'POST', path: '/airbnb-pricing-availability', body });
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

  async cancelRooms(body: unknown) {
    return this.request({ method: 'POST', path: '/rooms-cancellation', body });
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
    let lastError: unknown = null;
    const maxAttempts = this.readMaxAttempts();

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const traceCallId = ApiCallTraceService.startZodomusRequest({ method, path });
      let statusCode: number | null = null;

      try {
        const { response, payload } = await this.sendRequest({ method, path, body, password });
        statusCode = response.status;

        if (!response.ok) {
          const errorMessage = this.providerErrorMessage(method, path, response.status);
          ApiCallTraceService.finishCall(traceCallId, {
            status: 'FAILED',
            statusCode,
            errorMessage,
          });

          if (this.shouldRetryStatus(response.status, attempt, maxAttempts)) {
            await this.waitBeforeRetry(attempt, response);
            continue;
          }

          throw this.createProviderStatusException({
            method,
            path,
            statusCode: response.status,
            message: errorMessage,
          });
        }

        ApiCallTraceService.finishCall(traceCallId, {
          status: 'SUCCEEDED',
          statusCode,
        });
        return payload;
      } catch (error) {
        lastError = error;
        ApiCallTraceService.finishCall(traceCallId, {
          status: 'FAILED',
          statusCode,
          errorMessage: error instanceof Error ? error.message : 'Zodomus request failed.',
        });

        if (!this.shouldRetryError(error, attempt, maxAttempts)) {
          throw this.normalizeTransportException(error, { method, path, statusCode });
        }

        await this.waitBeforeRetry(attempt);
      }
    }

    throw this.normalizeTransportException(lastError, {
      method,
      path,
      statusCode: null,
    });
  }

  private async sendRequest({
    method,
    path,
    body,
    password,
  }: Required<Pick<ZodomusRequestOptions, 'method' | 'path'>> &
    Pick<ZodomusRequestOptions, 'body' | 'password'>): Promise<ZodomusRequestAttemptResult> {
    const response = await fetch(`${this.baseUrl()}${path}`, {
      method,
      headers: this.headers(body !== undefined, password),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(this.readTimeoutMs()),
    });

    return {
      response,
      payload: await this.readResponseBody(response),
    };
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
      throw this.createBadGatewayException({
        method: 'GET',
        path: response.url ? new URL(response.url).pathname : 'unknown',
        statusCode: response.status,
        message: error instanceof Error ? error.message : 'Failed to parse Zodomus response.',
      });
    }
  }

  private shouldRetryStatus(statusCode: number, attempt: number, maxAttempts: number) {
    return attempt < maxAttempts && ZodomusClient.retryableStatusCodes.has(statusCode);
  }

  private shouldRetryError(error: unknown, attempt: number, maxAttempts: number) {
    if (attempt >= maxAttempts) {
      return false;
    }

    if (error instanceof HttpException) {
      return false;
    }

    if (!(error instanceof Error)) {
      return true;
    }

    return (
      error.name === 'AbortError' ||
      error.name === 'TimeoutError' ||
      error.name === 'TypeError' ||
      error.message.toLowerCase().includes('network')
    );
  }

  private async waitBeforeRetry(attempt: number, response?: Response) {
    const retryAfterMs = response ? this.readRetryAfterMs(response) : null;
    const delayMs = retryAfterMs ?? this.retryDelayMs(attempt);
    if (delayMs <= 0) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  private retryDelayMs(attempt: number) {
    const baseDelayMs = this.readPositiveInteger(process.env.ZODOMUS_RETRY_BASE_DELAY_MS, 250);
    const maxDelayMs = this.readPositiveInteger(process.env.ZODOMUS_RETRY_MAX_DELAY_MS, 2000);
    return Math.min(baseDelayMs * 2 ** Math.max(0, attempt - 1), maxDelayMs);
  }

  private readRetryAfterMs(response: Response) {
    const retryAfter = response.headers.get('retry-after')?.trim();
    if (!retryAfter) {
      return null;
    }

    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, this.readPositiveInteger(process.env.ZODOMUS_RETRY_MAX_DELAY_MS, 2000));
    }

    const retryAt = Date.parse(retryAfter);
    if (!Number.isFinite(retryAt)) {
      return null;
    }

    return Math.min(
      Math.max(0, retryAt - Date.now()),
      this.readPositiveInteger(process.env.ZODOMUS_RETRY_MAX_DELAY_MS, 2000),
    );
  }

  private readTimeoutMs() {
    return this.readPositiveInteger(process.env.ZODOMUS_REQUEST_TIMEOUT_MS, 15000);
  }

  private readMaxAttempts() {
    return Math.min(this.readPositiveInteger(process.env.ZODOMUS_RETRY_MAX_ATTEMPTS, 3), 5);
  }

  private readPositiveInteger(value: string | undefined, fallback: number) {
    const parsed = Number.parseInt(value ?? '', 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return fallback;
    }

    return Math.floor(parsed);
  }

  private providerErrorMessage(method: HttpMethod, path: string, statusCode: number) {
    return `Zodomus ${method} ${redactSensitiveUrl(path)} failed with status ${statusCode}.`;
  }

  private createProviderStatusException(input: ZodomusErrorInput) {
    if (input.statusCode === 408) {
      return new GatewayTimeoutException(
        this.zodomusErrorResponse(input, 'Zodomus request timed out.'),
      );
    }

    if (input.statusCode === 429) {
      return new ServiceUnavailableException(
        this.zodomusErrorResponse(input, 'Zodomus rate limit reached. Try again shortly.'),
      );
    }

    return this.createBadGatewayException(input);
  }

  private normalizeTransportException(
    error: unknown,
    input: Pick<ZodomusErrorInput, 'method' | 'path' | 'statusCode'>,
  ) {
    if (error instanceof HttpException) {
      return error;
    }

    const message = error instanceof Error ? error.message : 'Zodomus request failed.';
    if (this.isTimeoutError(error)) {
      return new GatewayTimeoutException(
        this.zodomusErrorResponse(
          {
            ...input,
            message: 'Zodomus request timed out.',
          },
          'Zodomus request timed out.',
        ),
      );
    }

    return this.createBadGatewayException({
      ...input,
      message,
    });
  }

  private createBadGatewayException(input: ZodomusErrorInput) {
    return new BadGatewayException(this.zodomusErrorResponse(input));
  }

  private zodomusErrorResponse(input: ZodomusErrorInput, publicMessage = 'Zodomus provider request failed.') {
    return {
      message: publicMessage,
      provider: 'ZODOMUS',
      endpoint: `${input.method} ${redactSensitiveUrl(input.path)}`,
      status_code: input.statusCode,
      trace_id: ApiCallTraceService.currentTraceId(),
      provider_error: redactSensitiveText(input.message),
    };
  }

  private isTimeoutError(error: unknown) {
    return (
      error instanceof Error &&
      (error.name === 'AbortError' || error.name === 'TimeoutError')
    );
  }
}
