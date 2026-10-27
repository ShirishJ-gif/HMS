import { financialGroupVisibilityWhere } from './financial-scope';

describe('Shared financial booking visibility', () => {
  const originalEnvironment = process.env.ZODOMUS_ENVIRONMENT;
  const originalHistory = process.env.SHOW_DETACHED_OTA_RESERVATION_HISTORY;
  afterEach(() => {
    if (originalEnvironment === undefined) delete process.env.ZODOMUS_ENVIRONMENT;
    else process.env.ZODOMUS_ENVIRONMENT = originalEnvironment;
    if (originalHistory === undefined) delete process.env.SHOW_DETACHED_OTA_RESERVATION_HISTORY;
    else process.env.SHOW_DETACHED_OTA_RESERVATION_HISTORY = originalHistory;
  });
  it('includes manually entered OTA bookings as well as active channel bookings', () => {
    process.env.ZODOMUS_ENVIRONMENT = 'sandbox';
    process.env.SHOW_DETACHED_OTA_RESERVATION_HISTORY = 'false';
    expect(financialGroupVisibilityWhere()).toEqual({ OR: [
      { channelConnection: { is: { status: 'ACTIVE' } } },
      { channelConnectionId: null, source: { in: expect.arrayContaining(['DIRECT', 'WALK_IN', 'AIRBNB', 'BOOKING_COM', 'WEBSITE']) } },
    ] });
  });
  it.each(['production', 'history'])('includes retained OTA history when %s is enabled', mode => {
    process.env.ZODOMUS_ENVIRONMENT = mode === 'production' ? 'production' : 'sandbox';
    process.env.SHOW_DETACHED_OTA_RESERVATION_HISTORY = mode === 'history' ? 'true' : 'false';
    expect(financialGroupVisibilityWhere()).toEqual({});
  });
});
