# Centralized HMS + Zodomus Backend Plan

Last updated: 2026-05-06

This document records the current backend state of the HMS and the implementation plan required to turn it into a production-ready centralized hotel inventory and channel-manager integration system with Zodomus.

The goal is:

- HMS database is the source of truth
- Zodomus is the distribution and OTA booking intake layer
- inventory is controlled centrally by HMS
- OTA bookings and direct bookings both affect the same inventory truth

## 1. Current Backend State

The current repo already has a strong foundation.

### Already implemented

- `Property` exists as the hotel master model
- `RoomCategory` exists as the sellable room-type model
- `Room` exists as the physical-room model
- `RatePlan` exists
- OTA/grouped reservation intake already exists through:
  - `ReservationGroup`
  - `ReservationRoom`
- Channel integration already exists through:
  - `ChannelConnection`
  - `ChannelRoomMapping`
  - `ChannelRateMapping`
  - `ChannelSyncLog`
  - `InventorySyncRow`
  - `WebhookEvent`
- Generic webhook ingestion already exists:
  - `POST /webhooks/:domain/:provider`
- Zodomus setup lifecycle already exists:
  - account validation
  - channels validation
  - property activation
  - property check
  - provider catalog load
  - room activation
  - readiness gating
- Zodomus inventory sync already exists for:
  - availability
  - rates
- Zodomus reservation import already exists through polling/sync import
- Background jobs already exist for:
  - webhook processing
  - channel sync execution
  - notifications
- Sync logs, row-level inventory sync results, retries, and audit logs already exist
- Physical room assignment already exists at check-in for imported reservation room lines

### Existing code references

- Schema:
  - [apps/backend/prisma/schema.prisma](/Users/cronberry/Hms/apps/backend/prisma/schema.prisma:1)
- Channel lifecycle:
  - [docs/ConnectionLifecycle.md](/Users/cronberry/Hms/docs/ConnectionLifecycle.md:1)
- Implemented features:
  - [docs/implemented-features.md](/Users/cronberry/Hms/docs/implemented-features.md:1)
- Zodomus adapter:
  - [apps/backend/src/modules/channel/providers/zodomus-channel.adapter.ts](/Users/cronberry/Hms/apps/backend/src/modules/channel/providers/zodomus-channel.adapter.ts:1)
- Zodomus client:
  - [apps/backend/src/modules/channel/providers/zodomus-client.ts](/Users/cronberry/Hms/apps/backend/src/modules/channel/providers/zodomus-client.ts:1)
- Reservation import:
  - [apps/backend/src/modules/channel/zodomus-reservation-import.service.ts](/Users/cronberry/Hms/apps/backend/src/modules/channel/zodomus-reservation-import.service.ts:1)
- Generic webhook ingestion:
  - [apps/backend/src/modules/webhook/webhook.service.ts](/Users/cronberry/Hms/apps/backend/src/modules/webhook/webhook.service.ts:1)

## 2. Current Model Mapping To Requested Terminology

The repo uses slightly different names than the target design.

- `hotels` -> `properties`
- `room_types` -> `room_categories`
- `physical_rooms` -> `rooms`
- `reservations` -> `reservation_groups`
- `reservation_rooms` -> `reservation_rooms`
- `ota_channels` -> `channel_connections`
- `zodomus_room_mapping` -> `channel_room_mappings`
- `zodomus_rate_mapping` -> `channel_rate_mappings`
- `webhook_events` -> `webhook_events`
- `sync_logs` -> `channel_sync_logs`

This naming difference is not a problem by itself.

## 3. What Is Only Partially Implemented

These areas exist, but not yet in the production form required for a centralized inventory system.

### Inventory

- Inventory is now persisted in `inventory_calendar`
- Manual category/date inventory blocks are now persisted in `inventory_blocks`
- Allocation now uses per-date row locking against inventory calendar rows
- Availability and channel inventory payloads now read from the centralized inventory truth

Relevant files:

- [apps/backend/src/modules/availability/availability.service.ts](/Users/cronberry/Hms/apps/backend/src/modules/availability/availability.service.ts:1)
- [apps/backend/src/modules/channel/inventory-sync-payload.service.ts](/Users/cronberry/Hms/apps/backend/src/modules/channel/inventory-sync-payload.service.ts:1)

### Mapping

- Provider room mapping is correct conceptually:
  - OTA room -> internal room category
- Provider rate mapping is also correct conceptually:
  - OTA room + OTA rate -> internal rate plan
- But the data model is generic channel mapping, not explicit provider-specific mapping tables

### Physical room assignment

- Physical room assignment works for imported room stays at check-in
- The system correctly does not assign physical rooms at OTA booking intake time
- Direct reservation flow is now implemented
- Direct and OTA reservation writes now share the same inventory allocation/release core

### Sync engine

- Sync supports:
  - inventory
  - rates
  - bookings import
