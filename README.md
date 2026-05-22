# Hotel Management System MVP

Production-ready MVP structure for a Hotel Management System using NestJS, Prisma, PostgreSQL, and React.

## Current Implementation Status

Implemented MVP:

- NestJS backend with Prisma, PostgreSQL, modular services, validation, and unit tests
- REST APIs for properties, room categories, rate plans, rooms, guests, reservation groups, billing, payments, channel mappings, dashboard metrics, and mock WhatsApp notifications
- Dynamic pricing rules for weekend, date-range/festival, and occupancy-based surcharges
- Audit-log API for sensitive operational actions, including booking lifecycle, room changes, payments, and channel syncs
- JWT authentication with `SUPER_ADMIN`, `ADMIN`, and `STAFF` roles
- Refresh-token sessions, logout/session revocation, and password reset token endpoints
- Property-scoped authorization so hotel admins/staff only see their assigned hotel data
- Availability and housekeeping operations
- Paginated/searchable list APIs across operational list endpoints
- Idempotency-key support for payment collection/refunds and channel syncs
- Generic signed webhook ingestion for payment/channel event foundations with replay-safe event storage
- Database-backed background-job queue with retry and dead-letter tracking for async webhook processing
- Metrics endpoints for scrape and dashboard foundations
- Concrete dashboard panel and alert threshold definitions in [docs/metrics-alerting.md](/Users/cronberry/Hms/docs/metrics-alerting.md)
- React admin dashboard with login, dashboard, property setup, availability, rooms, bookings, guests, housekeeping, payments, channel manager, and audit log pages
- Reservation-group and reservation-room persistence for imported multi-room OTA stays
- Zodomus provider adapter with property check, property activation, provider catalog fetch, availability sync, rate sync, reservation queue polling, reservation detail fetch, and reservation import
- Local image uploads for property and room-category photos
- WhatsApp notifications queued through background jobs, with mock or WhatsApp Cloud API delivery mode
- Docker Compose PostgreSQL, Prisma schema, SQL schema, and sample seed data
- API examples in [docs/api-examples.http](/Users/cronberry/Hms/docs/api-examples.http)
- Implemented feature inventory in [docs/implemented-features.md](/Users/cronberry/Hms/docs/implemented-features.md)
- AI handoff context in [docs/ai-handoff.md](/Users/cronberry/Hms/docs/ai-handoff.md)
- Production-readiness notes in [docs/production-readiness.md](/Users/cronberry/Hms/docs/production-readiness.md)
- Documentation index in [docs/README.md](/Users/cronberry/Hms/docs/README.md)

## Prerequisites

- Node.js 20.11+
- npm 10+
- Docker Desktop or another Docker-compatible runtime

## Local Database Setup

```bash
npm install
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
npm run db:up
npm run backend:prisma:generate
npm run backend:prisma:migrate
npm run backend:seed
```

Start the backend API:

```bash
npm run backend:start:dev
```

Start the React admin dashboard:

```bash
npm run frontend:dev
```

Seed admin login:

```text
Email: admin@hms.local
Password: Admin@12345
```

Scoped seed logins:

```text
Harbour admin: admin.harbour@hms.local / Admin@12345
Harbour staff: staff.harbour@hms.local / Staff@12345
```

The default database URL is:

```text
postgresql://hms:hms_password@localhost:5432/hms?schema=public
```

## Project Structure

```text
apps/
  backend/
    src/
      modules/room/
      modules/guest/
      modules/booking/
      modules/channel/
      modules/billing/
      modules/dashboard/
      modules/payment/
      modules/audit-log/
      modules/notification/
      modules/property/
    prisma/
      schema.prisma
      seed.ts
      sql/schema.sql
  frontend/
    src/
      pages/
      api/
```

The frontend runs on `http://localhost:5173` and calls the backend from `VITE_API_BASE_URL`.

## Validation

```bash
npm test
npm run build
```

`npm test` runs backend service unit tests. `npm run build` compiles the NestJS backend and production-builds the React dashboard.

Operational endpoints:

