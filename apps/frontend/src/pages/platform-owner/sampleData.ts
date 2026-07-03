import type { PlatformHealth, PlatformIntegrationSummary, PlatformProperty, PlatformPropertyDetail, PropertyRef } from './types';

export const samplePlatformPropertyId = 'sample-platform-mesh-property';
export const sampleTwoChannelPropertyId = 'sample-two-channel-mesh-property';
const sampleNow = new Date().toISOString();

export const samplePlatformHealth: PlatformHealth = {
  status: 'degraded',
  service: 'hms-backend',
  environment: 'production-sample',
  version: 'sample',
  uptime_seconds: 382940,
  timestamp: sampleNow,
  checks: {
    api: { status: 'ok' },
    database: { status: 'ok', latency_ms: 22 },
    data_queries: {
      status: 'ok',
      latency_ms: 48,
      properties_checked: 18,
      users_checked: 126,
      reservations_checked: 1840,
      channels_checked: 43,
    },
  },
  critical_apis: [
    { name: 'Login', method: 'POST', path: '/auth/login', status: 'ok', latency_ms: 96, last_checked_at: sampleNow },
    { name: 'Properties', method: 'GET', path: '/platform-admin/properties', status: 'ok', latency_ms: 144, last_checked_at: sampleNow },
    { name: 'Reservations', method: 'GET', path: '/bookings/groups', status: 'ok', latency_ms: 186, last_checked_at: sampleNow },
    { name: 'Rooms', method: 'GET', path: '/rooms', status: 'ok', latency_ms: 72, last_checked_at: sampleNow },
    { name: 'Channel sync', method: 'POST', path: '/channels/sync', status: 'degraded', latency_ms: 820, last_checked_at: sampleNow },
    { name: 'Webhooks', method: 'POST', path: '/webhooks/zodomus', status: 'degraded', latency_ms: 680, last_checked_at: sampleNow },
  ],
  integrations: {
    zodomus: {
      status: 'degraded',
      failed_syncs_24h: 7,
      webhook_failures_24h: 4,
      latest_successful_sync: {
        id: 'sample-sync-success',
        sync_type: 'reservation_import',
        provider: 'ZODOMUS',
        channel: 'Booking.com OTA',
        property: { id: 'sample-integration-harbour', name: 'Harbour Grand Hotel', code: 'HBR-GRD' },
        created_at: sampleNow,
      },
    },
  },
  error_activity_24h: {
    failed_background_jobs: 3,
    failed_or_partial_syncs: 7,
    webhook_failures: 4,
  },
  recent_incidents: [
    {
      id: 'sample-incident-sync',
      area: 'Channel sync',
      severity: 'high',
      property: { id: 'sample-integration-urban', name: 'Urban Nest Hotel', code: 'URB-NST' },
      message: 'Expedia availability push timed out after retry window.',
      occurred_at: sampleNow,
    },
    {
      id: 'sample-incident-webhook',
      area: 'Webhook',
      severity: 'medium',
      property: { id: 'sample-integration-riverside', name: 'Riverside Suites', code: 'RVR-STE' },
      message: 'Booking.com reservation.modified payload failed validation.',
      occurred_at: sampleNow,
    },
  ],
  totals: {
    properties: 18,
    active_properties: 16,
    users: 126,
    open_background_jobs: 5,
    failed_or_partial_syncs: 7,
    webhook_errors: 4,
  },
};

const samplePlatformProperty: PlatformProperty = {
  id: samplePlatformPropertyId,
  name: 'Sample Mesh Hotel',
  code: 'MESH-DEMO',
  email: 'sample.mesh@hms.local',
  phone: '+1 555 0142',
  timezone: 'Asia/Kolkata',
  is_active: true,
  updated_at: sampleNow,
  counts: {
    users: 4,
    rooms: 42,
    room_categories: 5,
    rate_plans: 7,
    reservations: 18,
    channels: 3,
    background_jobs: 0,
    webhook_events: 12,
  },
  channels: [
    { id: 'sample-channel-booking', provider: 'Booking.com', status: 'ACTIVE', updated_at: sampleNow },
    { id: 'sample-channel-airbnb', provider: 'Airbnb', status: 'ACTIVE', updated_at: sampleNow },
    { id: 'sample-channel-expedia', provider: 'Expedia', status: 'ACTIVE', updated_at: sampleNow },
  ],
};

