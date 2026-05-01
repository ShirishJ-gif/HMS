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
- List physical rooms with pagination/search.
- Update room details/status.
- Delete rooms when no dependent records block deletion.
- Room statuses: `AVAILABLE`, `OCCUPIED`, `MAINTENANCE`.
- Maintenance rooms are excluded from sellable inventory.
- Frontend Rooms page supports room creation, search, list view, status display, and delete action.
- Room create/delete actions now disable duplicate submits while requests are in flight and surface backend request-aware error messages.

## Guest Registry

- Create guest profiles.
- List guests with pagination/search.
- Guest records include property, name, phone, email, ID proof, and address.
- Frontend Guests page supports guest creation, search, and table view.
- Guest creation now disables duplicate submits while requests are in flight and surfaces backend request-aware error messages.

## Booking And Reservations

- Create bookings against room-category inventory.
- Booking date validation using `YYYY-MM-DD`.
- `check_out_date` must be after `check_in_date`.
- Booking total is calculated as the sum of per-night dynamic rates.
- Dynamic nightly pricing starts from the rate-plan base rate and adds all applicable active pricing-rule percentages against that base.
- Overlapping bookings are allowed until category inventory is sold out.
- Active overlap statuses are `BOOKED` and `CHECKED_IN`.
- Booking creation serializes concurrent sells per property and room category with a PostgreSQL advisory transaction lock to prevent last-slot oversell races.
- Check-in assigns an available physical room and marks the room `OCCUPIED`.
- Check-out marks the booking `CHECKED_OUT` and room `AVAILABLE`.
- Check-out creates or preserves a pending invoice for the booking.
- List bookings with pagination/search.
- Frontend Bookings page supports creation, search, timeline/ledger views, inline booking detail expansion, check-in, and checkout.
- Booking actions now disable duplicate submits while requests are in flight and surface backend request-aware error messages.

## Availability

- Category-level availability endpoint.
- Availability accepts property and date range query params.
- Availability is calculated from physical inventory minus active overlapping bookings.
- Maintenance rooms are counted as out of service and excluded from available inventory.
- Frontend Availability page displays a queried-night calendar strip plus category inventory, booked count, out-of-service count, available count, and starting dynamic rate for the selected start date.

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

- Generate invoices for bookings.
- List invoices.
- Get invoice details.
- Add extra charges to invoices.
- Administrative payment-status correction endpoint.
- Billing allows one invoice per booking.
- Billing total is booking amount plus tax plus extra charges.
- Billing responses expose paid total, refunded total, and balance due.

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
- Frontend Payments page supports invoice generation for checked-out bookings, payment collection, compact filters, invoice view, and transaction view.
- Payment actions now disable duplicate submits while requests are in flight and surface backend request-aware error messages.

## Channel Manager Boundary

- List channel connections.
- Create channel connections.
- Create room-category mappings to external room IDs.
- Create rate-plan mappings to external rate IDs.
- Trigger syncs for `INVENTORY`, `RATES`, and `BOOKINGS`.
- Channel sync supports `Idempotency-Key`.
- Idempotent channel sync requests are serialized per idempotency key so concurrent replays do not create duplicate sync-side effects or duplicate sync logs.
- Store channel sync request/response payloads and errors in sync logs.
- Channel sync requests now return a queued sync log immediately and run provider pushes through the background-job worker.
- `MOCK` channel provider accepts sync payloads locally.
- `SITEMINDER`, `BOOKING_COM`, and `AIRBNB` are explicit adapter placeholders that reject live syncs until provider credentials, retry policy, and webhook reconciliation are implemented.
- Channel syncs build payloads from internal inventory/rate mappings and do not write directly to booking or room tables.
- Frontend Channels page includes summary tiles, active connection workspace, mapping forms, sync controls, mapping tables, connection table, recent sync logs, background-job surfaces, webhook-event surfaces, dead-letter retry controls, and metrics-summary snapshots.
- Channel connection, mapping, and sync actions now disable duplicate submits while requests are in flight and surface backend request-aware error messages.

## Webhook Foundation

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

## Audit Logs

- Audit log database model and migration.
- Audit log service and controller.
- Audit logs are available to `SUPER_ADMIN` and `ADMIN`.
- Hotel admins see property-scoped audit records.
- List audit logs with pagination/search.
- Audit actions include `CREATE`, `UPDATE`, `DELETE`, `CHECK_IN`, `CHECK_OUT`, `PAYMENT_COLLECT`, `PAYMENT_REFUND`, and `CHANNEL_SYNC`.
- Current audit coverage includes booking creation, check-in, checkout, room create/update/delete, payment collection/refunds, channel connection creation, channel mappings, and channel sync success/failure.
- Frontend Audit Logs page supports search, actor/action filters, summary tiles, and event-stream review of recorded actions.

## Notifications

- WhatsApp notification service with `mock` and WhatsApp Cloud API modes.
- Booking creation sends a mock booking confirmation.
- Booking creation sends a hotel-owner notification to the property phone when configured.
- Owner booking notifications include quick-reply options for viewing the booking and calling the guest.
- Check-in reminder endpoint sends a mock reminder.
- Booking confirmations, owner notifications, and check-in reminders now enqueue `NOTIFICATION_SEND` background jobs with retry and dead-letter handling instead of sending inline from the request path.
- Notification logic is isolated behind `WhatsAppNotificationService`.
- WhatsApp Cloud API mode is enabled with `WHATSAPP_PROVIDER=cloud_api`, `WABA_ACCESS_TOKEN`, and `WABA_PHONE_NUMBER_ID`.

## Dashboard

- Dashboard summary endpoint.
- Metrics include bookings today, occupancy rate, occupied rooms, total rooms, and revenue today.
- Today-based metrics use Asia/Kolkata day boundaries.
- Frontend Dashboard page displays operational metric cards and setup guidance.

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
- Dashboard page.
- Property Setup page.
- Availability page.
- Rooms page.
- Bookings page.
- Guests page.
- Housekeeping page.
- Payments page.
- Channels page.
- Audit Logs page.
- Axios API client with bearer token handling.
- Axios API client now sends `x-request-id` headers so frontend-visible failures can be traced in backend logs.
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
- `GET /bookings`
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