```text
GET /health
GET /metrics
GET /metrics/summary
```

## Integration Notes

- The active reservation domain is `ReservationGroup` plus `ReservationRoom`, with OTA/channel import as the only supported intake path.
- Zodomus is the first real external channel adapter in the backend. Availability sync, rate sync, reservation queue polling, reservation detail fetch, and reservation import are implemented behind the channel module.
- Zodomus onboarding supports provider catalog fetch, room/rate mapping, provider-side `rooms-activate`, property check, inventory sync, rate sync, reservation polling, reservation detail fetch, and reservation import.
- WhatsApp automation is isolated behind `WhatsAppNotificationService`, so Twilio or Gupshup can replace the mock sender without changing booking logic.
- Imported reservation intake notifies the guest and also notifies the hotel owner using the property phone number. Set `WHATSAPP_PROVIDER=cloud_api`, `WABA_ACCESS_TOKEN`, and `WABA_PHONE_NUMBER_ID` to send through WhatsApp Cloud API; otherwise mock logs are used.
- Payments are isolated behind a provider service. The current provider is mock/local, but the boundary is ready for Razorpay, Stripe, or terminal/cash workflows with webhook reconciliation.
- Webhook foundations are available through `POST /webhooks/:domain/:provider` with HMAC verification using `PAYMENT_WEBHOOK_SECRET` and `CHANNEL_WEBHOOK_SECRET`, but live provider-specific signature formats and event handlers still need to be implemented.
- Accepted webhooks and channel sync requests enqueue background jobs that can be inspected through `GET /background-jobs` and retried from dead-letter state through `POST /background-jobs/:id/retry`.
- Reservation confirmations, hotel-owner reservation notifications, and check-in reminders also enqueue background jobs so delivery can retry and dead-letter safely.
- Recommended first dashboard panels and alert thresholds are defined in [docs/metrics-alerting.md](/Users/cronberry/Hms/docs/metrics-alerting.md).
- Razorpay and Stripe are still payment placeholders. SiteMinder, Booking.com direct, and Airbnb direct adapters are still channel placeholders. Zodomus is the only real external channel adapter currently implemented.
- Channel integrations must continue to flow through provider adapters, mappings, sync logs, and reservation import services rather than writing directly to reservation tables.

Base URL: `http://localhost:3000`

## Auth API

All APIs except auth endpoints require:

```http
Authorization: Bearer <access_token>
```

### Login

```http
POST /auth/login
Content-Type: application/json
```

```json
{
  "email": "admin@hms.local",
  "password": "Admin@12345"
}
```

Login and bootstrap return both `access_token` and `refresh_token`.

### Refresh Session

```http
POST /auth/refresh
Content-Type: application/json
```

```json
{
  "refresh_token": "refresh-token"
}
```

### Logout / Revoke Sessions

```http
POST /auth/logout
Content-Type: application/json
```

Pass a `refresh_token` to revoke one session, or omit it to revoke all active sessions for the current user.

### Password Reset

```http
POST /auth/password-reset/request
POST /auth/password-reset/confirm
```

The MVP returns a reset token from the request endpoint so local/dev flows work without an email provider. Production should deliver this token by email/SMS and avoid returning it in API responses.

### Bootstrap First Admin

```http
POST /auth/bootstrap
Content-Type: application/json
```

Only works when no users exist.

## Health API

```http
GET /health
```

This endpoint is public and intended for uptime checks and load balancer probes.

## Property Setup API

### Create Property

```http
POST /properties
Content-Type: application/json
```

```json
{
  "name": "Harbour Residency",
  "code": "HARBOUR-MUM",
  "phone": "+912212345678",
  "email": "ops@harbour.example.com",
  "address": "Bandra West, Mumbai, Maharashtra",
  "timezone": "Asia/Kolkata"
}
```

### Create Room Category

```http
POST /room-categories
Content-Type: application/json
```

```json
{
  "property_id": "property-id",
  "name": "Deluxe",
  "code": "DELUXE",
  "description": "Premium room with upgraded amenities.",
  "max_occupancy": 3
}
```