export const samplePlatformPropertyDetail: PlatformPropertyDetail = {
  ...samplePlatformProperty,
  address: 'Frontend-only sample data',
  users: [
    { id: 'sample-user-owner', name: 'Ava Owner', email: 'ava.owner@sample.local', role: 'ORG_OWNER', is_active: true, updated_at: sampleNow },
    { id: 'sample-user-super', name: 'Noah Admin', email: 'noah.admin@sample.local', role: 'SUPER_ADMIN', is_active: true, updated_at: sampleNow },
    { id: 'sample-user-admin', name: 'Mia Front Desk', email: 'mia.frontdesk@sample.local', role: 'ADMIN', is_active: true, updated_at: sampleNow },
    { id: 'sample-user-staff', name: 'Leo Staff', email: 'leo.staff@sample.local', role: 'STAFF', is_active: true, updated_at: sampleNow },
  ],
  room_categories: [
    { id: 'sample-cat-deluxe', name: 'Deluxe', code: 'DLX', max_occupancy: 2 },
    { id: 'sample-cat-suite', name: 'Suite', code: 'STE', max_occupancy: 4 },
  ],
  rate_plans: [
    { id: 'sample-rate-flex', name: 'Flexible', code: 'FLEX', base_rate: 180, currency: 'USD', is_active: true },
    { id: 'sample-rate-nrf', name: 'Non refundable', code: 'NRF', base_rate: 155, currency: 'USD', is_active: true },
  ],
  channels: [
    { id: 'sample-channel-booking', provider: 'Booking.com', name: 'Booking.com Live', status: 'ACTIVE', external_hotel_id: 'BKG-78420', updated_at: sampleNow },
    { id: 'sample-channel-airbnb', provider: 'Airbnb', name: 'Airbnb Host', status: 'ACTIVE', external_hotel_id: 'AIR-19384', updated_at: sampleNow },
    { id: 'sample-channel-expedia', provider: 'Expedia', name: 'Expedia Partner', status: 'ACTIVE', external_hotel_id: 'EXP-55210', updated_at: sampleNow },
  ],
  room_status: [
    { status: 'AVAILABLE', count: 28 },
    { status: 'OCCUPIED', count: 11 },
    { status: 'MAINTENANCE', count: 3 },
  ],
  reservation_status: [
    { status: 'BOOKED', count: 13 },
    { status: 'CHECKED_IN', count: 4 },
    { status: 'CHECKED_OUT', count: 1 },
  ],
  recent_reservations: [
    { id: 'sample-res-bkg-1', external_reservation_id: 'BKG-10492', source: 'Booking.com', status: 'BOOKED', total_amount: 420, currency: 'USD', updated_at: sampleNow },
    { id: 'sample-res-bkg-2', external_reservation_id: 'BKG-10493', source: 'Booking.com', status: 'CHECKED_IN', total_amount: 260, currency: 'USD', updated_at: sampleNow },
    { id: 'sample-res-bkg-3', external_reservation_id: 'BKG-10494', source: 'Booking.com', status: 'BOOKED', total_amount: 310, currency: 'USD', updated_at: sampleNow },
    { id: 'sample-res-bkg-4', external_reservation_id: 'BKG-10495', source: 'Booking.com', status: 'BOOKED', total_amount: 510, currency: 'USD', updated_at: sampleNow },
    { id: 'sample-res-air-1', external_reservation_id: 'AIR-8821', source: 'Airbnb', status: 'BOOKED', total_amount: 640, currency: 'USD', updated_at: sampleNow },
    { id: 'sample-res-air-2', external_reservation_id: 'AIR-8822', source: 'Airbnb', status: 'CHECKED_IN', total_amount: 390, currency: 'USD', updated_at: sampleNow },
    { id: 'sample-res-air-3', external_reservation_id: 'AIR-8823', source: 'Airbnb', status: 'BOOKED', total_amount: 455, currency: 'USD', updated_at: sampleNow },
    { id: 'sample-res-exp-1', external_reservation_id: 'EXP-7718', source: 'Expedia', status: 'BOOKED', total_amount: 288, currency: 'USD', updated_at: sampleNow },
    { id: 'sample-res-exp-2', external_reservation_id: 'EXP-7719', source: 'Expedia', status: 'BOOKED', total_amount: 315, currency: 'USD', updated_at: sampleNow },
    { id: 'sample-res-exp-3', external_reservation_id: 'EXP-7720', source: 'Expedia', status: 'CHECKED_IN', total_amount: 720, currency: 'USD', updated_at: sampleNow },
    { id: 'sample-res-dir-1', external_reservation_id: 'DIR-5011', source: 'Direct', status: 'BOOKED', total_amount: 210, currency: 'USD', updated_at: sampleNow },
    { id: 'sample-res-dir-2', external_reservation_id: 'DIR-5012', source: 'Direct', status: 'CHECKED_IN', total_amount: 340, currency: 'USD', updated_at: sampleNow },
    { id: 'sample-res-dir-3', external_reservation_id: 'DIR-5013', source: 'Direct', status: 'BOOKED', total_amount: 290, currency: 'USD', updated_at: sampleNow },
  ],
  recent_sync_issues: [],
  recent_jobs: [],
  recent_audit_logs: [],
  api_usage: {
    window: 'sample',
    total_calls: 86,
    failed_calls: 2,
    average_latency_ms: 118,
    calls_last_15m: 12,
    calls_last_60m: 33,
    last_called_at: sampleNow,
    calls_by_hour: Array.from({ length: 24 }, (_, index) => ({
      hour: new Date(Date.now() - (23 - index) * 60 * 60 * 1000).toISOString(),
      label: `${index}`,
      calls: [2, 4, 1, 0, 3, 5, 8, 12, 9, 6, 4, 7][index % 12],
      failed_calls: index % 11 === 0 ? 1 : 0,
      average_latency_ms: 90 + (index % 5) * 18,
    })),
    top_routes: [],
    top_screens: [],
    top_users: [],
    recent_calls: [],
  },
};

