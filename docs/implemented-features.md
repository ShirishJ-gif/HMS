# HMS Implemented Features

This document lists the features currently implemented in the Hotel Management System MVP.

## Platform

- npm monorepo with `apps/backend` and `apps/frontend`.
- NestJS backend with modular services/controllers.
- React/Vite frontend admin dashboard.
- PostgreSQL database through Prisma ORM.
- Docker Compose PostgreSQL setup.
- Prisma migrations, generated client, schema, and seed data.
- Global request validation through NestJS validation pipes.
- Public health endpoint for uptime checks.
- Raw request-body capture is enabled so signed webhook verification can validate the original payload bytes.
- Backend HTTP logging now assigns or propagates `x-request-id` and records request metadata on completion and failure.
- Metrics endpoints are available through Prometheus-style scrape output and JSON summary output.

## Authentication And Access Control

- JWT login.
- Refresh-token session creation and rotation.
- Frontend access-token expiry now attempts a refresh-token exchange and retries the failed request before forcing logout.
- Logout endpoint for one-session or all-session revocation.
- First-admin bootstrap endpoint.
- Password reset request and confirmation endpoints.
- Password reset tokens expire and revoke active refresh sessions after reset.
- Refresh-token rotation, targeted session logout, global logout, and password-reset session revocation are covered by PostgreSQL-backed integration tests.
- User roles: `SUPER_ADMIN`, `ADMIN`, and `STAFF`.
- User creation/listing endpoints.
- User listing supports pagination/search.
- Role-based route guards.
- Property-scoped authorization for hotel admins/staff.
- Seed users for super admin, Harbour admin/staff, and Lakeview admin.

## Property Setup

- Create and list properties.
- Create and list room categories.
- Create and list rate plans.
- Rate plans support base rate, currency, active state, and room-category association.
- Create, list, update, disable/enable, and delete pricing rules attached to rate plans.
- Pricing-rule types: `WEEKEND`, `DATE_RANGE`, and `OCCUPANCY`.
- Frontend Property Setup page supports pricing-rule creation, editing, enable/disable, and delete actions.
- Property and room-category image upload endpoints.
- Uploaded images are stored locally under `apps/backend/uploads/`.
- Uploaded images are served from `/uploads/...`.
- Frontend Property Setup page supports property/category/rate setup and image previews.
- Property setup actions now disable duplicate submits while requests are in flight and surface backend request-aware error messages.

## Room Inventory

- Create physical rooms.
- Alias endpoint: `POST /physical-rooms`.
- List physical rooms with pagination/search.
- Update room details/status.
- Delete rooms when no dependent records block deletion.
- Physical room deletion is explicitly blocked when the room has active or future `BOOKED` / `CHECKED_IN` reservation stays.
- Room statuses: `AVAILABLE`, `OCCUPIED`, `MAINTENANCE`.
- Create, list, and delete date-ranged room out-of-service periods.
- Temporary room blocks can now be modeled by date range instead of only with permanent `MAINTENANCE` status.
- Both `MAINTENANCE` rooms and dated out-of-service periods are excluded from sellable inventory.
- Frontend Rooms page supports room creation, search, list view, status display, delete action, and dated out-of-service period management.
- Room create/delete actions now disable duplicate submits while requests are in flight and surface backend request-aware error messages.
- Centralized inventory calendar is now persisted per property + room category + date.
- Inventory rows store:
  - total rooms
  - blocked rooms
  - reserved rooms
  - available rooms
  - stop-sell
  - minimum stay
  - maximum stay
- Manual category-level inventory blocks are supported through `POST /inventory/block`.
- Inventory restriction management is supported through `POST /inventory/restrictions`.
- `GET /inventory-calendar` returns room-type/date-level inventory truth.
- Restriction values are currently enforced inside HMS only.
- Stop-sell, minimum stay, and maximum stay are not yet synced outward to Zodomus or OTAs.

## Guest Registry