### Create Rate Plan

```http
POST /rate-plans
Content-Type: application/json
```

```json
{
  "property_id": "property-id",
  "room_category_id": "room-category-id",
  "name": "Deluxe Flexible",
  "code": "DELUXE-FLEX",
  "base_rate": "7500.00",
  "currency": "INR"
}
```

## Room API

### Create Room

```http
POST /rooms
Content-Type: application/json
```

```json
{
  "property_id": "property-id",
  "room_category_id": "room-category-id",
  "room_number": "301",
  "status": "AVAILABLE"
}
```

### List Rooms

```http
GET /rooms?page=1&limit=25&search=301
```

List responses for operational list endpoints use:

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

### Update Room

```http
PUT /rooms/:id
Content-Type: application/json
```

```json
{
  "status": "MAINTENANCE"
}
```

### Delete Room

```http
DELETE /rooms/:id
```

Rooms with dependent bookings are not deleted; the API returns `409 Conflict`.

## Guest API

### Create Guest

```http
POST /guests
Content-Type: application/json
```

```json
{
  "property_id": "property-id",
  "name": "Priya Nair",
  "phone": "+919812345678",
  "email": "priya.nair@example.com",
  "id_proof": "PASSPORT-M1234567",
  "address": "Indiranagar, Bengaluru, Karnataka"
}
```

### List Guests

```http
GET /guests?page=1&limit=25&search=Priya
```

In sandbox/local testing, Zodomus-imported guest records from detached OTA history are hidden by default so removed or paused test connections do not keep noisy guest profiles visible. Production-style history is controlled by `ZODOMUS_ENVIRONMENT="production"` or `SHOW_DETACHED_OTA_RESERVATION_HISTORY="true"`.

## Booking API

### Create Booking

Reservation intake comes from OTA/channel import into `ReservationGroup` and `ReservationRoom`.
In sandbox/local testing, reservation feed and reservation-related dashboard counts include direct HMS reservations and active OTA connections only; detached OTA history and provider-only failure records are hidden unless explicitly enabled for production-style review.

### Reservation Groups

```http
GET /bookings/groups?page=1&limit=25&search=Priya
PUT /bookings/groups/rooms/:id/checkin
PUT /bookings/groups/rooms/:id/checkout
POST /bookings/groups/rooms/:id/checkin-reminder
```

Operational actions now happen at imported reservation-room line level.

## Billing API

### Generate Invoice

```http
POST /billings
Content-Type: application/json
```

```json
{
  "booking_id": "3ffbbafc-1023-4ee0-9ed6-13c31c7fe29f",
  "tax": "600.00"
}
```

Rules:

- One invoice is allowed per booking.
- `amount` is copied from the booking `total_amount`.
- `total` is calculated as `amount + tax + extra_charges_total`.

### List Invoices

```http
GET /billings
```

### Get Invoice

```http
GET /billings/:id
```

### Add Extra Charge

```http
POST /billings/:id/extra-charges
Content-Type: application/json
```

```json
{
  "description": "Airport pickup",
  "amount": "900.00"
}
```

### Update Payment Status

```http
PUT /billings/:id/payment-status
Content-Type: application/json
```

```json
{
  "payment_status": "PAID"
}
```

Use this only for administrative correction. Normal payment collection should use the payment transaction API below.

## Payments API

### List Payments

```http
GET /payments?page=1&limit=25&search=receipt
```

### Collect Payment

```http
POST /payments/collect
Content-Type: application/json
```

```json
{
  "billing_id": "b4ddf4f6-3ea0-47f7-a39d-49180e9f54d2",
  "amount": "5000.00",
  "provider": "MOCK",
  "provider_reference": "front-desk-cash-001"
}
```

Rules:

- Payments cannot exceed the invoice balance.
- Successful payments update invoice status to `PARTIAL` or `PAID`.
- Supported provider enum values are `MOCK`, `CASH`, `CARD`, `UPI`, `RAZORPAY`, and `STRIPE`.

### Refund Payment

```http
POST /payments/:id/refund
Content-Type: application/json
```