const sampleTwoChannelProperty: PlatformProperty = {
  ...samplePlatformProperty,
  id: sampleTwoChannelPropertyId,
  name: 'Sample Two Channel Hotel',
  code: 'MESH-2CH',
  email: 'sample.twochannel@hms.local',
  counts: {
    ...samplePlatformProperty.counts,
    channels: 2,
    reservations: 10,
  },
  channels: [
    { id: 'sample-two-channel-booking', provider: 'Booking.com', status: 'ACTIVE', updated_at: sampleNow },
    { id: 'sample-two-channel-airbnb', provider: 'Airbnb', status: 'ACTIVE', updated_at: sampleNow },
  ],
};

export const sampleTwoChannelPropertyDetail: PlatformPropertyDetail = {
  ...samplePlatformPropertyDetail,
  ...sampleTwoChannelProperty,
  address: 'Frontend-only two-connection sample data',
  channels: [
    { id: 'sample-two-channel-booking', provider: 'Booking.com', name: 'Booking.com Live', status: 'ACTIVE', external_hotel_id: 'BKG-2CH', updated_at: sampleNow },
    { id: 'sample-two-channel-airbnb', provider: 'Airbnb', name: 'Airbnb Host', status: 'ACTIVE', external_hotel_id: 'AIR-2CH', updated_at: sampleNow },
  ],
  recent_reservations: [
    { id: 'sample-two-res-bkg-1', external_reservation_id: 'BKG-2101', source: 'Booking.com', status: 'BOOKED', total_amount: 420, currency: 'USD', updated_at: sampleNow },
    { id: 'sample-two-res-bkg-2', external_reservation_id: 'BKG-2102', source: 'Booking.com', status: 'CHECKED_IN', total_amount: 260, currency: 'USD', updated_at: sampleNow },
    { id: 'sample-two-res-bkg-3', external_reservation_id: 'BKG-2103', source: 'Booking.com', status: 'BOOKED', total_amount: 310, currency: 'USD', updated_at: sampleNow },
    { id: 'sample-two-res-bkg-4', external_reservation_id: 'BKG-2104', source: 'Booking.com', status: 'BOOKED', total_amount: 510, currency: 'USD', updated_at: sampleNow },
    { id: 'sample-two-res-air-1', external_reservation_id: 'AIR-2201', source: 'Airbnb', status: 'BOOKED', total_amount: 640, currency: 'USD', updated_at: sampleNow },
    { id: 'sample-two-res-air-2', external_reservation_id: 'AIR-2202', source: 'Airbnb', status: 'CHECKED_IN', total_amount: 390, currency: 'USD', updated_at: sampleNow },
    { id: 'sample-two-res-air-3', external_reservation_id: 'AIR-2203', source: 'Airbnb', status: 'BOOKED', total_amount: 455, currency: 'USD', updated_at: sampleNow },
    { id: 'sample-two-res-air-4', external_reservation_id: 'AIR-2204', source: 'Airbnb', status: 'BOOKED', total_amount: 520, currency: 'USD', updated_at: sampleNow },
    { id: 'sample-two-res-dir-1', external_reservation_id: 'DIR-2301', source: 'Direct', status: 'BOOKED', total_amount: 210, currency: 'USD', updated_at: sampleNow },
    { id: 'sample-two-res-dir-2', external_reservation_id: 'DIR-2302', source: 'Direct', status: 'CHECKED_IN', total_amount: 340, currency: 'USD', updated_at: sampleNow },
  ],
};