- Create guest profiles.
- List guests with pagination/search.
- Guest records include property, name, phone, email, ID proof, and address.
- Frontend Guests page supports guest creation, search, and table view.
- Guests page search now filters the merged guest registry and reservation-feed guest dataset locally with deferred input handling instead of triggering per-keystroke server fetches.
- Guest creation now disables duplicate submits while requests are in flight and surfaces backend request-aware error messages.

## Booking And Reservations

- Reservation intake now supports:
  - OTA/channel import
  - direct reservation creation
- Direct reservation endpoint: `POST /reservations/direct`.
- Unified reservation feed endpoint: `GET /bookings/feed`.
- Reservation date validation using `YYYY-MM-DD`.
- `check_out_date` must be after `check_in_date`.
- Reservation-room totals are calculated as the sum of per-night dynamic rates.
- Dynamic nightly pricing starts from the rate-plan base rate and adds all applicable active pricing-rule percentages against that base.
- Overlapping reservation-room stays are allowed until category inventory is sold out.
- Active overlap statuses are `BOOKED` and `CHECKED_IN`.
- Direct bookings allocate room-type inventory transactionally against the persisted inventory calendar.
- Direct reservation creation now runs under serializable transaction handling and rejects concurrent inventory races instead of allowing double booking on the same room-category dates.
- OTA/Zodomus reservation import now uses the same centralized allocation/release core as direct reservations.
- Reservation allocation now enforces:
  - stop-sell
  - minimum stay
  - maximum stay
- Check-in assigns an available physical room and marks the room `OCCUPIED`.
- Check-out marks the reservation room `CHECKED_OUT` and room `AVAILABLE`.
- Check-out creates or preserves a pending invoice for the reservation room.
- List reservation groups with pagination/search.
- `GET /bookings/feed` can return both imported HMS reservation groups and provider-discovered reservations that are still blocked from import.
- Provider-discovered blocked reservations expose import diagnostics such as inventory failure or missing mapping failure.
- Frontend Bookings page supports imported-reservation operations, search, timeline/ledger views, inline detail expansion, check-in, and checkout.
- Frontend Bookings page now loads the reservation feed page-by-page instead of fetching the entire feed before first render.
- Frontend Bookings timeline is horizontally scrollable and prefers today through the next 30 days, but falls back to the reservation date span on the current page when no stays overlap the current date window.
- The reservation ledger groups near-duplicate blocked provider rows and suppresses blocked provider duplicates when an equivalent HMS reservation has already imported.
- Reservation actions now disable duplicate submits while requests are in flight and surface backend request-aware error messages.

## Availability

- Category-level availability endpoint.
- Availability accepts property and date range query params.
- Availability is now backed by the persisted inventory calendar.
- Maintenance rooms and dated out-of-service periods are counted as out of service and excluded from available inventory.
- Frontend Availability page displays:
  - queried-night inventory summary
  - restriction management form
  - per-night inventory calendar rows
  - stop-sell / min-stay / max-stay visibility
- Restriction controls are labeled as internal-only until outbound Zodomus restriction sync is implemented.

## Housekeeping

- Create housekeeping tasks.
- List housekeeping tasks.
- Update housekeeping tasks.
- Statuses: `DIRTY`, `CLEANING`, `CLEAN`, `INSPECTED`, `OUT_OF_SERVICE`.
- Priorities: `LOW`, `NORMAL`, `HIGH`, `URGENT`.
- Tasks are linked to properties and physical rooms.
- Frontend Housekeeping page supports task creation and quick status actions.
- Housekeeping task create/update actions now disable duplicate submits while requests are in flight and surface backend request-aware error messages.

## Billing

- Generate invoices for reservation rooms.
- List invoices.
- Get invoice details.
- Add extra charges to invoices.
- Administrative payment-status correction endpoint.
- Billing allows one invoice per reservation room.
- Billing total is reservation-room amount plus tax plus extra charges.
- Billing responses expose paid total, refunded total, and balance due.
- Reservation-group folios can generate missing invoices only for checked-out room lines that do not already have invoices.

## Payments