```json
{
  "amount": "1000.00",
  "reason": "Guest refund"
}
```

Refunds are recorded as separate refund transactions and recalculate invoice payment status.

Mock, cash, card, and UPI providers are handled by the local adapter. Razorpay and Stripe are explicit adapter placeholders and return a `501 Not Implemented` style NestJS error until live credentials, webhook verification, and idempotency keys are added.

Payment collection and refund endpoints accept an optional `Idempotency-Key` header. Reusing the same key with the same payload returns the original response; reusing it with a different payload returns a conflict.

## Channel Manager API

These endpoints provide the internal boundary for future SiteMinder, Booking.com, Airbnb, or similar channel integrations. `MOCK` syncs succeed locally; external providers are explicit adapter placeholders and fail loudly until provider credentials, retry policy, and webhook reconciliation are implemented.

### List Channel Connections

```http
GET /channels
```

### Create Channel Connection

```http
POST /channels
Content-Type: application/json
```

```json
{
  "property_id": "a32b1387-433c-4624-acf1-11ffdc2413fe",
  "provider": "MOCK",
  "name": "Mock OTA Gateway",
  "external_hotel_id": "MOCK-HARBOUR-MUM"
}
```

### Map Room Category

```http
POST /channels/:id/room-mappings
Content-Type: application/json
```

```json
{
  "room_category_id": "2f15ef4b-efc1-4367-816d-269343fa28d2",
  "external_room_id": "MOCK-DELUXE",
  "external_room_name": "Mock Deluxe Room"
}
```

### Map Rate Plan

```http
POST /channels/:id/rate-mappings
Content-Type: application/json
```

```json
{
  "rate_plan_id": "c481c8f4-d26c-474a-9232-55f7b7b2cc40",
  "external_rate_id": "MOCK-DELUXE-FLEX",
  "external_rate_name": "Mock Deluxe Flexible"
}
```

### Trigger Sync

```http
POST /channels/:id/sync
Content-Type: application/json
```

```json
{
  "sync_type": "INVENTORY",
  "from": "2026-05-01",
  "to": "2026-05-03"
}
```

Sync types are `INVENTORY`, `RATES`, and `BOOKINGS`. Sync attempts are stored in `channel_sync_logs`.

Channel sync accepts an optional `Idempotency-Key` header with the same replay/conflict behavior as payments.

## Audit Logs API

Audit logs are available to `SUPER_ADMIN` and `ADMIN` users and are property-scoped for hotel admins.

```http
GET /audit-logs?page=1&limit=25&search=refund
```

Audit logs are recorded for reservation-room check-in/checkout, room create/update/delete, payment collection/refunds, channel connection/mapping creation, and channel sync success/failure.

## Media Uploads

Images are saved locally under `apps/backend/uploads/` and served from `/uploads/...`.

Current upload endpoints:

- `POST /properties/:id/images`
- `POST /room-categories/:id/images`

Use multipart form data with:

- `image`: image file
- `caption`: optional caption
- `is_primary`: `true` or `false`

The database stores only image metadata and URL paths, not binary image data. For production, replace local uploads with S3/R2/Cloudinary-compatible object storage.

## Dashboard API

### Summary

```http
GET /dashboard/summary
```

Response fields:

- `total_bookings_today`: bookings created today.
- `occupancy_rate`: occupied rooms divided by total rooms, as a percentage.
- `revenue_today`: sum of paid invoice totals updated today.

The MVP uses Asia/Kolkata day boundaries for today-based metrics.

## Availability API

```http
GET /availability?property_id=:propertyId&from=2026-05-01&to=2026-05-03
Authorization: Bearer <token>
```

Returns room-category inventory, booked count, out-of-service count, available count, and lowest active rate for the date range.

## Housekeeping API

- `GET /housekeeping`
- `POST /housekeeping`
- `PUT /housekeeping/:id`

Housekeeping statuses:

- `DIRTY`
- `CLEANING`
- `CLEAN`
- `INSPECTED`
- `OUT_OF_SERVICE`