export const integrationSampleProperties: PlatformProperty[] = [
  {
    id: 'sample-integration-harbour',
    name: 'Harbour Grand Hotel',
    code: 'HBR-GRD',
    email: 'ops.harbour@example.local',
    phone: '+1 555 0101',
    timezone: 'Asia/Kolkata',
    is_active: true,
    updated_at: sampleNow,
    counts: { users: 7, rooms: 86, room_categories: 6, rate_plans: 9, reservations: 44, channels: 3, background_jobs: 0, webhook_events: 24 },
    channels: [],
  },
  {
    id: 'sample-integration-riverside',
    name: 'Riverside Suites',
    code: 'RVR-STE',
    email: 'ops.riverside@example.local',
    phone: '+1 555 0102',
    timezone: 'Asia/Kolkata',
    is_active: true,
    updated_at: sampleNow,
    counts: { users: 5, rooms: 48, room_categories: 4, rate_plans: 6, reservations: 28, channels: 2, background_jobs: 1, webhook_events: 18 },
    channels: [],
  },
  {
    id: 'sample-integration-skyline',
    name: 'Skyline Residency',
    code: 'SKY-RES',
    email: 'ops.skyline@example.local',
    phone: '+1 555 0103',
    timezone: 'Asia/Kolkata',
    is_active: true,
    updated_at: sampleNow,
    counts: { users: 4, rooms: 36, room_categories: 3, rate_plans: 5, reservations: 19, channels: 3, background_jobs: 0, webhook_events: 11 },
    channels: [],
  },
  {
    id: 'sample-integration-palm',
    name: 'Palm Court Inn',
    code: 'PLM-CRT',
    email: 'ops.palm@example.local',
    phone: '+1 555 0104',
    timezone: 'Asia/Kolkata',
    is_active: true,
    updated_at: sampleNow,
    counts: { users: 3, rooms: 24, room_categories: 3, rate_plans: 4, reservations: 12, channels: 2, background_jobs: 0, webhook_events: 7 },
    channels: [],
  },
  {
    id: 'sample-integration-urban',
    name: 'Urban Nest Hotel',
    code: 'URB-NST',
    email: 'ops.urban@example.local',
    phone: '+1 555 0105',
    timezone: 'Asia/Kolkata',
    is_active: true,
    updated_at: sampleNow,
    counts: { users: 6, rooms: 58, room_categories: 5, rate_plans: 8, reservations: 31, channels: 4, background_jobs: 2, webhook_events: 20 },
    channels: [],
  },
  {
    id: 'sample-integration-lake',
    name: 'Lakeview Retreat',
    code: 'LKV-RET',
    email: 'ops.lake@example.local',
    phone: '+1 555 0106',
    timezone: 'Asia/Kolkata',
    is_active: true,
    updated_at: sampleNow,
    counts: { users: 4, rooms: 32, room_categories: 4, rate_plans: 5, reservations: 16, channels: 2, background_jobs: 0, webhook_events: 9 },
    channels: [],
  },
];

const integrationSamplePropertyRefs = Object.fromEntries(
  integrationSampleProperties.map((property) => [property.id, { id: property.id, name: property.name, code: property.code }]),
) as Record<string, NonNullable<PropertyRef>>;