- List payment transactions with pagination/search.
- Collect payments against invoices.
- Refund successful payments.
- Payment collection and refunds support `Idempotency-Key`.
- Idempotent payment collect/refund requests are serialized per idempotency key so concurrent replays do not double-execute the payment workflow.
- Supported provider enum values: `MOCK`, `CASH`, `CARD`, `UPI`, `RAZORPAY`, and `STRIPE`.
- `MOCK`, `CASH`, `CARD`, and `UPI` use the local payment adapter.
- `RAZORPAY` and `STRIPE` are explicit adapter placeholders that reject live calls until credentials, webhook verification, and idempotency are implemented.
- Successful collections update invoice status to `PARTIAL` or `PAID`.
- Refunds are recorded as separate immutable transactions.
- Refunds recalculate invoice payment status.
- Frontend Payments page supports invoice generation for checked-out imported room stays, reservation folios, payment collection, compact filters, invoice view, and transaction view.
- Frontend reservation folio list is filtered to finance-relevant groups only:
  - at least one checked-out room
  - or at least one invoice
  - or a non-zero billed total
- Payment actions now disable duplicate submits while requests are in flight and surface backend request-aware error messages.

## Channel Manager Boundary

- List channel connections.
- Create channel connections.
- Alias endpoints:
  - `POST /zodomus/mapping/property`
  - `POST /zodomus/mapping/room`
  - `POST /zodomus/mapping/rate`
  - `POST /zodomus/sync/availability`
  - `POST /zodomus/sync/rates`
- Zodomus sync currently covers availability and rates only.
- Zodomus rate sync now expands mapped rates into daily room/rate/date rows and pushes the actual HMS nightly price for each date.
- Zodomus rate sync is price-model aware:
  - `1` Maximum / Single uses `POST /rates` with `prices.price` and, for non-single rooms, `prices.priceSingle`.
  - `2` Derived pricing uses the required two-step Booking flow: `POST /rates` for the default price, then `POST /rates-derived` for base occupancy and offsets.
  - `3` Occupancy uses `POST /rates` with `prices[]` by guest count.
  - `4` Per Day uses `POST /rates` with `baseOccupancy` and default `prices.price`.
  - `5` Length of Stay uses `POST /rates` with `baseOccupancy` and `prices[]` by stay length.
