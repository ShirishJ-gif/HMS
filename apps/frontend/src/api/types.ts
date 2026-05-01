export type RoomStatus = 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE';
export type BookingStatus = 'BOOKED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELLED';
export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'STAFF';
export type HousekeepingStatus = 'DIRTY' | 'CLEANING' | 'CLEAN' | 'INSPECTED' | 'OUT_OF_SERVICE';
export type HousekeepingPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
export type PaymentStatus = 'PAID' | 'PARTIAL' | 'PENDING' | 'REFUNDED';
export type PaymentProvider = 'MOCK' | 'CASH' | 'CARD' | 'UPI' | 'RAZORPAY' | 'STRIPE';
export type PaymentTransactionStatus = 'SUCCEEDED' | 'FAILED' | 'REFUNDED';
export type ChannelProvider = 'MOCK' | 'SITEMINDER' | 'BOOKING_COM' | 'AIRBNB';
export type ChannelConnectionStatus = 'ACTIVE' | 'PAUSED' | 'ERROR';
export type ChannelSyncType = 'INVENTORY' | 'RATES' | 'BOOKINGS';
export type ChannelSyncStatus = 'QUEUED' | 'SUCCEEDED' | 'FAILED';
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
  total_bookings_today: number;
  occupancy_rate: number;
  occupied_rooms: number;
  total_rooms: number;
  revenue_today: number;
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
    booked: number;
    available: number;
    lowest_rate: number | null;
    currency: string | null;
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

export type Booking = {
  id: string;
  property_id: string;
  guest_id: string;
  room_category_id: string;
  rate_plan_id: string;
  room_id: string | null;
  check_in_date: string;
  check_out_date: string;
  total_amount: number;
  booking_status: BookingStatus;
  guest: Pick<Guest, 'id' | 'name' | 'phone' | 'email'>;
  property: Pick<Property, 'id' | 'name' | 'code'>;
  room_category: Pick<RoomCategory, 'id' | 'name' | 'code'>;
  rate_plan: Pick<RatePlan, 'id' | 'name' | 'code' | 'base_rate' | 'currency'>;
  room: {
    id: string | null;
    room_number: string | null;
    status: RoomStatus | null;
  };
};

export type HousekeepingTask = {
  id: string;
  property_id: string;
  room_id: string;
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
};

export type Billing = {
  id: string;
  booking_id: string;
  amount: number;
  tax: number;
  extra_charges_total: number;
  paid_total: number;
  refunded_total: number;
  balance_due: number;
  total: number;
  payment_status: PaymentStatus;
  booking: {
    id: string;
    booking_status: BookingStatus;
    property: Pick<Property, 'id' | 'name' | 'code'>;
    guest: Pick<Guest, 'id' | 'name' | 'phone' | 'email'>;
    room_category: Pick<RoomCategory, 'id' | 'name' | 'code'>;
  };
  payments: Array<{
    id: string;
    provider: PaymentProvider;
    provider_reference: string | null;
    amount: number;
    status: PaymentTransactionStatus;
    created_at: string;
  }>;
};

export type PaymentTransaction = {
  id: string;
  billing_id: string;
  provider: PaymentProvider;
  provider_reference: string | null;
  amount: number;
  status: PaymentTransactionStatus;
  booking: {
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
    external_rate_id: string;
    external_rate_name: string | null;
    rate_plan: Pick<RatePlan, 'id' | 'name' | 'code'>;
  }>;
  recent_sync_logs: ChannelSyncLog[];
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