- Availability/rate sync aliases now exist under `/zodomus/sync/...`
- Restriction values are enforced inside HMS but are not distributed to Zodomus yet
- Sync does not yet support:
  - stop sell
  - minimum stay
  - maximum stay
  - broader restriction logic

### Webhook

- Generic webhook ingestion exists and is production-capable
- Dedicated `POST /webhooks/zodomus` alias now exists
- Zodomus reservation create/modify/cancel now reconciles inventory through the centralized allocation engine

## 4. What Is Missing Against Target Architecture

These are the main gaps.

### Remaining inventory-related gaps

- No `inventory_adjustments` or equivalent ledger yet
- Restrictions are persisted internally but are not yet pushed outward to Zodomus

### Remaining transactional/reservation gaps

- Core allocation/release is now shared by direct and OTA reservation writes
- More advanced reconciliation policies can still deepen for edge cases around already checked-in or partially-settled OTA changes

### Remaining direct booking gaps

- Direct booking write path now exists through `POST /reservations/direct`
- Additional product workflows like direct-reservation modification/cancellation APIs are still future scope

### Remaining restriction gaps

- `POST /inventory/block` now exists
- `POST /inventory/restrictions` now exists
- HMS now stores and enforces:
  - stop-sell
  - minimum stay
  - maximum stay
- These rules should currently be treated as internal-only controls
- Provider-side restriction sync for stop-sell/min-stay/max-stay is still pending

### Missing restrictions model

- Stop-sell is now persisted in `inventory_calendar`
- Minimum stay is now persisted in `inventory_calendar`
- Maximum stay is now persisted in `inventory_calendar`
- No sync path for those restrictions to Zodomus

### Remaining contract gaps

- Aliases now exist for:
  - `POST /hotels`
  - `POST /room-types`
  - `POST /physical-rooms`
  - `GET /inventory-calendar`
  - `POST /zodomus/mapping/property`
  - `POST /zodomus/mapping/room`
  - `POST /zodomus/mapping/rate`
  - `POST /zodomus/sync/availability`
  - `POST /zodomus/sync/rates`
  - `POST /webhooks/zodomus`
- The main remaining contract gap is provider-side restriction sync once the exact Zodomus restriction API contract is confirmed

## 5. Architectural Direction

Do not rewrite the existing reservation-group and channel foundation.

Instead:

1. keep the current `Property`, `RoomCategory`, `Room`, `RatePlan`, `ReservationGroup`, and `ReservationRoom` model
2. keep the current Zodomus provider adapter and channel lifecycle
3. add a true centralized inventory layer beneath reservation intake and sync
4. route both OTA bookings and direct bookings through one allocation engine

This is the safest and most production-correct path.

## 6. Target Production Architecture

### Controllers

- properties/hotels
- room categories / room types
- physical rooms
- rate plans
- reservations
- inventory
- zodomus mappings
- zodomus sync
- webhooks

### Application services

- `InventoryService`
- `InventoryBlockService`
- `ReservationAllocationService`
- `DirectReservationService`
- `ReservationImportService`
- `RoomAssignmentService`
- `RestrictionService`
- `ZodomusAuthService`
- `ZodomusInventoryService`
- `ZodomusBookingService`
- `ZodomusMappingService`
- `ZodomusWebhookService`

### Repositories / persistence responsibilities

- inventory calendar repository
- inventory block repository
- reservation repository
- provider mapping repository
- webhook event repository
- sync log repository

### Async workers

- webhook processor
- sync dispatcher
- retry worker
- reconciliation worker

## 7. Target Data Model Additions

Keep current tables and add the missing centralized inventory layer.

### `inventory_calendar`

Recommended fields:

- `id`
- `property_id`
- `room_category_id`
- `stay_date`
- `total_rooms`
- `blocked_rooms`
- `reserved_rooms`
- `available_rooms`
- `stop_sell`
- `min_stay`
- `max_stay`
- `created_at`
- `updated_at`

Constraint:

- unique `(property_id, room_category_id, stay_date)`

### `inventory_blocks`

Recommended fields:

- `id`
- `property_id`
- `room_category_id`
- `from_date`
- `to_date`
- `blocked_rooms`
- `reason`
- `source`
- `created_by`
- `created_at`

### Optional `inventory_adjustments`

Recommended if a true ledger is desired.

Use for:

- reservation create
- reservation modification
- cancellation
- admin block
- maintenance-derived inventory recalculation
- reconciliation

## 8. Inventory Logic To Implement

The centralized availability formula should be:

`available = total_rooms - reserved_rooms - blocked_rooms`

Where:

- `total_rooms` comes from physical rooms in the room category
- `reserved_rooms` comes from confirmed active reservation-room lines
- `blocked_rooms` comes from manual or operational inventory blocks

Rules:

- inventory is maintained per `property + room_category + date`
- OTA bookings reduce centralized inventory
- direct bookings reduce centralized inventory
- cancellations release centralized inventory
- inventory changes trigger sync to Zodomus

## 9. Booking Intake Logic To Implement

For Zodomus booking webhook or import:

1. verify webhook/signature
2. persist raw payload in `webhook_events`
3. check idempotency by external reservation ID or webhook dedupe key
4. map provider property to internal property
5. map provider room to internal room category
6. map provider room + rate to internal rate plan
7. lock relevant inventory rows for all stay dates
8. validate inventory
9. create or update:
   - `ReservationGroup`
   - `ReservationRoom`
10. decrement or release inventory rows
11. enqueue availability sync
12. mark webhook processed

Must handle:

- new booking
- modification
- cancellation
- duplicate webhook
- failed mapping
- insufficient inventory

## 10. Room Mapping Rules

Correct rule:

- OTA room IDs map to internal room category IDs
- OTA rate IDs map to internal rate plan IDs
- physical rooms are never mapped directly to OTA rooms

Example:

- Zodomus `roomId = DLX123` -> internal `RoomCategory = Deluxe Room`
- Zodomus `rateId = BAR456` -> internal `RatePlan = Best Available Rate`

This aligns with how the current system already models provider mappings.

## 11. Physical Room Assignment Rules

Correct rule:

- booking reserves room category inventory first
- physical room number is assigned later
- assignment happens:
  - manually
  - or automatically near check-in
- assignment must prevent overlapping use of the same room

The current imported-room check-in flow already follows this principle.

## 12. Sync Engine Direction

The centralized sync engine should push:

- availability
- rates
- restrictions
- stop sell
- minimum stay
- maximum stay

Sync triggers:

- after OTA booking
- after direct booking
- after cancellation
- after inventory block
- manual sync
- scheduled retry / scheduler

Current implementation already supports:

- availability
- rates
- bookings import
- async queue/retry

The next work is to extend it to restriction sync and centralized inventory-driven payload building.

## 13. API Alignment Plan

### Already present or close equivalent

- `POST /properties` -> hotel creation equivalent
- `POST /room-categories` -> room type creation equivalent
- `POST /rooms` -> physical room creation equivalent
- `GET /availability` -> current availability equivalent
- `POST /channels/:id/room-mappings`
- `POST /channels/:id/rate-mappings`
- `POST /channels/:id/sync`
- `POST /webhooks/:domain/:provider`

### To add

- `POST /reservations/direct`
- `GET /inventory-calendar`
- `POST /inventory/block`
- `POST /zodomus/mapping/property`
- `POST /zodomus/mapping/room`
- `POST /zodomus/mapping/rate`
- `POST /zodomus/sync/availability`
- `POST /zodomus/sync/rates`
- `POST /webhooks/zodomus`

### Optional aliases for product clarity

- `POST /hotels` -> alias to `POST /properties`
- `POST /room-types` -> alias to `POST /room-categories`
- `POST /physical-rooms` -> alias to `POST /rooms`

## 14. Phased Implementation Plan

### Phase 1: Centralized Inventory Foundation

Status: implemented

Build:

- `inventory_calendar`
- `inventory_blocks`
- inventory bootstrap/rebuild logic
- `GET /inventory-calendar`
- `POST /inventory/block`

Outcome:

- inventory becomes persisted truth instead of a derived-only read

### Phase 2: Transactional Allocation Engine

Status: implemented

Build:

- `ReservationAllocationService`
- per-date row locking
- create/release inventory logic
- direct reservation creation path

Add:

- `POST /reservations/direct`

Outcome:

- OTA and direct reservations use one inventory allocation engine

### Phase 3: Zodomus Intake Hardening

Status: implemented

Build:

- dedicated `POST /webhooks/zodomus`
- `ZodomusWebhookService`
- specialized async processor for:
  - create
  - modify
  - cancel
  - duplicate
  - insufficient inventory
  - missing mapping

Outcome:

- webhook intake becomes explicit and production-safe

### Phase 4: Sync Engine Completion

Status: partially implemented

Extend sync support for:

- stop sell
- minimum stay
- maximum stay
- restriction payload building

Outcome:

- Zodomus distribution is driven completely from HMS truth

### Phase 5: API Surface And Admin Alignment

Status: mostly implemented

Add or alias APIs so the system matches the desired centralized-platform contract and admin UI expectations.

Outcome:

- backend contract becomes cleaner for frontend/admin workflows

## 15. Recommended Next Step

The next backend step should be:

1. confirm the exact Zodomus restriction sync contract
2. extend the provider adapter for:
   - stop-sell
   - minimum stay
   - maximum stay
3. add outbound restriction sync jobs and logs
4. optionally add an inventory-adjustment ledger if deeper auditability is needed

The core centralized inventory engine is now implemented. The remaining work is mostly outward restriction distribution and deeper audit/reconciliation polish.