- Channel rate mappings now store optional `pricing_config` JSON for model-specific values such as single-occupancy price, derived offsets, occupancy prices, per-day base occupancy, and length-of-stay prices.
- Active HMS pricing rules can now change the outbound Zodomus rate for specific dates on mapped rate plans.
- Stop-sell, minimum stay, and maximum stay are not pushed to Zodomus yet.
- Create room-category mappings to external room IDs.
- Create rate-plan mappings to external rate IDs.
- Trigger syncs for `INVENTORY`, `RATES`, and `BOOKINGS`.
- Removing an OTA connection also removes reservation groups imported through that connection for test cleanup, releases active reserved inventory, removes orphan channel-imported guests, and queues inventory fan-out for remaining active OTA connections.
- Zodomus booking import is webhook-first, with scheduled/manual fallback polling through provider `reservations-queue` followed by reservation detail fetches.
- Zodomus webhook-triggered booking sync has been locally validated through ngrok: signed webhook intake stores the event, queues a webhook-triggered `BOOKINGS` sync, fetches the targeted reservation, and reconciles cancellation into HMS.
- Fetched Zodomus reservation details are persisted to provider reservation intake records before local import, so consumed provider queue payloads remain visible and recoverable if HMS import fails.
- Zodomus booking import can fall back from legacy provider room IDs such as `90002` / `90003` to canonical mapped room IDs when the provider payload uses older aliases.
- Zodomus booking import can fall back to a mapped rate plan for the resolved room category when the provider payload does not match a room-scoped rate mapping directly.
- Zodomus booking import skips new provider reservations whose latest departure date is already before the current local date, instead of treating stale sandbox history as an inventory failure.
- Zodomus booking import skips duplicate provider reservations when the same provider room-line IDs and stay dates have already been imported under another reservation ID.
- Successful `POST /channels/:id/provider-reservations-create-test` calls now immediately fetch provider reservation detail and import it into HMS instead of waiting for a later `BOOKINGS` sync.
- Admin-facing provider reservation test events now support `new`, `modified`, and `cancelled` flows from the Channel Manager workspace.
- Roomless Zodomus reservation detail payloads can now update or cancel an already-imported HMS reservation group by `external_reservation_id`.
- Roomless provider cancellation now cancels existing HMS reservation-room lines and releases their allocated inventory.
- HMS intentionally skips roomless cancelled provider reservations when no matching HMS reservation exists yet, because the payload lacks room/date/rate context needed to create reliable local inventory records.
- Numeric provider reservation status `3` is now treated as `CANCELLED` during Zodomus import.
- The default reservation feed and Reservations page now exclude cancelled reservations; operators can still select the Cancelled status or All including cancelled view for history/reconciliation.
- Sandbox/local views now hide detached OTA reservation history by default across the reservation feed, imported guest registry rows, provider-only failure records, and reservation-related dashboard counts. Production-style history remains available through `ZODOMUS_ENVIRONMENT="production"` or explicit visibility flags.
- Provider reservation test events now reject placeholder IDs such as `RESERVATION_ID`; `new` events may omit the ID, while `modified` and `cancelled` events require a real provider reservation ID.
- Zodomus reservation detail entries that only report `Reservation already downloaded 5 times. The limit was reached.` are filtered out of HMS booking-sync payloads as provider queue noise.
- Imported reservation-group totals now fall back to summed room-line totals when the provider reservation-level total is missing or zero.
- Provider reservation import can still fail intentionally when HMS inventory is already sold out for the mapped room category/date range.
- Inventory sync builds daily provider room/date rows from the centralized inventory calendar instead of one window-level aggregate payload.
- Inventory sync excludes both permanent maintenance rooms and dated out-of-service periods on the affected dates.
- Zodomus connection automation now separates routine rolling sync windows from explicit full-window syncs, so production can use a shorter scheduler window while keeping 365-day go-live/repair actions available.
- Channel sync supports `Idempotency-Key`.
- Idempotent channel sync requests are serialized per idempotency key so concurrent replays do not create duplicate sync-side effects or duplicate sync logs.
- Store channel sync request/response payloads and errors in sync logs.
- Inventory syncs can now end as `SUCCEEDED`, `PARTIAL_FAILED`, or `FAILED`.
- Inventory sync provider responses now store room/date `row_results` plus success/failure summary counts.
- Zodomus provider `returnCode != 200` is now treated as a failed row outcome instead of a successful sync row.
- Rate syncs now persist row-level result summaries too, and provider-side business rejection no longer appears as unconditional `SUCCEEDED`.
- Rate sync row results now also persist the synced `date` and nightly `base_rate`, so provider logs show exactly which day and price were pushed.
- Failed inventory rows can be retried through `POST /channels/:id/sync-logs/:syncLogId/retry-failed-rows`.
- Failed rate rows can also be retried through the same failed-row retry endpoint; HMS rebuilds the retry payload from the original failed room/rate/date rows.
- HMS persists each inventory row result in `inventory_sync_rows`.
- Stale failed inventory-row diagnostics are cleared automatically when a later sync succeeds for the same connection, provider room, and date.
- HMS exposes inventory reconciliation through `GET /channels/:id/inventory-reconciliation`.
- HMS exposes persisted row-level inventory analytics through `GET /channels/:id/inventory-row-results`.
- Channel sync requests now return a queued sync log immediately and run provider pushes through the background-job worker.
- `MOCK` channel provider accepts sync payloads locally.
- `SITEMINDER`, `BOOKING_COM`, and `AIRBNB` are explicit adapter placeholders that reject live syncs until provider credentials, retry policy, and webhook reconciliation are implemented.
- Channel syncs build payloads from internal inventory/rate mappings and do not write directly to booking or room tables.
- HMS can update a Zodomus connection external hotel/property mapping without recreating the connection.
- Saving new room/rate mappings on a Zodomus connection resets room activation/readiness, requiring room activation and property check before treating the connection as ready again.
- Frontend Channels page includes summary tiles, active connection workspace, mapping forms, sync controls, inventory reconciliation, persisted failed-row analytics, mapping tables, connection table, recent sync logs, background-job surfaces, webhook-event surfaces, dead-letter retry controls, and metrics-summary snapshots.
- Channel Manager workspace state now persists across page switches in the frontend, so returning to the page restores the current connection context instead of cold-loading from empty state.
- OTA Mapping, Channel Manager, and Webhooks & Sync Logs now share the same cached channel workspace state in the frontend.
- The selected OTA connection is persisted across browser refreshes, so Webhooks & Sync and manual inventory/rate sync actions stay on the selected Zodomus connection instead of falling back to the first connection.
- Sync logs, webhook events, background jobs, and reconciliation data now load lazily for the diagnostics page instead of every channel-related page paying that cost.
- Channel connection, mapping, and sync actions now disable duplicate submits while requests are in flight and surface backend request-aware error messages.
- Mapping saves on connections with activation or sync history require operator confirmation in the frontend.
- Provider reservation test events require confirmation that includes the selected OTA connection and target reservation ID before sending.
- Webhooks & Sync includes a background-job health panel for pending, processing, dead-letter, and stuck jobs.

