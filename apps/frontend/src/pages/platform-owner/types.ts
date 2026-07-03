export type PlatformSection =
  | 'platform-overview'
  | 'platform-api-sample'
  | 'platform-api-monitor'
  | 'platform-properties'
  | 'platform-integrations'
  | 'platform-integration-sample'
  | 'platform-users'
  | 'platform-logs';

export type PropertyRef = { id: string; name: string; code: string } | null;

export type PlatformHealth = {
  status: 'ok' | 'degraded';
  service: string;
  environment: string;
  version: string;
  uptime_seconds: number;
  timestamp: string;
  checks: {
    api: { status: 'ok' | 'error' };
    database: { status: 'ok' | 'error'; latency_ms: number | null; message?: string };
    data_queries: {
      status: 'ok' | 'error';
      latency_ms: number;
      properties_checked: number;
      users_checked: number;
      reservations_checked: number;
      channels_checked: number;
    };
  };
  critical_apis: Array<{
    name: string;
    method: string;
    path: string;
    status: 'ok' | 'degraded';
    latency_ms: number | null;
    last_checked_at: string;
  }>;
  integrations: {
    zodomus: {
      status: 'ok' | 'degraded';
      failed_syncs_24h: number;
      webhook_failures_24h: number;
      latest_successful_sync: {
        id: string;
        sync_type: string;
        provider: string;
        channel: string;
        property: PropertyRef;
        created_at: string;
      } | null;
    };
  };
  error_activity_24h: {
    failed_background_jobs: number;
    failed_or_partial_syncs: number;
    webhook_failures: number;
  };
  recent_incidents: Array<{
    id: string;
    area: string;
    severity: 'high' | 'medium' | 'low';
    property: PropertyRef;
    message: string;
    occurred_at: string;
  }>;
  totals: {
    properties: number;
    active_properties: number;
    users: number;
    open_background_jobs: number;
    failed_or_partial_syncs: number;
    webhook_errors: number;
  };
};

export type PlatformProperty = {
  id: string;
  name: string;
  code: string;
  email: string | null;
  phone: string | null;
  timezone: string;
  is_active: boolean;
  updated_at: string;
  counts: {
    users: number;
    rooms: number;
    room_categories: number;
    rate_plans: number;
    reservations: number;
    channels: number;
    background_jobs: number;
    webhook_events: number;
  };
  channels: Array<{ id: string; provider: string; status: string; updated_at: string }>;
};

export type PlatformPropertyDetail = Omit<PlatformProperty, 'channels'> & {
  address: string;
  users: Array<{ id: string; name: string; email: string; role: string; is_active: boolean; updated_at: string }>;
  room_categories: Array<{ id: string; name: string; code: string; max_occupancy: number }>;
  rate_plans: Array<{ id: string; name: string; code: string; base_rate: number; currency: string; is_active: boolean }>;
  channels: Array<{ id: string; provider: string; name: string; status: string; external_hotel_id: string | null; updated_at: string }>;
  room_status: Array<{ status: string; count: number }>;
  reservation_status: Array<{ status: string; count: number }>;
  recent_reservations: Array<{ id: string; external_reservation_id: string; source: string | null; status: string; total_amount: number | null; currency: string | null; updated_at: string }>;
  recent_sync_issues: Array<{ id: string; sync_type: string; status: string; error_message: string | null; channel: { provider: string; name: string }; created_at: string }>;
  recent_jobs: Array<{ id: string; type: string; status: string; attempts: number; last_error: string | null; updated_at: string }>;
  recent_audit_logs: Array<{ id: string; action: string; entity_type: string; summary: string; created_at: string }>;
  api_usage: {
    window: string;
    total_calls: number;
    failed_calls: number;
    average_latency_ms: number | null;
    calls_last_15m: number;
    calls_last_60m: number;
    last_called_at: string | null;
    calls_by_hour: Array<{
      hour: string;
      label: string;
      calls: number;
      failed_calls: number;
      average_latency_ms: number | null;
    }>;
    top_routes: Array<ApiUsageBucket>;
    top_screens: Array<ApiUsageBucket>;
    top_users: Array<ApiUsageBucket>;
    recent_calls: Array<{
      id: string;
      user_email: string | null;
      user_role: string | null;
      screen_name: string | null;
      method: string;
      path: string;
      status: string;
      status_code: number | null;
      duration_ms: number | null;
      started_at: string;
    }>;
  };
};

export type ApiUsageBucket = {
  label: string;
  calls: number;
  failed_calls: number;
  average_latency_ms: number | null;
  last_called_at: string | null;
};

export type PlatformIntegrationSummary = {
  channels: Array<{
    id: string;
    provider: string;
    name: string;
    status: string;
    external_hotel_id: string | null;
    updated_at: string;
    property: PropertyRef;
    counts: { room_mappings: number; rate_mappings: number; sync_logs: number };
  }>;
  recent_sync_issues: Array<{ id: string; sync_type: string; status: string; error_message: string | null; created_at: string; channel: { provider: string; name: string; property: PropertyRef } }>;
  webhook_issues: Array<{ id: string; domain: string; provider: string; event_type: string; processing_error: string | null; received_at: string; property: PropertyRef }>;
};

export type PlatformUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  updated_at: string;
  property: PropertyRef;
};

export type PlatformLogs = {
  jobs: Array<{ id: string; type: string; status: string; attempts: number; last_error: string | null; updated_at: string; property: PropertyRef }>;
  webhooks: Array<{ id: string; domain: string; provider: string; event_type: string; status: string; processing_error: string | null; received_at: string; property: PropertyRef }>;
  audit_logs: Array<{ id: string; action: string; entity_type: string; entity_id: string | null; summary: string; created_at: string; property_id: string | null; user: { name: string; email: string } | null }>;
};

export type PlatformApiTrace = {
  id: string;
  trace_id: string;
  kind: 'SYSTEM' | 'ZODOMUS';
  direction: 'INBOUND' | 'OUTBOUND';
  target: string;
  screen_name: string | null;
  user_email: string | null;
  user_role: string | null;
  property_id: string | null;
  property_ids: string[];
  method: string;
  path: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  status_code: number | null;
  duration_ms: number | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
};

export type IntegrationProviderNode = {
  provider: string;
  status: 'healthy' | 'warning' | 'critical';
  channels: PlatformIntegrationSummary['channels'];
  syncIssues: PlatformIntegrationSummary['recent_sync_issues'];
  webhookIssues: PlatformIntegrationSummary['webhook_issues'];
  activeCount: number;
  mappingIssues: number;
};

export type IntegrationStatus = IntegrationProviderNode['status'];
