import { ApiCallTraceService, redactSensitiveText, redactSensitiveUrl } from './api-call-trace.service';

describe('ApiCallTraceService', () => {
  const service = new ApiCallTraceService();

  beforeEach(() => {
    service.clear();
  });

  afterAll(() => {
    service.clear();
  });

  it('redacts sensitive query parameters before storing paths', () => {
    service.runWithContext({ requestId: 'trace-redaction' }, () => {
      service.startSystemRequest({
        method: 'GET',
        path: '/channels/connection/airbnb-host-status?token=provider-secret&from=2026-07-10',
        screenName: 'Channels',
      });
    });

    expect(service.list({ limit: 1 })[0].path).toBe(
      '/channels/connection/airbnb-host-status?token=%5BREDACTED%5D&from=2026-07-10',
    );
  });

  it('lists and clears only records within the requested property scope', () => {
    recordForProperty('trace-property-a', 'property-a');
    recordForProperty('trace-property-b', 'property-b');

    expect(service.list({ propertyIds: ['property-a'] }).map((record) => record.trace_id)).toEqual([
      'trace-property-a',
    ]);
    expect(service.clear(['property-a'])).toBe(1);
    expect(service.list().map((record) => record.trace_id)).toEqual(['trace-property-b']);
  });

  it('removes fragments and redacts common credential parameter names', () => {
    expect(redactSensitiveUrl('/callback?api_key=value&code=oauth-code#token-fragment')).toBe(
      '/callback?api_key=%5BREDACTED%5D&code=%5BREDACTED%5D',
    );
    expect(redactSensitiveText('Provider GET /resource?token=secret-value&limit=50 failed')).toBe(
      'Provider GET /resource?token=[REDACTED]&limit=50 failed',
    );
  });

  function recordForProperty(requestId: string, propertyId: string) {
    service.runWithContext({ requestId }, () => {
      const callId = service.startSystemRequest({ method: 'GET', path: '/rooms', screenName: 'Rooms' });
      service.attachAuthenticatedUser({
        userId: `user-${propertyId}`,
        userEmail: `${propertyId}@example.test`,
        userRole: 'ADMIN',
        propertyId,
      });
      service.finishCall(callId, { status: 'SUCCEEDED', statusCode: 200 });
    });
  }
});