## Webhook Foundation

- Zodomus-specific webhook alias: `POST /webhooks/zodomus`.
- Generic inbound webhook endpoint: `POST /webhooks/:domain/:provider`.
- Admin webhook-event listing endpoint: `GET /webhook-events`.
- Admin background-job listing endpoint: `GET /background-jobs`.
- Admin dead-letter retry endpoint: `POST /background-jobs/:id/retry`.
- Supported webhook domains: `PAYMENT` and `CHANNEL`.
- Inbound webhook signatures are verified with HMAC secrets from environment configuration.
- Webhook events are persisted with domain, provider, event type, dedupe key, raw metadata, processing status, and optional property scope.
- Accepted webhooks and channel syncs enqueue background processing jobs instead of doing all work inline in the request path.
- Background jobs are persisted with retry state, scheduled run time, attempt counts, and dead-letter status.
- Webhook replays are deduplicated through a persisted dedupe key and advisory-lock serialization.
- Signed webhook replay handling, queued channel sync execution, background-job visibility, and dead-letter retry behavior are covered by PostgreSQL-backed integration tests.
- Docker-backed backend integration tests also cover:
  - direct reservation allocation
  - OTA multi-room import
  - centralized inventory reconciliation
  - stop-sell enforcement
  - minimum-stay enforcement
  - maximum-stay enforcement

## Audit Logs

- Audit log database model and migration.
- Audit log service and controller.
- Audit logs are available to `SUPER_ADMIN` and `ADMIN`.
- Hotel admins see property-scoped audit records.
- List audit logs with pagination/search.
- Audit actions include `CREATE`, `UPDATE`, `DELETE`, `CHECK_IN`, `CHECK_OUT`, `PAYMENT_COLLECT`, `PAYMENT_REFUND`, and `CHANNEL_SYNC`.
- Current audit coverage includes reservation-room check-in/checkout, room create/update/delete, payment collection/refunds, channel connection creation, channel mappings, and channel sync success/failure.
- Frontend Audit Logs page supports search, actor/action filters, summary tiles, and event-stream review of recorded actions.

## Notifications

