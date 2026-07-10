import {
  BadGatewayException,
  GatewayTimeoutException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiCallTraceService } from '../../../common/api-call-trace/api-call-trace.service';
import { ZodomusClient } from './zodomus-client';
import { ZodomusAppCredentials } from './zodomus.types';

describe('ZodomusClient', () => {
  const originalEnv = process.env;
  const credentials: ZodomusAppCredentials = {
    api_user: 'test-user',
    api_password: 'test-password',
    environment: 'sandbox',
  };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      ZODOMUS_RETRY_BASE_DELAY_MS: '0',
      ZODOMUS_RETRY_MAX_ATTEMPTS: '3',
      ZODOMUS_REQUEST_TIMEOUT_MS: '1000',
    };
    new ApiCallTraceService().clear();
    jest.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('retries transient provider status codes and returns the successful response', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ status: { returnCode: 503 } }, 503))
      .mockResolvedValueOnce(jsonResponse({ status: { returnCode: 200 }, response: { ok: true } }, 200));

    await expect(new ZodomusClient(credentials).getAccount()).resolves.toEqual({
      status: { returnCode: 200 },
      response: { ok: true },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-transient provider status codes', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ status: { returnCode: 400 } }, 400));

    await expect(new ZodomusClient(credentials).getAccount()).rejects.toBeInstanceOf(BadGatewayException);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns structured provider error details with the active trace id', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ status: { returnCode: 400 } }, 400));
    const client = new ZodomusClient(credentials);

    await new ApiCallTraceService().runWithContext({ requestId: 'trace-123' }, async () => {
      try {
        await client.getAccount();
        throw new Error('Expected Zodomus request to fail');
      } catch (error) {
        expect(error).toBeInstanceOf(BadGatewayException);
        expect((error as HttpException).getResponse()).toEqual({
          message: 'Zodomus provider request failed.',
          provider: 'ZODOMUS',
          endpoint: 'GET /account',
          status_code: 400,
          trace_id: 'trace-123',
          provider_error: 'Zodomus GET /account failed with status 400.',
        });
      }
    });
  });

  it('maps provider rate limits to service unavailable', async () => {
    process.env.ZODOMUS_RETRY_MAX_ATTEMPTS = '1';
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ status: { returnCode: 429 } }, 429));

    await expect(new ZodomusClient(credentials).getAccount()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('maps transport timeouts to gateway timeout', async () => {
    process.env.ZODOMUS_RETRY_MAX_ATTEMPTS = '1';
    const timeoutError = new Error('request timed out');
    timeoutError.name = 'TimeoutError';
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(timeoutError);

    await expect(new ZodomusClient(credentials).getAccount()).rejects.toBeInstanceOf(
      GatewayTimeoutException,
    );
  });

  it('retries transient network failures', async () => {
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('network failure'))
      .mockResolvedValueOnce(jsonResponse({ status: { returnCode: 200 } }, 200));

    await expect(new ZodomusClient(credentials).getChannels()).resolves.toEqual({
      status: { returnCode: 200 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
