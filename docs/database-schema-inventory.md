# Database Schema Inventory

Source: `apps/backend/prisma/schema.prisma`.

The retired WhatsApp integration's four tables and enum types are removed by migration `20260924120000_remove_whatsapp`.

This is a readable map of all database tables and columns. It also explains where Zodomus data lives so you can remove it without accidentally damaging unrelated HMS data.

## Zodomus Removal Notes

There are no dedicated database tables named `zodomus`.

Zodomus mainly lives in these places:

| Area | Table/column | What it means |
|---|---|---|
| Main connection | `channel_connections.provider = ZODOMUS` | One row per Zodomus channel connection |
| Room mapping | `channel_room_mappings.channel_connection_id` | Provider room IDs mapped to HMS room categories |
| Rate mapping | `channel_rate_mappings.channel_connection_id` | Provider rate IDs mapped to HMS rate plans |
| Sync logs | `channel_sync_logs.channel_connection_id` | Inventory/rate/booking sync attempts |
| Sync row details | `inventory_sync_rows.channel_connection_id` | Per-room/date provider sync results |
| Reservation intake | `provider_reservation_intake_records.channel_connection_id` | Raw fetched provider booking payloads |
| Imported booking link | `reservation_groups.channel_connection_id` | Imported reservations linked back to the channel |
| Imported external IDs | `reservation_groups.external_reservation_id`, `reservation_rooms.external_room_id` | Provider identifiers stored on imported bookings |
| Webhooks | `webhook_events.provider` | Plain text provider name, often `zodomus` |
| Background jobs | `background_jobs.payload` | May contain queued Zodomus work |

Important behavior:

- Deleting a `channel_connections` row cascades to mapping rows, sync logs, inventory sync rows, and provider intake records.
- Imported `reservation_groups` are not deleted when a channel connection is deleted. Their `channel_connection_id` becomes null.
- Old webhook/audit/background records may still mention Zodomus in JSON or text fields.
- Do not remove `ZODOMUS` from the Prisma enum until no `channel_connections` rows use it.

Pre-removal SQL checks:

```sql
select id, property_id, name, status, external_hotel_id
from channel_connections
where provider = 'ZODOMUS';

select count(*) from reservation_groups
where channel_connection_id in (select id from channel_connections where provider = 'ZODOMUS');

select count(*) from webhook_events
where lower(provider) = 'zodomus';
```

## Enums

### RoomStatus

- `AVAILABLE`
- `OCCUPIED`
- `MAINTENANCE`

### BookingStatus

- `BOOKED`
- `CHECKED_IN`
- `CHECKED_OUT`
- `CANCELLED`

### PaymentStatus

- `PAID`
- `PARTIAL`
- `PENDING`
- `REFUNDED`

### UserRole

- `PLATFORM_OWNER`
- `ORG_OWNER`
- `SUPER_ADMIN`
- `ADMIN`
- `STAFF`

### HousekeepingStatus

- `DIRTY`
- `CLEANING`
- `CLEAN`
- `INSPECTED`
- `OUT_OF_SERVICE`

### HousekeepingPriority

- `LOW`
- `NORMAL`
- `HIGH`
- `URGENT`

### PaymentProvider

- `MOCK`
- `CASH`
- `CARD`
- `UPI`
- `RAZORPAY`
- `STRIPE`

### PaymentTransactionStatus

- `SUCCEEDED`
- `FAILED`
- `REFUNDED`

### ChannelProvider

- `MOCK`
- `ZODOMUS`
- `SITEMINDER`
- `BOOKING_COM`
- `AIRBNB`

### ChannelConnectionStatus

- `ACTIVE`
- `PAUSED`
- `ERROR`

### ChannelSyncType

- `INVENTORY`
- `RATES`
- `BOOKINGS`

### ChannelSyncStatus

- `QUEUED`
- `SUCCEEDED`
- `PARTIAL_FAILED`
- `FAILED`

### InventorySyncRowStatus

- `SUCCEEDED`
- `FAILED`

### ProviderReservationIntakeStatus

- `FETCHED`
- `IMPORTED`
- `FAILED`
- `SKIPPED`

### WebhookDomain

- `PAYMENT`
- `CHANNEL`

### WebhookEventStatus

- `RECEIVED`
- `PROCESSED`
- `FAILED`

### BackgroundJobType

- `WEBHOOK_PROCESS`
- `CHANNEL_SYNC`
- `NOTIFICATION_SEND`

### BackgroundJobStatus

- `PENDING`
- `PROCESSING`
- `SUCCEEDED`
- `DEAD_LETTER`

### PricingRuleType

- `WEEKEND`
- `DATE_RANGE`
- `OCCUPANCY`

### AuditAction

- `CREATE`
- `UPDATE`
- `DELETE`
- `CHECK_IN`
- `CHECK_OUT`
- `PAYMENT_COLLECT`
- `PAYMENT_REFUND`
- `CHANNEL_SYNC`

### EmailProviderType

- `GMAIL`
- `MICROSOFT`
- `IMAP`
- `MANUAL`

### EmailConnectionStatus

- `CONNECTING`
- `CONNECTED`
- `REAUTH_REQUIRED`
- `RECONNECTING`
- `ERROR`
- `DISCONNECTED`

### GoogleCalendarConnectionStatus

- `CONNECTED`
- `ERROR`
- `REAUTH_REQUIRED`
- `DISCONNECTED`

### IncomingEmailStatus

- `RECEIVED`
- `QUEUED`
- `PROCESSING`
- `PROCESSED`
- `NEEDS_REVIEW`
- `IGNORED`
- `FAILED`

### EmailCategory

- `BOOKING_CONFIRMATION`
- `BOOKING_MODIFICATION`
- `BOOKING_CANCELLATION`
- `BOOKING_ENQUIRY`
- `PAYMENT_NOTIFICATION`
- `OTA_MESSAGE`
- `GUEST_MESSAGE`
- `OFFER`
- `PROMOTION`
- `GENERAL`
- `UNKNOWN`

### EmailSource

- `BOOKING_COM`
- `AIRBNB`
- `EXPEDIA`
- `MAKEMYTRIP`
- `GOIBIBO`
- `AGODA`
- `WEBSITE`
- `DIRECT_GUEST`
- `OTHER`
- `UNKNOWN`

### ParserType

- `DETERMINISTIC`
- `AI`
- `MANUAL`

### AutomationDecision

- `CREATE_RESERVATION`
- `UPDATE_RESERVATION`
- `CANCEL_RESERVATION`
- `CREATE_ENQUIRY`
- `ATTACH_TO_RESERVATION`
- `REVIEW`
- `IGNORE`
- `NO_ACTION`

## Tables

### guests

Prisma model: `Guest`