- WhatsApp notification service with `mock` and WhatsApp Cloud API modes.
- Imported reservation intake sends a mock booking confirmation.
- Imported reservation intake sends a hotel-owner notification to the property phone when configured.
- Owner booking notifications include quick-reply options for viewing the booking and calling the guest.
- Check-in reminder endpoint sends a mock reminder.
- Booking confirmations, owner notifications, and check-in reminders now enqueue `NOTIFICATION_SEND` background jobs with retry and dead-letter handling instead of sending inline from the request path.
- Notification logic is isolated behind `WhatsAppNotificationService`.
- WhatsApp Cloud API mode is enabled with `WHATSAPP_PROVIDER=cloud_api`, `WABA_ACCESS_TOKEN`, and `WABA_PHONE_NUMBER_ID`.

## Dashboard

- Dashboard summary endpoint.
- Metrics include reservation groups today, occupancy rate, occupied rooms, total rooms, and revenue today.
- Today-based metrics use Asia/Kolkata day boundaries.
- Frontend Dashboard page displays operational metric cards and setup guidance.
- Frontend Dashboard page now refreshes on a timer, on window focus, on tab visibility return, and through a manual refresh button instead of remaining static after initial load.

## Observability

- Prometheus-style metrics scrape endpoint: `GET /metrics`.
- JSON metrics summary endpoint: `GET /metrics/summary`.
- Current metrics include:
  - HTTP request counts and duration histograms
  - payment collect/refund counters
  - channel sync queued/completed counters
  - webhook accepted/rejected counters
  - background job queued/completed/retried counters
  - notification send counters by template/result
  - current grouped counts for background jobs, webhook events, and channel sync logs
- Recommended dashboard panels and first alert thresholds are defined in [metrics-alerting.md](/Users/cronberry/Hms/docs/metrics-alerting.md).

## Frontend Application

- Login page.
- Login now disables duplicate submit attempts while sign-in is in flight and surfaces backend request-aware auth errors.
- Frontend auth state is now managed through a shared session helper with safe persisted-user parsing during app startup.
- Frontend now recovers expired access tokens through refresh-token exchange instead of leaving the authenticated shell stuck in request-failure state.
- Dashboard page.
- Property Setup page.
- Availability page.
- Availability page now includes restriction management for room types and date ranges.
- Availability page clearly labels restriction controls as internal-only / not synced to Zodomus yet.
- Rooms page.
- Bookings page.
- Guests page.
- Housekeeping page.
- Payments page.
- Channels page.
- Audit Logs page.
- Axios API client with bearer token handling.
- Axios API client now sends `x-request-id` headers so frontend-visible failures can be traced in backend logs.
- Reload failures now preserve the last successfully loaded frontend data instead of blanking the current screen immediately.
- Frontend operational/admin pages that compute totals or action candidates now fetch complete paginated datasets instead of relying on silent 100-row caps.
- Shared compact filter controls on rooms, guests, bookings, payments, channels, and audit logs.
- Bookings page includes timeline and ledger views.
- Shared visual system with cards, tables, status pills, forms, and responsive layout.

## API Response Patterns

- Most non-auth endpoints require `Authorization: Bearer <access_token>`.
- Paginated/searchable endpoints support `page`, `limit`, and `search`.
- Paginated endpoints return:

```json
{
  "data": [],
  "meta": {
    "page": 1,
    "limit": 25,
    "total": 0,
    "total_pages": 1
  }
}
```

Implemented paginated/searchable endpoints:

- `GET /auth/users`
- `GET /properties`
- `GET /room-categories`
- `GET /rate-plans`
- `GET /rooms`
- `GET /guests`
- `GET /bookings/groups`
- `GET /billings`
- `GET /payments`
- `GET /housekeeping`
- `GET /channels`
- `GET /channels/:id/sync-logs`
- `GET /audit-logs`
- `GET /background-jobs`

## Validation

Current validation commands pass:

```bash
npm test
npm run build
```

At the time this document was added, backend tests passed with 5 test suites and 18 tests.
The backend now also includes a PostgreSQL-backed integration suite covering property-scoped access control, concurrent last-slot booking protection, booking check-in/check-out plus invoice generation behavior, idempotent payment collect/refund replay behavior, idempotent channel sync replay behavior, auth refresh/logout/password-reset lifecycle behavior, signed webhook replay handling, and background-job dead-letter retry behavior.