export const sampleIntegrationSummary: PlatformIntegrationSummary = {
  channels: [
    sampleIntegrationChannel('sample-int-1', 'ZODOMUS', 'Booking.com OTA', 'ACTIVE', 'BKG-HBR-1001', 'sample-integration-harbour', 12, 15, 48),
    sampleIntegrationChannel('sample-int-2', 'ZODOMUS', 'Booking.com OTA', 'ACTIVE', 'BKG-RVR-2044', 'sample-integration-riverside', 8, 10, 31),
    sampleIntegrationChannel('sample-int-3', 'ZODOMUS', 'Booking.com OTA', 'ACTIVE', 'BKG-URB-4410', 'sample-integration-urban', 0, 7, 22),
    sampleIntegrationChannel('sample-int-4', 'ZODOMUS', 'Airbnb Host Sync', 'ACTIVE', 'AIR-HBR-8842', 'sample-integration-harbour', 6, 6, 19),
    sampleIntegrationChannel('sample-int-5', 'ZODOMUS', 'Airbnb Host Sync', 'ACTIVE', 'AIR-SKY-2221', 'sample-integration-skyline', 5, 5, 14),
    sampleIntegrationChannel('sample-int-6', 'ZODOMUS', 'Airbnb Host Sync', 'ACTIVE', 'AIR-LKV-3109', 'sample-integration-lake', 4, 0, 11),
    sampleIntegrationChannel('sample-int-7', 'ZODOMUS', 'Expedia Partner Central', 'ACTIVE', 'EXP-HBR-7401', 'sample-integration-harbour', 12, 13, 27),
    sampleIntegrationChannel('sample-int-8', 'ZODOMUS', 'Expedia Partner Central', 'INACTIVE', 'EXP-URB-9002', 'sample-integration-urban', 7, 8, 8),
    sampleIntegrationChannel('sample-int-9', 'ZODOMUS', 'Expedia Partner Central', 'ACTIVE', 'EXP-PLM-3310', 'sample-integration-palm', 4, 4, 12),
  ],
  recent_sync_issues: [
    {
      id: 'sample-sync-airbnb-lake',
      sync_type: 'reservation_import',
      status: 'FAILED',
      error_message: 'Airbnb reservation payload rejected because guest phone is missing.',
      created_at: sampleNow,
      channel: { provider: 'ZODOMUS', name: 'Airbnb Host Sync', property: integrationSamplePropertyRefs['sample-integration-lake'] },
    },
    {
      id: 'sample-sync-expedia-urban',
      sync_type: 'availability_push',
      status: 'FAILED',
      error_message: 'Expedia endpoint returned 503 after retry window.',
      created_at: sampleNow,
      channel: { provider: 'ZODOMUS', name: 'Expedia Partner Central', property: integrationSamplePropertyRefs['sample-integration-urban'] },
    },
  ],
  webhook_issues: [
    {
      id: 'sample-webhook-booking-riverside',
      domain: 'booking',
      provider: 'Booking.com',
      event_type: 'reservation.modified',
      processing_error: 'Room type code BKG-DLX is not mapped for Riverside Suites.',
      received_at: sampleNow,
      property: integrationSamplePropertyRefs['sample-integration-riverside'],
    },
  ],
};

function sampleIntegrationChannel(
  id: string,
  provider: string,
  name: string,
  status: string,
  externalHotelId: string,
  propertyId: keyof typeof integrationSamplePropertyRefs,
  roomMappings: number,
  rateMappings: number,
  syncLogs: number,
): PlatformIntegrationSummary['channels'][number] {
  return {
    id,
    provider,
    name,
    status,
    external_hotel_id: externalHotelId,
    updated_at: sampleNow,
    property: integrationSamplePropertyRefs[propertyId],
    counts: {
      room_mappings: roomMappings,
      rate_mappings: rateMappings,
      sync_logs: syncLogs,
    },
  };
}


export function withSamplePlatformProperty(properties: PlatformProperty[]) {
  const existingIds = new Set(properties.map((property) => property.id));
  return [
    ...properties,
    ...(existingIds.has(samplePlatformPropertyId) ? [] : [samplePlatformProperty]),
    ...(existingIds.has(sampleTwoChannelPropertyId) ? [] : [sampleTwoChannelProperty]),
  ];
}
