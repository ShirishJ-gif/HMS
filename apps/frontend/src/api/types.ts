export type RoomStatus = 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE';
export type BookingStatus = 'BOOKED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELLED';
export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'STAFF';
export type HousekeepingStatus = 'DIRTY' | 'CLEANING' | 'CLEAN' | 'INSPECTED' | 'OUT_OF_SERVICE';
export type HousekeepingPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type PaymentStatus = 'PAID' | 'PARTIAL' | 'PENDING' | 'REFUNDED';
export type PaymentProvider = 'MOCK' | 'CASH' | 'CARD' | 'UPI' | 'RAZORPAY' | 'STRIPE';
export type PaymentTransactionStatus = 'SUCCEEDED' | 'FAILED' | 'REFUNDED';
export type ChannelProvider = 'MOCK' | 'ZODOMUS' | 'SITEMINDER' | 'BOOKING_COM' | 'AIRBNB';
export type ChannelConnectionStatus = 'ACTIVE' | 'PAUSED' | 'ERROR';
export type ChannelSyncType = 'INVENTORY' | 'RATES' | 'BOOKINGS';
export type ChannelSyncStatus = 'QUEUED' | 'SUCCEEDED' | 'PARTIAL_FAILED' | 'FAILED';
export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'CHECK_IN'
  | 'CHECK_OUT'
  | 'PAYMENT_COLLECT'
  | 'PAYMENT_REFUND'
  | 'CHANNEL_SYNC';

export type AuthUser = {
  id: string;
  property_id: string | null;
  name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
};

export type AuthResponse = {
  access_token: string;
  refresh_token: string;
  user: AuthUser;
};

export type MediaImage = {
  id: string;
  url: string;
  caption: string | null;
  sort_order: number;
  is_primary: boolean;
  created_at: string;
};

export type Property = {
  id: string;
  name: string;
  code: string;
  phone: string | null;
  email: string | null;
  address: string;
  timezone: string;
  images: MediaImage[];
};

export type RoomCategory = {
  id: string;
  property_id: string;
  name: string;
  code: string;
  description: string | null;
  max_occupancy: number;
  property: Pick<Property, 'id' | 'name' | 'code'>;
  images: MediaImage[];
};

export type RatePlan = {
  id: string;
  property_id: string;
  room_category_id: string;
  name: string;
  code: string;
  base_rate: number;
  currency: string;
  is_active: boolean;
  property: Pick<Property, 'id' | 'name' | 'code'>;
  room_category: Pick<RoomCategory, 'id' | 'name' | 'code'>;
};

export type PricingRuleType = 'WEEKEND' | 'DATE_RANGE' | 'OCCUPANCY';

export type PricingRule = {
  id: string;
  property_id: string;
  rate_plan_id: string;
  name: string;
  type: PricingRuleType;
  adjustment_percent: number;
  start_date: string | null;
  end_date: string | null;
  occupancy_threshold: number | null;
  is_active: boolean;
  property: Pick<Property, 'id' | 'name' | 'code'>;
  rate_plan: Pick<RatePlan, 'id' | 'name' | 'code'> & {
    room_category: Pick<RoomCategory, 'id' | 'name' | 'code'>;
  };
};

export type DashboardSummary = {
  date: string;
  reservation_groups_today: number;
  occupancy_rate: number;
  occupied_rooms: number;
  total_rooms: number;
  revenue_today: number;
  reservation_room_arrivals_today: number;
  reservation_room_departures_today: number;
  active_reservation_groups: number;
  open_housekeeping_tasks: number;
  pending_balance_total: number;
};

export type AvailabilitySummary = {
  property_id: string;
  property_name: string;
  from: string;
  to: string;
  categories: Array<{
    room_category_id: string;
    name: string;
    code: string;
    total_inventory: number;
    out_of_service: number;
    reserved_room_stays: number;
    available: number;
    lowest_rate: number | null;
    currency: string | null;
  }>;
};

export type InventoryCalendarSummary = {
  property_id: string;
  property_name: string;
  from: string;
  to: string;
  categories: Array<{
    room_category_id: string;
    name: string;
    code: string;
    rows: Array<{
      date: string;
      total_rooms: number;
      blocked_rooms: number;
      reserved_rooms: number;
      available_rooms: number;
      stop_sell: boolean;
      min_stay: number | null;
      max_stay: number | null;
    }>;
  }>;
};