| Column | Field | Type | DB type | Required | Notes |
|---|---|---|---|---|---|
| `id` | `id` | `String` | `Uuid` | Yes | primary key, default uuid( |
| `property_id` | `propertyId` | `String` | `Uuid` | Yes | - |
| `name` | `name` | `String` | `VarChar(120)` | Yes | - |
| `phone` | `phone` | `String` | `VarChar(30)` | Yes | - |
| `email` | `email` | `String?` | `VarChar(160)` | No | - |
| `id_proof` | `idProof` | `String` | `VarChar(120)` | Yes | - |
| `address` | `address` | `String` | `Text` | Yes | - |
| `created_at` | `createdAt` | `DateTime` | - | Yes | default now( |
| `updated_at` | `updatedAt` | `DateTime` | - | Yes | auto updated |

Constraints/indexes:
- `@@index([propertyId])`
- `@@index([phone])`
- `@@index([email])`
- `@@map("guests")`

Relations:
- `property -> Property`
- `reservationGroups -> ReservationGroup[]`

### organizations

Prisma model: `Organization`

| Column | Field | Type | DB type | Required | Notes |
|---|---|---|---|---|---|
| `id` | `id` | `String` | `Uuid` | Yes | primary key, default uuid( |
| `name` | `name` | `String` | `VarChar(160)` | Yes | - |
| `status` | `status` | `String` | `VarChar(40)` | Yes | default "ACTIVE" |
| `billing_email` | `billingEmail` | `String?` | `VarChar(160)` | No | - |
| `created_at` | `createdAt` | `DateTime` | - | Yes | default now( |
| `updated_at` | `updatedAt` | `DateTime` | - | Yes | auto updated |

Constraints/indexes:
- `@@index([status])`
- `@@map("organizations")`

Relations:
- `properties -> Property[]`
- `users -> User[]`

### properties

Prisma model: `Property`

| Column | Field | Type | DB type | Required | Notes |
|---|---|---|---|---|---|
| `id` | `id` | `String` | `Uuid` | Yes | primary key, default uuid( |
| `organization_id` | `organizationId` | `String?` | `Uuid` | No | - |
| `name` | `name` | `String` | `VarChar(160)` | Yes | - |
| `code` | `code` | `String` | `VarChar(40)` | Yes | unique |
| `phone` | `phone` | `String?` | `VarChar(30)` | No | - |
| `email` | `email` | `String?` | `VarChar(160)` | No | - |
| `address` | `address` | `String` | `Text` | Yes | - |
| `timezone` | `timezone` | `String` | `VarChar(80)` | Yes | default "Asia/Kolkata" |
| `default_check_in_time` | `defaultCheckInTime` | `String` | `VarChar(5)` | Yes | default "12:00" |
| `default_check_out_time` | `defaultCheckOutTime` | `String` | `VarChar(5)` | Yes | default "11:00" |
| `is_active` | `isActive` | `Boolean` | - | Yes | default true |
| `created_at` | `createdAt` | `DateTime` | - | Yes | default now( |
| `updated_at` | `updatedAt` | `DateTime` | - | Yes | auto updated |

Constraints/indexes:
- `@@index([organizationId])`
- `@@index([isActive])`
- `@@map("properties")`

Relations:
- `organization -> Organization`
- `guests -> Guest[]`
- `roomCategories -> RoomCategory[]`
- `ratePlans -> RatePlan[]`
- `rooms -> Room[]`
- `roomOutOfServicePeriods -> RoomOutOfServicePeriod[]`
- `reservationGroups -> ReservationGroup[]`
- `reservationRooms -> ReservationRoom[]`
- `pricingRules -> PricingRule[]`
- `users -> User[]`
- `housekeepingTasks -> HousekeepingTask[]`
- `channelConnections -> ChannelConnection[]`
- `inventoryCalendar -> InventoryCalendar[]`
- `inventoryBlocks -> InventoryBlock[]`
- `webhookEvents -> WebhookEvent[]`
- `backgroundJobs -> BackgroundJob[]`
- `providerReservationIntakeRecords -> ProviderReservationIntakeRecord[]`
- `emailConnections -> EmailConnection[]`
- `googleCalendarConnections -> GoogleCalendarConnection[]`
- `incomingEmails -> IncomingEmail[]`
- `bookingEnquiries -> BookingEnquiry[]`
- `expenses -> Expense[]`
- `images -> PropertyImage[]`

### users

Prisma model: `User`

| Column | Field | Type | DB type | Required | Notes |
|---|---|---|---|---|---|
| `id` | `id` | `String` | `Uuid` | Yes | primary key, default uuid( |
| `organization_id` | `organizationId` | `String?` | `Uuid` | No | - |
| `property_id` | `propertyId` | `String?` | `Uuid` | No | - |
| `name` | `name` | `String` | `VarChar(120)` | Yes | - |
| `email` | `email` | `String` | `VarChar(160)` | Yes | unique |
| `password_hash` | `passwordHash` | `String` | `Text` | Yes | - |
| `role` | `role` | `UserRole` | - | Yes | default STAFF |
| `is_active` | `isActive` | `Boolean` | - | Yes | default true |
| `created_at` | `createdAt` | `DateTime` | - | Yes | default now( |
| `updated_at` | `updatedAt` | `DateTime` | - | Yes | auto updated |

Constraints/indexes:
- `@@index([organizationId])`
- `@@index([propertyId])`
- `@@index([role])`
- `@@map("users")`

Relations:
- `organization -> Organization`
- `property -> Property`
- `auditLogs -> AuditLog[]`
- `refreshSessions -> RefreshSession[]`
- `passwordResetTokens -> PasswordResetToken[]`

### refresh_sessions

Prisma model: `RefreshSession`

| Column | Field | Type | DB type | Required | Notes |
|---|---|---|---|---|---|
| `id` | `id` | `String` | `Uuid` | Yes | primary key, default uuid( |
| `user_id` | `userId` | `String` | `Uuid` | Yes | - |
| `token_hash` | `tokenHash` | `String` | `Text` | Yes | unique |
| `user_agent` | `userAgent` | `String?` | `Text` | No | - |
| `ip_address` | `ipAddress` | `String?` | `VarChar(80)` | No | - |
| `expires_at` | `expiresAt` | `DateTime` | - | Yes | - |
| `revoked_at` | `revokedAt` | `DateTime?` | - | No | - |
| `created_at` | `createdAt` | `DateTime` | - | Yes | default now( |
| `updated_at` | `updatedAt` | `DateTime` | - | Yes | auto updated |

Constraints/indexes:
- `@@index([userId])`
- `@@index([expiresAt])`
- `@@index([revokedAt])`
- `@@map("refresh_sessions")`

Relations:
- `user -> User`

### password_reset_tokens

Prisma model: `PasswordResetToken`

| Column | Field | Type | DB type | Required | Notes |
|---|---|---|---|---|---|
| `id` | `id` | `String` | `Uuid` | Yes | primary key, default uuid( |
| `user_id` | `userId` | `String` | `Uuid` | Yes | - |
| `token_hash` | `tokenHash` | `String` | `Text` | Yes | unique |
| `expires_at` | `expiresAt` | `DateTime` | - | Yes | - |
| `used_at` | `usedAt` | `DateTime?` | - | No | - |
| `created_at` | `createdAt` | `DateTime` | - | Yes | default now( |

Constraints/indexes:
- `@@index([userId])`
- `@@index([expiresAt])`
- `@@index([usedAt])`
- `@@map("password_reset_tokens")`

Relations:
- `user -> User`

### idempotency_keys

Prisma model: `IdempotencyKey`

| Column | Field | Type | DB type | Required | Notes |
|---|---|---|---|---|---|
| `id` | `id` | `String` | `Uuid` | Yes | primary key, default uuid( |
| `key` | `key` | `String` | `VarChar(160)` | Yes | unique |
| `user_id` | `userId` | `String?` | `Uuid` | No | - |
| `scope` | `scope` | `String` | `VarChar(80)` | Yes | - |
| `request_hash` | `requestHash` | `String` | `VarChar(128)` | Yes | - |
| `response_body` | `responseBody` | `Json` | - | Yes | - |
| `status_code` | `statusCode` | `Int` | - | Yes | default 200 |
| `created_at` | `createdAt` | `DateTime` | - | Yes | default now( |

Constraints/indexes:
- `@@index([userId])`
- `@@index([scope])`
- `@@index([createdAt])`
- `@@map("idempotency_keys")`

### audit_logs

Prisma model: `AuditLog`

| Column | Field | Type | DB type | Required | Notes |
|---|---|---|---|---|---|
| `id` | `id` | `String` | `Uuid` | Yes | primary key, default uuid( |
| `property_id` | `propertyId` | `String?` | `Uuid` | No | - |
| `user_id` | `userId` | `String?` | `Uuid` | No | - |
| `action` | `action` | `AuditAction` | - | Yes | - |
| `entity_type` | `entityType` | `String` | `VarChar(80)` | Yes | - |
| `entity_id` | `entityId` | `String?` | `VarChar(120)` | No | - |
| `summary` | `summary` | `String` | `VarChar(240)` | Yes | - |
| `metadata` | `metadata` | `Json?` | - | No | - |
| `created_at` | `createdAt` | `DateTime` | - | Yes | default now( |

Constraints/indexes:
- `@@index([propertyId])`
- `@@index([userId])`
- `@@index([action])`
- `@@index([entityType, entityId])`
- `@@index([createdAt])`
- `@@map("audit_logs")`

Relations:
- `user -> User`

### room_categories

Prisma model: `RoomCategory`

| Column | Field | Type | DB type | Required | Notes |
|---|---|---|---|---|---|
| `id` | `id` | `String` | `Uuid` | Yes | primary key, default uuid( |
| `property_id` | `propertyId` | `String` | `Uuid` | Yes | - |
| `name` | `name` | `String` | `VarChar(80)` | Yes | - |
| `code` | `code` | `String` | `VarChar(40)` | Yes | - |
| `description` | `description` | `String?` | `Text` | No | - |
| `max_occupancy` | `maxOccupancy` | `Int` | - | Yes | default 2 |
| `created_at` | `createdAt` | `DateTime` | - | Yes | default now( |
| `updated_at` | `updatedAt` | `DateTime` | - | Yes | auto updated |

Constraints/indexes:
- `@@unique([propertyId, code])`
- `@@index([propertyId])`
- `@@map("room_categories")`

Relations:
- `property -> Property`
- `ratePlans -> RatePlan[]`
- `rooms -> Room[]`
- `reservationRooms -> ReservationRoom[]`
- `channelRoomMappings -> ChannelRoomMapping[]`
- `inventoryCalendar -> InventoryCalendar[]`
- `inventoryBlocks -> InventoryBlock[]`
- `images -> RoomCategoryImage[]`

### rate_plans

Prisma model: `RatePlan`

| Column | Field | Type | DB type | Required | Notes |
|---|---|---|---|---|---|
| `id` | `id` | `String` | `Uuid` | Yes | primary key, default uuid( |
| `property_id` | `propertyId` | `String` | `Uuid` | Yes | - |
| `room_category_id` | `roomCategoryId` | `String` | `Uuid` | Yes | - |
| `name` | `name` | `String` | `VarChar(100)` | Yes | - |
| `code` | `code` | `String` | `VarChar(40)` | Yes | - |
| `base_rate` | `baseRate` | `Decimal` | `Decimal(10, 2)` | Yes | - |
| `currency` | `currency` | `String` | `VarChar(3)` | Yes | default "INR" |
| `is_active` | `isActive` | `Boolean` | - | Yes | default true |
| `created_at` | `createdAt` | `DateTime` | - | Yes | default now( |
| `updated_at` | `updatedAt` | `DateTime` | - | Yes | auto updated |

Constraints/indexes:
- `@@unique([propertyId, code])`
- `@@index([propertyId])`
- `@@index([roomCategoryId])`
- `@@map("rate_plans")`

Relations:
- `property -> Property`
- `roomCategory -> RoomCategory`
- `reservationRooms -> ReservationRoom[]`
- `pricingRules -> PricingRule[]`
- `channelRateMappings -> ChannelRateMapping[]`

### pricing_rules

Prisma model: `PricingRule`

| Column | Field | Type | DB type | Required | Notes |
|---|---|---|---|---|---|
| `id` | `id` | `String` | `Uuid` | Yes | primary key, default uuid( |
| `property_id` | `propertyId` | `String` | `Uuid` | Yes | - |
| `rate_plan_id` | `ratePlanId` | `String` | `Uuid` | Yes | - |
| `name` | `name` | `String` | `VarChar(120)` | Yes | - |
| `type` | `type` | `PricingRuleType` | - | Yes | - |
| `adjustment_percent` | `adjustmentPercent` | `Decimal` | `Decimal(5, 2)` | Yes | - |
| `start_date` | `startDate` | `DateTime?` | `Date` | No | - |
| `end_date` | `endDate` | `DateTime?` | `Date` | No | - |
| `occupancy_threshold` | `occupancyThreshold` | `Int?` | - | No | - |
| `is_active` | `isActive` | `Boolean` | - | Yes | default true |
| `created_at` | `createdAt` | `DateTime` | - | Yes | default now( |
| `updated_at` | `updatedAt` | `DateTime` | - | Yes | auto updated |

Constraints/indexes:
- `@@index([propertyId])`
- `@@index([ratePlanId])`
- `@@index([type])`
- `@@index([isActive])`
- `@@map("pricing_rules")`

Relations:
- `property -> Property`
- `ratePlan -> RatePlan`

### rooms

Prisma model: `Room`

| Column | Field | Type | DB type | Required | Notes |
|---|---|---|---|---|---|
| `id` | `id` | `String` | `Uuid` | Yes | primary key, default uuid( |
| `property_id` | `propertyId` | `String` | `Uuid` | Yes | - |
| `room_category_id` | `roomCategoryId` | `String` | `Uuid` | Yes | - |
| `room_number` | `roomNumber` | `String` | `VarChar(20)` | Yes | - |
| `status` | `status` | `RoomStatus` | - | Yes | default AVAILABLE |
| `created_at` | `createdAt` | `DateTime` | - | Yes | default now( |
| `updated_at` | `updatedAt` | `DateTime` | - | Yes | auto updated |

Constraints/indexes:
- `@@unique([propertyId, roomNumber])`
- `@@index([propertyId])`
- `@@index([roomCategoryId])`
- `@@index([status])`
- `@@map("rooms")`

Relations:
- `property -> Property`
- `roomCategory -> RoomCategory`
- `outOfServicePeriods -> RoomOutOfServicePeriod[]`
- `reservationRooms -> ReservationRoom[]`
- `housekeepingTasks -> HousekeepingTask[]`

### room_out_of_service_periods

Prisma model: `RoomOutOfServicePeriod`

| Column | Field | Type | DB type | Required | Notes |
|---|---|---|---|---|---|
| `id` | `id` | `String` | `Uuid` | Yes | primary key, default uuid( |
| `room_id` | `roomId` | `String` | `Uuid` | Yes | - |
| `property_id` | `propertyId` | `String` | `Uuid` | Yes | - |
| `from_date` | `fromDate` | `DateTime` | `Date` | Yes | - |
| `to_date` | `toDate` | `DateTime` | `Date` | Yes | - |
| `reason` | `reason` | `String` | `VarChar(180)` | Yes | - |
| `notes` | `notes` | `String?` | `Text` | No | - |
| `created_at` | `createdAt` | `DateTime` | - | Yes | default now( |
| `updated_at` | `updatedAt` | `DateTime` | - | Yes | auto updated |

Constraints/indexes:
- `@@index([roomId, fromDate, toDate])`
- `@@index([propertyId, fromDate, toDate])`
- `@@map("room_out_of_service_periods")`

Relations:
- `room -> Room`
- `property -> Property`

### reservation_groups

Prisma model: `ReservationGroup`

| Column | Field | Type | DB type | Required | Notes |
|---|---|---|---|---|---|
| `id` | `id` | `String` | `Uuid` | Yes | primary key, default uuid( |
| `property_id` | `propertyId` | `String` | `Uuid` | Yes | - |
| `primary_guest_id` | `primaryGuestId` | `String?` | `Uuid` | No | - |
| `channel_connection_id` | `channelConnectionId` | `String?` | `Uuid` | No | - |
| `external_reservation_id` | `externalReservationId` | `String` | `VarChar(160)` | Yes | - |
| `external_reservation_version` | `externalReservationVersion` | `String?` | `VarChar(160)` | No | - |
| `external_status` | `externalStatus` | `String?` | `VarChar(80)` | No | - |
| `source` | `source` | `String?` | `VarChar(80)` | No | - |
| `currency` | `currency` | `String?` | `VarChar(8)` | No | - |
| `total_amount` | `totalAmount` | `Decimal?` | `Decimal(10, 2)` | No | - |
| `reservation_status` | `status` | `BookingStatus` | - | Yes | default BOOKED |
| `remarks` | `remarks` | `String?` | `Text` | No | - |
| `booked_at` | `bookedAt` | `DateTime?` | - | No | - |
| `modified_at` | `modifiedAt` | `DateTime?` | - | No | - |
| `raw_payload` | `rawPayload` | `Json?` | - | No | - |
| `created_at` | `createdAt` | `DateTime` | - | Yes | default now( |
| `updated_at` | `updatedAt` | `DateTime` | - | Yes | auto updated |

Constraints/indexes:
- `@@unique([channelConnectionId, externalReservationId])`
- `@@index([propertyId])`
- `@@index([primaryGuestId])`
- `@@index([channelConnectionId])`
- `@@index([status])`
- `@@index([externalStatus])`
- `@@map("reservation_groups")`

Relations:
- `property -> Property`
- `primaryGuest -> Guest`
- `channelConnection -> ChannelConnection`
- `rooms -> ReservationRoom[]`

### inventory_calendar

Prisma model: `InventoryCalendar`

| Column | Field | Type | DB type | Required | Notes |
|---|---|---|---|---|---|
| `id` | `id` | `String` | `Uuid` | Yes | primary key, default uuid( |
| `property_id` | `propertyId` | `String` | `Uuid` | Yes | - |
| `room_category_id` | `roomCategoryId` | `String` | `Uuid` | Yes | - |
| `stay_date` | `stayDate` | `DateTime` | `Date` | Yes | - |
| `total_rooms` | `totalRooms` | `Int` | - | Yes | default 0 |
| `blocked_rooms` | `blockedRooms` | `Int` | - | Yes | default 0 |
| `reserved_rooms` | `reservedRooms` | `Int` | - | Yes | default 0 |
| `available_rooms` | `availableRooms` | `Int` | - | Yes | default 0 |
| `stop_sell` | `stopSell` | `Boolean` | - | Yes | default false |
| `closed_to_arrival` | `closedToArrival` | `Boolean` | - | Yes | default false |
| `closed_to_departure` | `closedToDeparture` | `Boolean` | - | Yes | default false |
| `min_stay` | `minStay` | `Int?` | - | No | - |
| `max_stay` | `maxStay` | `Int?` | - | No | - |
| `created_at` | `createdAt` | `DateTime` | - | Yes | default now( |
| `updated_at` | `updatedAt` | `DateTime` | - | Yes | auto updated |

Constraints/indexes:
- `@@unique([propertyId, roomCategoryId, stayDate])`
- `@@index([propertyId, stayDate])`
- `@@index([roomCategoryId, stayDate])`
- `@@map("inventory_calendar")`

Relations:
- `property -> Property`
- `roomCategory -> RoomCategory`

### inventory_blocks

Prisma model: `InventoryBlock`

| Column | Field | Type | DB type | Required | Notes |
|---|---|---|---|---|---|
| `id` | `id` | `String` | `Uuid` | Yes | primary key, default uuid( |
| `property_id` | `propertyId` | `String` | `Uuid` | Yes | - |
| `room_category_id` | `roomCategoryId` | `String` | `Uuid` | Yes | - |
| `from_date` | `fromDate` | `DateTime` | `Date` | Yes | - |
| `to_date` | `toDate` | `DateTime` | `Date` | Yes | - |
| `blocked_rooms` | `blockedRooms` | `Int` | - | Yes | default 1 |
| `reason` | `reason` | `String` | `VarChar(180)` | Yes | - |
| `source` | `source` | `String` | `VarChar(40)` | Yes | default "MANUAL" |
| `google_calendar_id` | `googleCalendarId` | `String?` | `VarChar(255)` | No | - |
| `google_calendar_event_id` | `googleCalendarEventId` | `String?` | `VarChar(255)` | No | - |
| `google_calendar_html_link` | `googleCalendarHtmlLink` | `String?` | `Text` | No | - |
| `created_by_user_id` | `createdByUserId` | `String?` | `Uuid` | No | - |
| `created_at` | `createdAt` | `DateTime` | - | Yes | default now( |
| `updated_at` | `updatedAt` | `DateTime` | - | Yes | auto updated |

Constraints/indexes:
- `@@index([propertyId, fromDate, toDate])`
- `@@index([roomCategoryId, fromDate, toDate])`
- `@@map("inventory_blocks")`

Relations:
- `property -> Property`
- `roomCategory -> RoomCategory`

### reservation_rooms

Prisma model: `ReservationRoom`

| Column | Field | Type | DB type | Required | Notes |
|---|---|---|---|---|---|
| `id` | `id` | `String` | `Uuid` | Yes | primary key, default uuid( |
| `reservation_group_id` | `reservationGroupId` | `String` | `Uuid` | Yes | - |
| `property_id` | `propertyId` | `String` | `Uuid` | Yes | - |
| `external_room_reservation_id` | `externalRoomReservationId` | `String` | `VarChar(160)` | Yes | - |
| `external_room_id` | `externalRoomId` | `String` | `VarChar(160)` | Yes | - |
| `room_category_id` | `roomCategoryId` | `String` | `Uuid` | Yes | - |
| `rate_plan_id` | `ratePlanId` | `String` | `Uuid` | Yes | - |
| `room_id` | `roomId` | `String?` | `Uuid` | No | - |
| `arrival_date` | `arrivalDate` | `DateTime` | `Date` | Yes | - |
| `departure_date` | `departureDate` | `DateTime` | `Date` | Yes | - |
| `total_amount` | `totalAmount` | `Decimal?` | `Decimal(10, 2)` | No | - |
| `currency` | `currency` | `String?` | `VarChar(8)` | No | - |
| `reservation_status` | `status` | `BookingStatus` | - | Yes | default BOOKED |
| `guest_name` | `guestName` | `String?` | `VarChar(160)` | No | - |
| `adults` | `adults` | `Int?` | - | No | - |
| `children` | `children` | `Int?` | - | No | - |
| `checked_in_at` | `checkedInAt` | `DateTime?` | - | No | - |
| `checked_out_at` | `checkedOutAt` | `DateTime?` | - | No | - |
| `raw_payload` | `rawPayload` | `Json?` | - | No | - |
| `created_at` | `createdAt` | `DateTime` | - | Yes | default now( |
| `updated_at` | `updatedAt` | `DateTime` | - | Yes | auto updated |

Constraints/indexes:
- `@@unique([reservationGroupId, externalRoomReservationId])`
- `@@index([reservationGroupId])`
- `@@index([propertyId])`
- `@@index([roomCategoryId])`
- `@@index([ratePlanId])`
- `@@index([roomId])`
- `@@index([status])`
- `@@index([arrivalDate, departureDate])`
- `@@map("reservation_rooms")`

Relations:
- `reservationGroup -> ReservationGroup`
- `property -> Property`
- `roomCategory -> RoomCategory`
- `ratePlan -> RatePlan`
- `room -> Room`
- `billings -> Billing[]`
- `housekeepingTasks -> HousekeepingTask[]`

### billings

Prisma model: `Billing`

| Column | Field | Type | DB type | Required | Notes |
|---|---|---|---|---|---|
| `id` | `id` | `String` | `Uuid` | Yes | primary key, default uuid( |
| `reservation_room_id` | `reservationRoomId` | `String?` | `Uuid` | No | unique |
| `amount` | `amount` | `Decimal` | `Decimal(10, 2)` | Yes | - |
| `tax` | `tax` | `Decimal` | `Decimal(10, 2)` | Yes | default 0 |
| `total` | `total` | `Decimal` | `Decimal(10, 2)` | Yes | - |
| `payment_status` | `paymentStatus` | `PaymentStatus` | - | Yes | default PENDING |
| `created_at` | `createdAt` | `DateTime` | - | Yes | default now( |
| `updated_at` | `updatedAt` | `DateTime` | - | Yes | auto updated |

Constraints/indexes:
- `@@index([paymentStatus])`
- `@@index([reservationRoomId])`
- `@@map("billings")`

Relations:
- `reservationRoom -> ReservationRoom`
- `extraCharges -> BillingExtraCharge[]`
- `payments -> PaymentTransaction[]`

### payment_transactions

Prisma model: `PaymentTransaction`

| Column | Field | Type | DB type | Required | Notes |
|---|---|---|---|---|---|
| `id` | `id` | `String` | `Uuid` | Yes | primary key, default uuid( |
| `billing_id` | `billingId` | `String` | `Uuid` | Yes | - |
| `provider` | `provider` | `PaymentProvider` | - | Yes | default MOCK |
| `provider_reference` | `providerReference` | `String?` | `VarChar(120)` | No | - |
| `amount` | `amount` | `Decimal` | `Decimal(10, 2)` | Yes | - |
| `status` | `status` | `PaymentTransactionStatus` | - | Yes | default SUCCEEDED |
| `metadata` | `metadata` | `Json?` | - | No | - |
| `created_at` | `createdAt` | `DateTime` | - | Yes | default now( |
| `updated_at` | `updatedAt` | `DateTime` | - | Yes | auto updated |

Constraints/indexes:
- `@@index([billingId])`
- `@@index([provider])`
- `@@index([status])`
- `@@map("payment_transactions")`

Relations:
- `billing -> Billing`

### billing_extra_charges

Prisma model: `BillingExtraCharge`

| Column | Field | Type | DB type | Required | Notes |
|---|---|---|---|---|---|
| `id` | `id` | `String` | `Uuid` | Yes | primary key, default uuid( |
| `billing_id` | `billingId` | `String` | `Uuid` | Yes | - |
| `description` | `description` | `String` | `VarChar(180)` | Yes | - |
| `amount` | `amount` | `Decimal` | `Decimal(10, 2)` | Yes | - |
| `created_at` | `createdAt` | `DateTime` | - | Yes | default now( |

Constraints/indexes:
- `@@index([billingId])`
- `@@map("billing_extra_charges")`

Relations:
- `billing -> Billing`

### expenses

Prisma model: `Expense`

| Column | Field | Type | DB type | Required | Notes |
|---|---|---|---|---|---|
| `id` | `id` | `String` | `Uuid` | Yes | primary key, default uuid( |
| `property_id` | `propertyId` | `String` | `Uuid` | Yes | - |
| `expense_date` | `expenseDate` | `DateTime` | `Date` | Yes | - |
| `category` | `category` | `String` | `VarChar(80)` | Yes | - |
| `vendor` | `vendor` | `String?` | `VarChar(160)` | No | - |
| `vendor_contact` | `vendorContact` | `String?` | `VarChar(80)` | No | - |
| `description` | `description` | `String` | `VarChar(300)` | Yes | - |
| `amount` | `amount` | `Decimal` | `Decimal(10, 2)` | Yes | - |
| `currency` | `currency` | `String` | `VarChar(8)` | Yes | default "INR" |
| `payment_mode` | `paymentMode` | `String?` | `VarChar(40)` | No | - |
| `created_by_user_id` | `createdByUserId` | `String?` | `Uuid` | No | - |
| `created_at` | `createdAt` | `DateTime` | - | Yes | default now( |
| `updated_at` | `updatedAt` | `DateTime` | - | Yes | auto updated |

Constraints/indexes:
- `@@index([propertyId, expenseDate])`
- `@@index([category])`
- `@@map("expenses")`

Relations:
- `property -> Property`

### housekeeping_tasks

Prisma model: `HousekeepingTask`

| Column | Field | Type | DB type | Required | Notes |
|---|---|---|---|---|---|
| `id` | `id` | `String` | `Uuid` | Yes | primary key, default uuid( |
| `property_id` | `propertyId` | `String` | `Uuid` | Yes | - |
| `room_id` | `roomId` | `String` | `Uuid` | Yes | - |
| `reservation_room_id` | `reservationRoomId` | `String?` | `Uuid` | No | - |
| `status` | `status` | `HousekeepingStatus` | - | Yes | default DIRTY |
| `priority` | `priority` | `HousekeepingPriority` | - | Yes | default NORMAL |
| `notes` | `notes` | `String?` | `Text` | No | - |
| `due_date` | `dueDate` | `DateTime?` | `Date` | No | - |
| `completed_at` | `completedAt` | `DateTime?` | - | No | - |
| `created_at` | `createdAt` | `DateTime` | - | Yes | default now( |
| `updated_at` | `updatedAt` | `DateTime` | - | Yes | auto updated |

Constraints/indexes:
- `@@index([propertyId])`
- `@@index([roomId])`
- `@@index([reservationRoomId])`
- `@@index([status])`
- `@@index([dueDate])`
- `@@index([completedAt])`
- `@@map("housekeeping_tasks")`

Relations:
- `property -> Property`
- `room -> Room`
- `reservationRoom -> ReservationRoom`

### property_images

Prisma model: `PropertyImage`

| Column | Field | Type | DB type | Required | Notes |
|---|---|---|---|---|---|
| `id` | `id` | `String` | `Uuid` | Yes | primary key, default uuid( |
| `property_id` | `propertyId` | `String` | `Uuid` | Yes | - |
| `url` | `url` | `String` | `Text` | Yes | - |
| `caption` | `caption` | `String?` | `VarChar(180)` | No | - |
| `sort_order` | `sortOrder` | `Int` | - | Yes | default 0 |
| `is_primary` | `isPrimary` | `Boolean` | - | Yes | default false |
| `created_at` | `createdAt` | `DateTime` | - | Yes | default now( |
| `updated_at` | `updatedAt` | `DateTime` | - | Yes | auto updated |

Constraints/indexes:
- `@@index([propertyId])`
- `@@index([isPrimary])`
- `@@map("property_images")`

Relations:
- `property -> Property`

### room_category_images

Prisma model: `RoomCategoryImage`

| Column | Field | Type | DB type | Required | Notes |
|---|---|---|---|---|---|
| `id` | `id` | `String` | `Uuid` | Yes | primary key, default uuid( |
| `room_category_id` | `roomCategoryId` | `String` | `Uuid` | Yes | - |
| `url` | `url` | `String` | `Text` | Yes | - |
| `caption` | `caption` | `String?` | `VarChar(180)` | No | - |
| `sort_order` | `sortOrder` | `Int` | - | Yes | default 0 |
| `is_primary` | `isPrimary` | `Boolean` | - | Yes | default false |
| `created_at` | `createdAt` | `DateTime` | - | Yes | default now( |
| `updated_at` | `updatedAt` | `DateTime` | - | Yes | auto updated |

Constraints/indexes:
- `@@index([roomCategoryId])`
- `@@index([isPrimary])`
- `@@map("room_category_images")`

Relations:
- `roomCategory -> RoomCategory`

### channel_connections

Prisma model: `ChannelConnection`

| Column | Field | Type | DB type | Required | Notes |
|---|---|---|---|---|---|
| `id` | `id` | `String` | `Uuid` | Yes | primary key, default uuid( |
| `property_id` | `propertyId` | `String` | `Uuid` | Yes | - |
| `provider` | `provider` | `ChannelProvider` | - | Yes | - |
| `name` | `name` | `String` | `VarChar(120)` | Yes | - |
| `status` | `status` | `ChannelConnectionStatus` | - | Yes | default ACTIVE |
| `external_hotel_id` | `externalHotelId` | `String?` | `VarChar(120)` | No | - |
| `credentials` | `credentials` | `Json?` | - | No | - |
| `created_at` | `createdAt` | `DateTime` | - | Yes | default now( |
| `updated_at` | `updatedAt` | `DateTime` | - | Yes | auto updated |

Constraints/indexes:
- `@@unique([propertyId, provider, name])`
- `@@index([propertyId])`
- `@@index([provider])`
- `@@index([status])`
- `@@map("channel_connections")`

Relations:
- `property -> Property`
- `roomMappings -> ChannelRoomMapping[]`
- `rateMappings -> ChannelRateMapping[]`
- `reservationGroups -> ReservationGroup[]`
- `syncLogs -> ChannelSyncLog[]`
- `inventorySyncRows -> InventorySyncRow[]`
- `providerReservationIntakeRecords -> ProviderReservationIntakeRecord[]`

### channel_room_mappings

Prisma model: `ChannelRoomMapping`

| Column | Field | Type | DB type | Required | Notes |
|---|---|---|---|---|---|
| `id` | `id` | `String` | `Uuid` | Yes | primary key, default uuid( |
| `channel_connection_id` | `channelConnectionId` | `String` | `Uuid` | Yes | - |
| `room_category_id` | `roomCategoryId` | `String` | `Uuid` | Yes | - |
| `external_room_id` | `externalRoomId` | `String` | `VarChar(120)` | Yes | - |
| `external_room_name` | `externalRoomName` | `String?` | `VarChar(160)` | No | - |
| `is_activation_enabled` | `isActivationEnabled` | `Boolean` | - | Yes | default true |
| `created_at` | `createdAt` | `DateTime` | - | Yes | default now( |
| `updated_at` | `updatedAt` | `DateTime` | - | Yes | auto updated |

Constraints/indexes:
- `@@unique([channelConnectionId, roomCategoryId])`
- `@@unique([channelConnectionId, externalRoomId])`
- `@@index([roomCategoryId])`
- `@@map("channel_room_mappings")`

Relations:
- `channelConnection -> ChannelConnection`
- `roomCategory -> RoomCategory`

### channel_rate_mappings

Prisma model: `ChannelRateMapping`

| Column | Field | Type | DB type | Required | Notes |
|---|---|---|---|---|---|
| `id` | `id` | `String` | `Uuid` | Yes | primary key, default uuid( |
| `channel_connection_id` | `channelConnectionId` | `String` | `Uuid` | Yes | - |
| `rate_plan_id` | `ratePlanId` | `String` | `Uuid` | Yes | - |
| `external_room_id` | `externalRoomId` | `String?` | `VarChar(120)` | No | - |
| `external_rate_id` | `externalRateId` | `String` | `VarChar(120)` | Yes | - |
| `external_rate_name` | `externalRateName` | `String?` | `VarChar(160)` | No | - |
| `is_activation_enabled` | `isActivationEnabled` | `Boolean` | - | Yes | default true |
| `pricing_config` | `pricingConfig` | `Json?` | - | No | - |
| `created_at` | `createdAt` | `DateTime` | - | Yes | default now( |
| `updated_at` | `updatedAt` | `DateTime` | - | Yes | auto updated |

Constraints/indexes:
- `@@unique([channelConnectionId, ratePlanId])`
- `@@unique([channelConnectionId, externalRoomId, externalRateId])`
- `@@index([externalRoomId])`
- `@@index([ratePlanId])`
- `@@map("channel_rate_mappings")`

Relations:
- `channelConnection -> ChannelConnection`
- `ratePlan -> RatePlan`

### channel_sync_logs

Prisma model: `ChannelSyncLog`

| Column | Field | Type | DB type | Required | Notes |
|---|---|---|---|---|---|
| `id` | `id` | `String` | `Uuid` | Yes | primary key, default uuid( |
| `channel_connection_id` | `channelConnectionId` | `String` | `Uuid` | Yes | - |
| `sync_type` | `syncType` | `ChannelSyncType` | - | Yes | - |
| `status` | `status` | `ChannelSyncStatus` | - | Yes | default QUEUED |
| `request_payload` | `requestPayload` | `Json?` | - | No | - |
| `response_payload` | `responsePayload` | `Json?` | - | No | - |
| `error_message` | `errorMessage` | `String?` | `Text` | No | - |
| `created_at` | `createdAt` | `DateTime` | - | Yes | default now( |
| `updated_at` | `updatedAt` | `DateTime` | - | Yes | auto updated |

Constraints/indexes:
- `@@index([channelConnectionId])`
- `@@index([syncType])`
- `@@index([status])`
- `@@map("channel_sync_logs")`

Relations:
- `channelConnection -> ChannelConnection`
- `inventoryRows -> InventorySyncRow[]`
- `providerReservationIntakeRecords -> ProviderReservationIntakeRecord[]`

### inventory_sync_rows

Prisma model: `InventorySyncRow`

| Column | Field | Type | DB type | Required | Notes |
|---|---|---|---|---|---|
| `id` | `id` | `String` | `Uuid` | Yes | primary key, default uuid( |
| `channel_sync_log_id` | `channelSyncLogId` | `String` | `Uuid` | Yes | - |
| `channel_connection_id` | `channelConnectionId` | `String` | `Uuid` | Yes | - |
| `sync_date` | `syncDate` | `DateTime` | `Date` | Yes | - |
| `external_room_id` | `externalRoomId` | `String` | `VarChar(120)` | Yes | - |
| `available` | `available` | `Int` | - | Yes | - |
| `status` | `status` | `InventorySyncRowStatus` | - | Yes | - |
| `error_message` | `errorMessage` | `String?` | `Text` | No | - |
| `provider_response` | `providerResponse` | `Json?` | - | No | - |
| `created_at` | `createdAt` | `DateTime` | - | Yes | default now( |

Constraints/indexes:
- `@@unique([channelSyncLogId, syncDate, externalRoomId])`
- `@@index([channelConnectionId, status, syncDate])`
- `@@index([channelSyncLogId])`
- `@@index([externalRoomId])`
- `@@map("inventory_sync_rows")`

Relations:
- `channelSyncLog -> ChannelSyncLog`
- `channelConnection -> ChannelConnection`

### provider_reservation_intake_records

Prisma model: `ProviderReservationIntakeRecord`

| Column | Field | Type | DB type | Required | Notes |
|---|---|---|---|---|---|
| `id` | `id` | `String` | `Uuid` | Yes | primary key, default uuid( |
| `channel_sync_log_id` | `channelSyncLogId` | `String` | `Uuid` | Yes | - |
| `channel_connection_id` | `channelConnectionId` | `String` | `Uuid` | Yes | - |
| `property_id` | `propertyId` | `String` | `Uuid` | Yes | - |
| `external_reservation_id` | `externalReservationId` | `String` | `VarChar(160)` | Yes | - |
| `status` | `status` | `ProviderReservationIntakeStatus` | - | Yes | default FETCHED |
| `raw_payload` | `rawPayload` | `Json` | - | Yes | - |
| `error_message` | `errorMessage` | `String?` | `Text` | No | - |
| `imported_at` | `importedAt` | `DateTime?` | - | No | - |
| `failed_at` | `failedAt` | `DateTime?` | - | No | - |
| `skipped_at` | `skippedAt` | `DateTime?` | - | No | - |
| `created_at` | `createdAt` | `DateTime` | - | Yes | default now( |
| `updated_at` | `updatedAt` | `DateTime` | - | Yes | auto updated |

Constraints/indexes:
- `@@unique([channelSyncLogId, externalReservationId])`
- `@@index([channelConnectionId, status])`
- `@@index([propertyId, status])`
- `@@index([externalReservationId])`
- `@@map("provider_reservation_intake_records")`

Relations:
- `channelSyncLog -> ChannelSyncLog`
- `channelConnection -> ChannelConnection`
- `property -> Property`

### email_connections

Prisma model: `EmailConnection`

| Column | Field | Type | DB type | Required | Notes |
|---|---|---|---|---|---|
| `id` | `id` | `String` | `Uuid` | Yes | primary key, default uuid( |
| `tenant_id` | `tenantId` | `String?` | `Uuid` | No | - |
| `property_id` | `propertyId` | `String` | `Uuid` | Yes | - |
| `provider` | `provider` | `EmailProviderType` | - | Yes | - |
| `status` | `status` | `EmailConnectionStatus` | - | Yes | default CONNECTED |
| `email_address` | `emailAddress` | `String` | `VarChar(160)` | Yes | - |
| `provider_account_id` | `providerAccountId` | `String?` | `VarChar(190)` | No | - |
| `encrypted_credential` | `encryptedCredential` | `Bytes?` | - | No | - |
| `credential_version` | `credentialVersion` | `Int` | - | Yes | default 1 |
| `granted_scopes` | `grantedScopes` | `String?` | `Text` | No | - |
| `trusted_from_email` | `trustedFromEmail` | `String?` | `VarChar(160)` | No | - |
| `trusted_subject` | `trustedSubject` | `String?` | `VarChar(300)` | No | - |
| `provider_cursor` | `providerCursor` | `String?` | `Text` | No | - |
| `subscription_id` | `subscriptionId` | `String?` | `VarChar(190)` | No | - |
| `subscription_expires_at` | `subscriptionExpiresAt` | `DateTime?` | - | No | - |
| `last_sync_at` | `lastSyncAt` | `DateTime?` | - | No | - |
| `last_success_at` | `lastSuccessAt` | `DateTime?` | - | No | - |
| `last_error_code` | `lastErrorCode` | `String?` | `VarChar(80)` | No | - |
| `last_error_message` | `lastErrorMessage` | `String?` | `Text` | No | - |
| `created_at` | `createdAt` | `DateTime` | - | Yes | default now( |
| `updated_at` | `updatedAt` | `DateTime` | - | Yes | auto updated |

Constraints/indexes:
- `@@unique([propertyId, emailAddress])`
- `@@index([tenantId, propertyId])`
- `@@index([status])`
- `@@map("email_connections")`

Relations:
- `property -> Property`
- `emails -> IncomingEmail[]`

### google_calendar_connections

Prisma model: `GoogleCalendarConnection`

| Column | Field | Type | DB type | Required | Notes |
|---|---|---|---|---|---|
| `id` | `id` | `String` | `Uuid` | Yes | primary key, default uuid( |
| `tenant_id` | `tenantId` | `String?` | `Uuid` | No | - |
| `property_id` | `propertyId` | `String` | `Uuid` | Yes | - |
| `status` | `status` | `GoogleCalendarConnectionStatus` | - | Yes | default CONNECTED |
| `email_address` | `emailAddress` | `String` | `VarChar(160)` | Yes | - |
| `provider_account_id` | `providerAccountId` | `String?` | `VarChar(190)` | No | - |
| `calendar_id` | `calendarId` | `String` | `VarChar(256)` | Yes | - |
| `calendar_summary` | `calendarSummary` | `String?` | `VarChar(190)` | No | - |
| `encrypted_credential` | `encryptedCredential` | `Bytes` | - | Yes | - |
| `credential_version` | `credentialVersion` | `Int` | - | Yes | default 1 |
| `granted_scopes` | `grantedScopes` | `String?` | `Text` | No | - |
| `last_sync_at` | `lastSyncAt` | `DateTime?` | - | No | - |
| `last_success_at` | `lastSuccessAt` | `DateTime?` | - | No | - |
| `last_error_code` | `lastErrorCode` | `String?` | `VarChar(80)` | No | - |
| `last_error_message` | `lastErrorMessage` | `String?` | `Text` | No | - |
| `created_at` | `createdAt` | `DateTime` | - | Yes | default now( |
| `updated_at` | `updatedAt` | `DateTime` | - | Yes | auto updated |

Constraints/indexes:
- `@@unique([propertyId, calendarId])`
- `@@index([tenantId, propertyId])`
- `@@index([status])`
- `@@map("google_calendar_connections")`

Relations:
- `property -> Property`

### incoming_emails

Prisma model: `IncomingEmail`

| Column | Field | Type | DB type | Required | Notes |
|---|---|---|---|---|---|
| `id` | `id` | `String` | `Uuid` | Yes | primary key, default uuid( |
| `tenant_id` | `tenantId` | `String?` | `Uuid` | No | - |
| `property_id` | `propertyId` | `String` | `Uuid` | Yes | - |
| `connection_id` | `connectionId` | `String` | `Uuid` | Yes | - |
| `provider_message_id` | `providerMessageId` | `String` | `VarChar(190)` | Yes | - |
| `provider_thread_id` | `providerThreadId` | `String?` | `VarChar(190)` | No | - |
| `internet_message_id` | `internetMessageId` | `String?` | `VarChar(190)` | No | - |
| `from_email` | `fromEmail` | `String` | `VarChar(160)` | Yes | - |
| `from_name` | `fromName` | `String?` | `VarChar(160)` | No | - |
| `subject` | `subject` | `String` | `VarChar(300)` | Yes | - |
| `received_at` | `receivedAt` | `DateTime` | - | Yes | - |
| `sent_at` | `sentAt` | `DateTime?` | - | No | - |
| `plain_text` | `plainText` | `String?` | `Text` | No | - |
| `html_storage_key` | `htmlStorageKey` | `String?` | `Text` | No | - |
| `status` | `status` | `IncomingEmailStatus` | - | Yes | default RECEIVED |
| `detected_source` | `detectedSource` | `EmailSource?` | - | No | - |
| `detected_category` | `detectedCategory` | `EmailCategory?` | - | No | - |
| `classification_confidence` | `classificationConfidence` | `Float?` | - | No | - |
| `parser_type` | `parserType` | `ParserType?` | - | No | - |
| `parser_version` | `parserVersion` | `String?` | `VarChar(120)` | No | - |
| `automation_decision` | `automationDecision` | `AutomationDecision?` | - | No | - |
| `reservation_id` | `reservationId` | `String?` | `Uuid` | No | - |
| `enquiry_id` | `enquiryId` | `String?` | `Uuid` | No | - |
| `processing_attempts` | `processingAttempts` | `Int` | - | Yes | default 0 |
| `last_error_code` | `lastErrorCode` | `String?` | `VarChar(80)` | No | - |
| `last_error_message` | `lastErrorMessage` | `String?` | `Text` | No | - |
| `extraction` | `extraction` | `EmailExtraction?` | - | No | - |
| `enquiry` | `enquiry` | `BookingEnquiry?` | - | No | - |
| `created_at` | `createdAt` | `DateTime` | - | Yes | default now( |
| `updated_at` | `updatedAt` | `DateTime` | - | Yes | auto updated |

Constraints/indexes:
- `@@unique([connectionId, providerMessageId])`
- `@@index([tenantId, propertyId, receivedAt])`
- `@@index([status, receivedAt])`
- `@@index([reservationId])`
- `@@map("incoming_emails")`

Relations:
- `property -> Property`
- `connection -> EmailConnection`
- `attachments -> EmailAttachment[]`

### email_extractions

Prisma model: `EmailExtraction`

| Column | Field | Type | DB type | Required | Notes |
|---|---|---|---|---|---|
| `id` | `id` | `String` | `Uuid` | Yes | primary key, default uuid( |
| `email_id` | `emailId` | `String` | `Uuid` | Yes | unique |
| `source` | `source` | `EmailSource` | - | Yes | - |
| `category` | `category` | `EmailCategory` | - | Yes | - |
| `confidence` | `confidence` | `Float` | - | Yes | - |
| `external_reservation_id` | `externalReservationId` | `String?` | `VarChar(160)` | No | - |
| `guest_name` | `guestName` | `String?` | `VarChar(160)` | No | - |
| `guest_email` | `guestEmail` | `String?` | `VarChar(160)` | No | - |
| `guest_phone_raw` | `guestPhoneRaw` | `String?` | `VarChar(60)` | No | - |
| `guest_phone_e164` | `guestPhoneE164` | `String?` | `VarChar(30)` | No | - |
| `check_in` | `checkIn` | `DateTime?` | `Date` | No | - |
| `check_out` | `checkOut` | `DateTime?` | `Date` | No | - |
| `adults` | `adults` | `Int?` | - | No | - |
| `children` | `children` | `Int?` | - | No | - |
| `infants` | `infants` | `Int?` | - | No | - |
| `external_room_name` | `externalRoomName` | `String?` | `VarChar(180)` | No | - |
| `external_rate_plan_name` | `externalRatePlanName` | `String?` | `VarChar(180)` | No | - |
| `currency` | `currency` | `String?` | `VarChar(8)` | No | - |
| `total_amount` | `totalAmount` | `Decimal?` | `Decimal(10, 2)` | No | - |
| `tax_amount` | `taxAmount` | `Decimal?` | `Decimal(10, 2)` | No | - |
| `cancellation_reason` | `cancellationReason` | `String?` | `Text` | No | - |
| `raw_structured_json` | `rawStructuredJson` | `Json?` | - | No | - |
| `created_at` | `createdAt` | `DateTime` | - | Yes | default now( |
| `updated_at` | `updatedAt` | `DateTime` | - | Yes | auto updated |

Constraints/indexes:
- `@@map("email_extractions")`

Relations:
- `email -> IncomingEmail`

### email_attachments

Prisma model: `EmailAttachment`

| Column | Field | Type | DB type | Required | Notes |
|---|---|---|---|---|---|
| `id` | `id` | `String` | `Uuid` | Yes | primary key, default uuid( |
| `email_id` | `emailId` | `String` | `Uuid` | Yes | - |
| `provider_attachment_id` | `providerAttachmentId` | `String?` | `VarChar(190)` | No | - |
| `file_name` | `fileName` | `String?` | `VarChar(240)` | No | - |
| `mime_type` | `mimeType` | `String?` | `VarChar(120)` | No | - |
| `size_bytes` | `sizeBytes` | `Int?` | - | No | - |
| `storage_key` | `storageKey` | `String?` | `Text` | No | - |
| `sha256` | `sha256` | `String?` | `VarChar(128)` | No | - |
| `processing_status` | `processingStatus` | `String?` | `VarChar(80)` | No | - |
| `created_at` | `createdAt` | `DateTime` | - | Yes | default now( |

Constraints/indexes:
- `@@index([emailId])`
- `@@map("email_attachments")`

Relations:
- `email -> IncomingEmail`

### booking_enquiries

Prisma model: `BookingEnquiry`

| Column | Field | Type | DB type | Required | Notes |
|---|---|---|---|---|---|
| `id` | `id` | `String` | `Uuid` | Yes | primary key, default uuid( |
| `tenant_id` | `tenantId` | `String?` | `Uuid` | No | - |
| `property_id` | `propertyId` | `String` | `Uuid` | Yes | - |
| `source` | `source` | `String` | `VarChar(60)` | Yes | default "EMAIL" |
| `guest_name` | `guestName` | `String?` | `VarChar(160)` | No | - |
| `guest_email` | `guestEmail` | `String?` | `VarChar(160)` | No | - |
| `guest_phone_e164` | `guestPhoneE164` | `String?` | `VarChar(30)` | No | - |
| `check_in` | `checkIn` | `DateTime?` | `Date` | No | - |
| `check_out` | `checkOut` | `DateTime?` | `Date` | No | - |
| `adults` | `adults` | `Int?` | - | No | - |
| `children` | `children` | `Int?` | - | No | - |
| `requested_room_type_id` | `requestedRoomTypeId` | `String?` | `Uuid` | No | - |
| `status` | `status` | `String` | `VarChar(40)` | Yes | default "NEW" |
| `incoming_email_id` | `incomingEmailId` | `String?` | `Uuid` | No | unique |
| `created_at` | `createdAt` | `DateTime` | - | Yes | default now( |
| `updated_at` | `updatedAt` | `DateTime` | - | Yes | auto updated |

Constraints/indexes:
- `@@index([tenantId, propertyId, status])`
- `@@index([propertyId, createdAt])`
- `@@map("booking_enquiries")`

Relations:
- `property -> Property`
- `incomingEmail -> IncomingEmail`

### webhook_events

Prisma model: `WebhookEvent`

| Column | Field | Type | DB type | Required | Notes |
|---|---|---|---|---|---|
| `id` | `id` | `String` | `Uuid` | Yes | primary key, default uuid( |
| `domain` | `domain` | `WebhookDomain` | - | Yes | - |
| `provider` | `provider` | `String` | `VarChar(40)` | Yes | - |
| `property_id` | `propertyId` | `String?` | `Uuid` | No | - |
| `dedupe_key` | `dedupeKey` | `String` | `VarChar(190)` | Yes | unique |
| `external_event_id` | `externalEventId` | `String?` | `VarChar(160)` | No | - |
| `event_type` | `eventType` | `String` | `VarChar(120)` | Yes | - |
| `signature` | `signature` | `String?` | `Text` | No | - |
| `headers` | `headers` | `Json?` | - | No | - |
| `payload` | `payload` | `Json` | - | Yes | - |
| `request_hash` | `requestHash` | `String` | `VarChar(128)` | Yes | - |
| `status` | `status` | `WebhookEventStatus` | - | Yes | default RECEIVED |
| `processing_error` | `processingError` | `String?` | `Text` | No | - |
| `received_at` | `receivedAt` | `DateTime` | - | Yes | default now( |
| `processed_at` | `processedAt` | `DateTime?` | - | No | - |
| `created_at` | `createdAt` | `DateTime` | - | Yes | default now( |
| `updated_at` | `updatedAt` | `DateTime` | - | Yes | auto updated |

Constraints/indexes:
- `@@index([domain, provider])`
- `@@index([propertyId])`
- `@@index([status])`
- `@@map("webhook_events")`

Relations:
- `property -> Property`

### background_jobs

Prisma model: `BackgroundJob`

| Column | Field | Type | DB type | Required | Notes |
|---|---|---|---|---|---|
| `id` | `id` | `String` | `Uuid` | Yes | primary key, default uuid( |
| `type` | `type` | `BackgroundJobType` | - | Yes | - |
| `status` | `status` | `BackgroundJobStatus` | - | Yes | default PENDING |
| `property_id` | `propertyId` | `String?` | `Uuid` | No | - |
| `dedupe_key` | `dedupeKey` | `String?` | `VarChar(190)` | No | unique |
| `entity_type` | `entityType` | `String?` | `VarChar(80)` | No | - |
| `entity_id` | `entityId` | `String?` | `VarChar(120)` | No | - |
| `payload` | `payload` | `Json` | - | Yes | - |
| `attempts` | `attempts` | `Int` | - | Yes | default 0 |
| `max_attempts` | `maxAttempts` | `Int` | - | Yes | default 3 |
| `run_at` | `runAt` | `DateTime` | - | Yes | default now( |
| `locked_at` | `lockedAt` | `DateTime?` | - | No | - |
| `locked_by` | `lockedBy` | `String?` | `VarChar(120)` | No | - |
| `last_error` | `lastError` | `String?` | `Text` | No | - |
| `completed_at` | `completedAt` | `DateTime?` | - | No | - |
| `dead_lettered_at` | `deadLetteredAt` | `DateTime?` | - | No | - |
| `created_at` | `createdAt` | `DateTime` | - | Yes | default now( |
| `updated_at` | `updatedAt` | `DateTime` | - | Yes | auto updated |

Constraints/indexes:
- `@@index([status, runAt])`
- `@@index([propertyId])`
- `@@index([type])`
- `@@map("background_jobs")`

Relations:
- `property -> Property`