export type Room = {
  id: string;
  property_id: string;
  room_category_id: string;
  room_number: string;
  property: Pick<Property, 'id' | 'name' | 'code'>;
  room_category: Pick<RoomCategory, 'id' | 'name' | 'code'>;
  status: RoomStatus;
};

export type RoomOutOfServicePeriod = {
  id: string;
  room_id: string;
  property_id: string;
  from_date: string;
  to_date: string;
  reason: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Guest = {
  id: string;
  property_id: string;
  name: string;
  phone: string;
  email: string | null;
  id_proof: string;
  address: string;
  property?: Pick<Property, 'id' | 'name' | 'code'>;
};

export type ReservationGroup = {
  id: string;
  property_id: string;
  primary_guest_id: string | null;
  channel_connection_id: string | null;
  external_reservation_id: string;
  external_reservation_version: string | null;
  external_status: string | null;
  source: string | null;
  currency: string | null;
  total_amount: number | null;
  reservation_status: BookingStatus;
  remarks: string | null;
  booked_at: string | null;
  modified_at: string | null;
  arrival_date?: string | null;
  departure_date?: string | null;
  import_blocked?: boolean;
  import_error?: string | null;
  created_at: string;
  updated_at: string;
  property: Pick<Property, 'id' | 'name' | 'code'>;
  primary_guest: Pick<Guest, 'id' | 'name' | 'phone' | 'email'> | null;
  rooms: Array<{
    id: string;
    external_room_reservation_id: string;
    external_room_id: string;
    arrival_date: string;
    departure_date: string;
    total_amount: number | null;
    currency: string | null;
    reservation_status: BookingStatus;
    guest_name: string | null;
    adults: number | null;
    children: number | null;
    room_category: Pick<RoomCategory, 'id' | 'name' | 'code'>;
    rate_plan: Pick<RatePlan, 'id' | 'name' | 'code' | 'base_rate' | 'currency'>;
    room: {
      id: string | null;
      room_number: string | null;
      status: RoomStatus | null;
    };
  }>;
};

export type HousekeepingTask = {
  id: string;
  property_id: string;
  room_id: string;
  reservation_room_id: string | null;
  status: HousekeepingStatus;
  priority: HousekeepingPriority;
  notes: string | null;
  due_date: string | null;
  property: Pick<Property, 'id' | 'name' | 'code'>;
  room: {
    id: string;
    room_number: string;
    room_category: Pick<RoomCategory, 'id' | 'name' | 'code'>;
  };
  reservation_room: {
    id: string;
    external_room_reservation_id: string;
    reservation_group_id: string;
    external_reservation_id: string;
  } | null;
};

export type Billing = {
  id: string;
  reservation_room_id: string;
  amount: number;
  tax: number;
  extra_charges_total: number;
  paid_total: number;
  refunded_total: number;
  balance_due: number;
  total: number;
  payment_status: PaymentStatus;
  reservation_room: {
    id: string;
    reservation_group_id: string;
    external_room_reservation_id: string;
    external_reservation_id: string;
    reservation_status: BookingStatus;
    property: Pick<Property, 'id' | 'name' | 'code'>;
    check_in_date: string;
    check_out_date: string;
    guest: {
      id: string | null;
      name: string;
      phone: string | null;
      email: string | null;
    };
    room_category: Pick<RoomCategory, 'id' | 'name' | 'code'>;
    rate_plan: Pick<RatePlan, 'id' | 'name' | 'code' | 'base_rate'>;
    room: {
      id: string | null;
      room_number: string | null;
    };
  };
  extra_charges: Array<{
    id: string;
    description: string;
    amount: number;
    created_at: string;
  }>;
  payments: Array<{
    id: string;
    provider: PaymentProvider;
    provider_reference: string | null;
    amount: number;
    status: PaymentTransactionStatus;
    created_at: string;
  }>;
};

export type ReservationGroupFolio = {
  reservation_group_id: string;
  external_reservation_id: string;
  reservation_status: BookingStatus;
  property: Pick<Property, 'id' | 'name' | 'code'>;
  guest: Pick<Guest, 'id' | 'name' | 'phone' | 'email'> | null;
  room_count: number;
  invoiced_room_count: number;
  total_amount: number;
  billed_total: number;
  paid_total: number;
  refunded_total: number;
  balance_due: number;
  invoices: Billing[];
  rooms: Array<{
    id: string;
    external_room_reservation_id: string;
    arrival_date: string;
    departure_date: string;
    total_amount: number;
    reservation_status: BookingStatus;
    room_category: Pick<RoomCategory, 'id' | 'name' | 'code'>;
    rate_plan: Pick<RatePlan, 'id' | 'name' | 'code'>;
    room: {
      id: string | null;
      room_number: string | null;
    };
    billing_id: string | null;
  }>;
};

export type ReservationGroupPaymentCollection = {
  reservation_group_id: string;
  external_reservation_id: string;
  guest_name: string;
  allocated_total: number;
  remaining_balance: number;
  payments: Array<{
    payment_id: string;
    billing_id: string;
    amount: number;
    provider_reference: string | null;
  }>;
};

export type PaymentTransaction = {
  id: string;
  billing_id: string;
  provider: PaymentProvider;
  provider_reference: string | null;
  amount: number;
  status: PaymentTransactionStatus;
  reservation_room: {
    id: string;
    guest_name: string;
    property_name: string;
  };
  created_at: string;
};

export type ChannelConnection = {
  id: string;
  property_id: string;
  provider: ChannelProvider;
  name: string;
  status: ChannelConnectionStatus;
  external_hotel_id: string | null;
  provider_config_summary: {
    channel_id: string | null;
    ota_name: string | null;
    environment: string | null;
    setup_status: {
      checked: boolean;
      activated: boolean;
      rooms_activated: boolean;
      catalog_loaded: boolean;
      ready: boolean;
      disconnected: boolean;
      checked_at: string | null;
      activated_at: string | null;
      rooms_activated_at: string | null;
      catalog_loaded_at: string | null;
      ready_at: string | null;
      disconnected_at: string | null;
      price_model_id: number | null;
      last_check_message: string | null;
      last_check_code: string | null;
      last_activation_message: string | null;
      last_activation_code: string | null;
      last_rooms_activation_message: string | null;
      last_rooms_activation_code: string | null;
      last_disconnect_message: string | null;
      last_disconnect_code: string | null;
      activated_room_count: number;
      catalog_room_count: number;
      catalog_rate_count: number;
    };
    automation: {
      enabled: boolean;
      inventory_interval_minutes: number;
      rates_interval_minutes: number;
      bookings_interval_minutes: number;
      sync_window_days: number;
    };
  } | null;
  property: Pick<Property, 'id' | 'name' | 'code'>;
  room_mappings: Array<{
    id: string;
    room_category_id: string;
    external_room_id: string;
    external_room_name: string | null;
    room_category: Pick<RoomCategory, 'id' | 'name' | 'code'>;
  }>;
  rate_mappings: Array<{
    id: string;
    rate_plan_id: string;
    external_room_id: string | null;
    external_rate_id: string;
    external_rate_name: string | null;
    rate_plan: Pick<RatePlan, 'id' | 'name' | 'code'>;
  }>;
  recent_sync_logs: ChannelSyncLog[];
  sync_summary: {
    inventory: ChannelSyncState;
    rates: ChannelSyncState;
    bookings: ChannelSyncState;
  };
};

export type ChannelSyncState = {
  last_status: ChannelSyncStatus | null;
  last_synced_at: string | null;
  last_error: string | null;
  next_due_at: string | null;
};

export type ChannelSyncLog = {
  id: string;
  channel_connection_id: string;
  sync_type: ChannelSyncType;
  status: ChannelSyncStatus;
  request_payload: unknown;
  response_payload: unknown;
  error_message: string | null;
  created_at: string;
};

export type InventoryReconciliation = {
  status: 'NO_BASELINE' | 'IN_SYNC' | 'DRIFT_DETECTED';
  message: string | null;
  latest_sync_log_id: string | null;
  latest_synced_at: string | null;
  compared_window: {
    from: string;
    to: string;
  } | null;
  trigger: string | null;
  summary: {
    snapshot_row_count: number;
    current_row_count: number;
    compared_row_count: number;
    unchanged_rows: number;
    drifted_rows: number;
    snapshot_only_rows: number;
    current_only_rows: number;
    total_available_delta: number;
  };
  drift_rows: Array<{
    status: 'DRIFTED' | 'SNAPSHOT_ONLY' | 'CURRENT_ONLY';
    date: string;
    external_room_id: string;
    room_category_id: string | null;
    room_category_code: string | null;
    last_pushed: {
      total_inventory: number;
      out_of_service: number;
      booked: number;
      available: number;
    } | null;
    current_expected: {
      total_inventory: number;
      out_of_service: number;
      booked: number;
      available: number;
    } | null;
    delta: {
      total_inventory: number;
      out_of_service: number;
      booked: number;
      available: number;
    } | null;
  }>;
};

export type InventoryRowResults = {
  summary: {
    total_rows: number;
    failed_rows: number;
    succeeded_rows: number;
    failed_rooms: number;
  };
  recent_failed_rows: Array<{
    id: string;
    channel_sync_log_id: string;
    sync_date: string;
    external_room_id: string;
    available: number;
    error_message: string | null;
    provider_response: unknown;
    created_at: string;
  }>;
  grouped_failures: Array<{
    external_room_id: string;
    failure_count: number;
    last_failed_at: string | null;
    last_failed_date: string | null;
  }>;
};

export type ChannelProviderCatalog = {
  provider: ChannelProvider;
  external_hotel_id: string | null;
  rooms: Array<{
    external_room_id: string;
    external_room_name: string | null;
  }>;
  rates: Array<{
    external_rate_id: string;
    external_rate_name: string | null;
    external_room_id: string | null;
  }>;
  raw_payload: unknown;
};

export type ChannelProviderActionResponse = {
  provider: ChannelProvider;
  external_hotel_id: string | null;
  channel_id?: number;
  price_model_id?: number;
  response?: unknown;
  accepted?: boolean;
  message?: string;
};

export type ZodomusSetupResponse = {
  connection: ChannelConnection;
  catalog: ChannelProviderCatalog;
  setup_status: {
    checked: boolean;
    activated: boolean;
    rooms_activated: boolean;
    catalog_loaded: boolean;
    ready: boolean;
    price_model_id: number;
    ota_name: string;
  };
  provider_responses: {
    account: unknown;
    channels: unknown;
    property_check: unknown;
    activation: unknown;
  };
};

export type ChannelProviderRawResponse = {
  provider: ChannelProvider;
  response?: unknown;
  channel_id?: number;
  external_hotel_id?: string | null;
  reservation_id?: string | null;
  status?: string | null;
};

export type BackgroundJobStatus = 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'DEAD_LETTER';
export type BackgroundJobType = 'WEBHOOK_PROCESS' | 'CHANNEL_SYNC' | 'NOTIFICATION_SEND';

export type BackgroundJob = {
  id: string;
  type: BackgroundJobType;
  status: BackgroundJobStatus;
  property_id: string | null;
  dedupe_key: string | null;
  entity_type: string | null;
  entity_id: string | null;
  attempts: number;
  max_attempts: number;
  run_at: string;
  last_error: string | null;
  completed_at: string | null;
  dead_lettered_at: string | null;
  created_at: string;
  updated_at: string;
};

export type WebhookEventStatus = 'RECEIVED' | 'PROCESSED' | 'FAILED';
export type WebhookDomain = 'PAYMENT' | 'CHANNEL';

export type WebhookEvent = {
  id: string;
  domain: WebhookDomain;
  provider: string;
  property_id: string | null;
  external_event_id: string | null;
  event_type: string;
  dedupe_key: string;
  status: WebhookEventStatus;
  processing_error: string | null;
  duplicate: boolean;
  received_at: string;
  processed_at: string | null;
};

export type MetricsSummary = {
  uptime_seconds: number;
  current: {
    background_jobs: Array<{
      status: BackgroundJobStatus;
      type: BackgroundJobType;
      count: number;
    }>;
    webhook_events: Array<{
      status: WebhookEventStatus;
      domain: WebhookDomain;
      count: number;
    }>;
    channel_sync_logs: Array<{
      status: ChannelSyncStatus;
      sync_type: ChannelSyncType;
      count: number;
    }>;
  };
  timestamp: string;
};

export type AuditLog = {
  id: string;
  property_id: string | null;
  user_id: string | null;
  action: AuditAction;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  metadata: unknown;
  user: Pick<AuthUser, 'id' | 'name' | 'email' | 'role'> | null;
  created_at: string;
};
