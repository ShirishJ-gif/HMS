# HMS MVP Project Context

## Overview

This repository contains a production-ready MVP Hotel Management System with a NestJS backend, Prisma ORM, PostgreSQL database, and React admin dashboard.

The app is structured as an npm monorepo:

- `apps/backend`: NestJS REST API
- `apps/frontend`: React/Vite admin dashboard
- `docs`: API request examples and Postman collection

## Current Functionality

### Backend

Implemented modules:

- Room Management
- Guest Management
- Booking / Reservation
- Billing
- Payments
- Channel manager boundary
- Audit logs
- Property and room-category image uploads
- Health check
- Dashboard metrics
- Mock WhatsApp notifications
- WhatsApp booking confirmations, hotel-owner notifications, and check-in reminders through mock or Cloud API mode
- Dynamic pricing rules for weekend, date-range/festival, and occupancy-based surcharges
- Pricing-rule admin lifecycle: create, list, update, disable/enable, and delete
- Generic signed webhook ingestion and webhook-event logging
- Background job queue with retries and dead-letter tracking for async processing
- Metrics scrape and summary endpoints for observability foundations, with concrete dashboard/alert definitions in `docs/metrics-alerting.md`
- JWT authentication and roles
- Refresh-token sessions, logout/session revocation, and password reset token endpoints
- Property-scoped authorization for multi-hotel isolation
- Availability calendar
- Housekeeping task management

### Frontend

Implemented pages:

- Login page
- Dashboard page
- Rooms page
- Bookings page
- Guests page
- Availability page
- Housekeeping page
- Payments page
- Channel Manager page
- Audit Logs page

The frontend uses Axios, reads the backend URL from `VITE_API_BASE_URL`, and sends `x-request-id` headers so frontend-visible failures can be correlated with backend logs. It now also includes shared compact filter bars, a bookings timeline/ledger toggle, an availability stay-window strip, and operator surfaces for syncs, webhook events, background jobs, and metrics-summary snapshots.

## Database

Database: PostgreSQL

ORM: Prisma

Main models:

- `Guest`
- `Property`
- `RoomCategory`
- `RatePlan`
- `Room`
- `Booking`
- `Billing`
- `BillingExtraCharge`
- `PaymentTransaction`
- `AuditLog`
- `ChannelConnection`
- `ChannelRoomMapping`
- `ChannelRateMapping`
- `ChannelSyncLog`
- `PropertyImage`
- `RoomCategoryImage`

Important relations:

- Property has many room categories, rate plans, physical rooms, guests, and bookings.
- Room category has many physical rooms, rate plans, and bookings.
- Rate plan belongs to a room category and provides the booking base rate.
- Booking reserves room-category inventory and may have an assigned physical room.
- Booking has one billing invoice.
- Billing has many extra charges.
- Billing has many payment transactions for collections and refunds.
- Audit logs optionally reference a user and property and store immutable action metadata for operational traceability.
- Channel connections belong to a property and map internal room categories/rate plans to external channel IDs.
- Property and room-category image models store URL paths and metadata; image files are saved locally under `apps/backend/uploads/`.

Important enums:

- `UserRole`: `SUPER_ADMIN`, `ADMIN`, `STAFF`
- `RoomStatus`: `AVAILABLE`, `OCCUPIED`, `MAINTENANCE`
- `BookingStatus`: `BOOKED`, `CHECKED_IN`, `CHECKED_OUT`, `CANCELLED`
- `PaymentStatus`: `PAID`, `PARTIAL`, `PENDING`, `REFUNDED`
- `PaymentProvider`: `MOCK`, `CASH`, `CARD`, `UPI`, `RAZORPAY`, `STRIPE`
- `PaymentTransactionStatus`: `SUCCEEDED`, `FAILED`, `REFUNDED`
- `ChannelProvider`: `MOCK`, `SITEMINDER`, `BOOKING_COM`, `AIRBNB`
- `ChannelConnectionStatus`: `ACTIVE`, `PAUSED`, `ERROR`
- `ChannelSyncType`: `INVENTORY`, `RATES`, `BOOKINGS`
- `ChannelSyncStatus`: `QUEUED`, `SUCCEEDED`, `FAILED`
- `AuditAction`: `CREATE`, `UPDATE`, `DELETE`, `CHECK_IN`, `CHECK_OUT`, `PAYMENT_COLLECT`, `PAYMENT_REFUND`, `CHANNEL_SYNC`
- `HousekeepingStatus`: `DIRTY`, `CLEANING`, `CLEAN`, `INSPECTED`, `OUT_OF_SERVICE`
- `HousekeepingPriority`: `LOW`, `NORMAL`, `HIGH`, `URGENT`

Schema files:

- Prisma schema: `apps/backend/prisma/schema.prisma`
- SQL schema: `apps/backend/prisma/sql/schema.sql`
- Seed data: `apps/backend/prisma/seed.ts`

## Business Rules

- Bookings require valid date ranges.
- `check_out_date` must be after `check_in_date`.
- Booking total is calculated as the sum of per-night computed rates from the rate-plan base rate plus active pricing-rule adjustments.
- Active overlapping bookings are rejected only when room-category inventory is sold out.
- Active booking statuses for overlap checks are `BOOKED` and `CHECKED_IN`.
- Booking creation uses a PostgreSQL transaction-scoped advisory lock per `property_id` and `room_category_id` before inventory counting so concurrent requests cannot oversell the last available category slot.
- Check-in assigns an available physical room, changes booking status to `CHECKED_IN`, and room status to `OCCUPIED`.
- Check-out changes booking status to `CHECKED_OUT` and room status to `AVAILABLE`.
- Rooms in `MAINTENANCE` cannot be booked or checked in.
- Billing allows one invoice per booking.
- Billing total is `amount + tax + extra_charges_total`.
- Payments are recorded as immutable transactions against a billing invoice.
- Successful collections update billing status to `PARTIAL` or `PAID`.
- Refund transactions recalculate billing status and expose refunded totals.
- Payment collection and refunds create audit log records.
- Payment collection and refunds support `Idempotency-Key`.
- Idempotent payment collect/refund requests are serialized per idempotency key before response persistence so concurrent retries do not create duplicate payment-side effects.
- Availability is computed by room category for a date range from physical inventory minus active overlapping bookings.
- Availability returns the lowest dynamic starting rate for the selected `from` date across active rate plans in the room category.
- Maintenance rooms are excluded from sellable inventory.
- Housekeeping tasks track cleaning, inspection, and out-of-service operational work.
- Channel syncs do not write directly to room or booking tables. They build provider payloads from internal inventory/rate mappings and record request/response logs.
- Channel sync requests enqueue background jobs and update sync logs asynchronously instead of blocking the request until provider push completes.
- Channel connection setup, room/rate mappings, and sync outcomes create audit log records.
- Channel sync supports `Idempotency-Key`.
- Idempotent channel sync requests are serialized per idempotency key before response persistence so concurrent retries do not create duplicate sync-side effects or duplicate sync logs.
- Payment and channel webhooks are verified with HMAC secrets, persisted as webhook events, and deduplicated through a stored replay key plus advisory-lock serialization.
- Accepted webhook events enqueue persisted background jobs with retry scheduling and dead-letter state instead of completing all processing inline.
- Booking confirmations, hotel-owner booking notifications, and check-in reminders enqueue persisted notification jobs with retry scheduling and dead-letter state instead of sending inline from the request path.
- `MOCK`, `CASH`, `CARD`, and `UPI` payments use the local payment adapter; `RAZORPAY` and `STRIPE` are adapter placeholders that reject live calls until credentials, webhook verification, and idempotency are added.
- `MOCK` channel syncs use the local channel adapter; `SITEMINDER`, `BOOKING_COM`, and `AIRBNB` are adapter placeholders that reject live syncs until credentials, retries, and webhook reconciliation are added.
- Images are uploaded as multipart files and stored locally for MVP only. Production should move to S3/R2/Cloudinary-style object storage.
- `SUPER_ADMIN` can see and manage all hotels.
- `ADMIN` and `STAFF` are scoped to `user.property_id` and cannot access other hotel records.
- `ADMIN` can configure room inventory, rate setup, channel mappings, and create same-property users.
- `STAFF` can perform day-to-day operations such as guests, bookings, housekeeping, and payments within their hotel.
- Refresh-token rotation, targeted logout, global logout, and password-reset session invalidation are now verified through PostgreSQL-backed integration coverage.
- Booking creation, check-in, checkout, and automatic invoice creation are now verified through PostgreSQL-backed integration coverage.
- Booking-created notification jobs are now verified through PostgreSQL-backed integration coverage.

## API Summary

Base URL:

```text
http://localhost:3000
```

Auth:

- `POST /auth/login`
- `POST /auth/bootstrap`
- `POST /auth/refresh`
- `POST /auth/logout`
- `POST /auth/password-reset/request`
- `POST /auth/password-reset/confirm`
- `POST /auth/users`
- `GET /auth/users?page=1&limit=25&search=admin`
- `GET /health`
- `GET /metrics`
- `GET /metrics/summary`
- `GET /background-jobs`
- `POST /background-jobs/:id/retry`

All non-auth APIs require a bearer token.

Paginated/searchable list endpoints support `page`, `limit`, and `search` query params and return `{ data, meta }`. This applies to users, properties, room categories, rate plans, rooms, guests, bookings, billings, payments, housekeeping tasks, channel connections, channel sync logs, and audit logs.

### Rooms

- `POST /rooms`
- `GET /rooms`
- `GET /rooms?page=1&limit=25&search=301`
- `PUT /rooms/:id`
- `DELETE /rooms/:id`

### Property Setup

- `POST /properties`
- `GET /properties`
- `GET /properties?page=1&limit=25&search=Harbour`
- `POST /room-categories`
- `GET /room-categories`
- `GET /room-categories?page=1&limit=25&search=Deluxe`
- `POST /rate-plans`
- `GET /rate-plans`
- `GET /rate-plans?page=1&limit=25&search=Flexible`

### Guests

- `POST /guests`
- `GET /guests`
- `GET /guests?page=1&limit=25&search=Priya`

### Bookings

- `POST /bookings`
- `GET /bookings`
- `GET /bookings?page=1&limit=25&search=Priya`
- `PUT /bookings/:id/checkin`
- `PUT /bookings/:id/checkout`
- `POST /bookings/:id/checkin-reminder`

### Billings

- `POST /billings`
- `GET /billings`
- `GET /billings/:id`
- `POST /billings/:id/extra-charges`
- `PUT /billings/:id/payment-status`

### Payments

- `GET /payments`
- `GET /payments?page=1&limit=25&search=receipt`
- `POST /payments/collect`
- `POST /payments/:id/refund`

### Channels

- `GET /channels`
- `POST /channels`
- `POST /channels/:id/room-mappings`
- `POST /channels/:id/rate-mappings`
- `POST /channels/:id/sync`
- `GET /channels/:id/sync-logs`

### Audit Logs

- `GET /audit-logs?page=1&limit=25&search=refund`

### Media

- `POST /properties/:id/images`
- `POST /room-categories/:id/images`

### Dashboard

- `GET /dashboard/summary`

### Availability

- `GET /availability?property_id=:propertyId&from=YYYY-MM-DD&to=YYYY-MM-DD`

### Housekeeping

- `GET /housekeeping`
- `POST /housekeeping`
- `PUT /housekeeping/:id`

Dashboard returns:

- `total_bookings_today`
- `occupancy_rate`
- `occupied_rooms`
- `total_rooms`
- `revenue_today`

Today-based dashboard metrics use Asia/Kolkata day boundaries.

## Mock WhatsApp Integration

The mock notification service is implemented in:

```text
apps/backend/src/modules/notification/whatsapp-notification.service.ts
```

Current triggers:

- Booking created: sends mock booking confirmation.
- Booking created: sends hotel-owner notification to the property phone with quick-reply options.
- Check-in reminder route: sends mock reminder.

Set `WHATSAPP_PROVIDER=cloud_api`, `WABA_ACCESS_TOKEN`, and `WABA_PHONE_NUMBER_ID` to use WhatsApp Cloud API. The default `mock` provider logs outgoing messages.

## Frontend Context

Frontend files:

- App shell: `apps/frontend/src/App.tsx`
- API client: `apps/frontend/src/api/client.ts`
- API types: `apps/frontend/src/api/types.ts`
- Dashboard page: `apps/frontend/src/pages/DashboardPage.tsx`
- Rooms page: `apps/frontend/src/pages/RoomsPage.tsx`
- Bookings page: `apps/frontend/src/pages/BookingsPage.tsx`
- Guests page: `apps/frontend/src/pages/GuestsPage.tsx`
- Audit logs page: `apps/frontend/src/pages/AuditLogsPage.tsx`

Current frontend capabilities:

- View dashboard metrics.
- Create properties, room categories, and rate plans.
- View category-level availability with a stay-window strip for the queried dates.
- Create and delete rooms.
- View rooms.
- Filter rooms, guests, bookings, payments, channels, and audit logs with compact shared controls.
- Create guests.
- View guests.
- Create bookings against category inventory and rate plans.
- Check in bookings.
- Check out bookings.
- Review bookings in ledger and short-window timeline views, with inline detail expansion.
- Create and update housekeeping tasks.
- View invoices and payment transactions.
- Collect invoice payments through the mock payment provider boundary.
- View channel connections and mappings.
- Trigger mock inventory/rate/booking syncs and inspect recent sync logs.
- Review channel operations through sync, background-job, webhook, and metrics-summary surfaces.
- Review audit logs for sensitive operational actions in an event-stream layout with actor/action filters.
- Upload and preview property and room-category photos.
- Surface backend request-aware API errors, including request IDs when available.
- Disable duplicate submits for login, property setup, rooms, guests, housekeeping, booking, payment, and channel admin actions while requests are in flight.

## Setup Commands

Install dependencies:

```bash
npm install
```

Create env files:

```bash
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
```

Start PostgreSQL:

```bash
npm run db:up
```

Apply database migration:

```bash
npm run backend:prisma:migrate
```

Seed sample data:

```bash
npm run backend:seed
```

Start backend:

```bash
npm run backend:start:dev
```

Start frontend:

```bash
npm run frontend:dev
```

Seed admin:

```text
admin@hms.local / Admin@12345
admin.harbour@hms.local / Admin@12345
staff.harbour@hms.local / Staff@12345
admin.lakeview@hms.local / Admin@12345
```

## Validation Commands

Run backend tests:

```bash
npm test
```

Build backend and frontend:

```bash
npm run build
```

Run only frontend build:

```bash
npm run frontend:build
```

Run only backend build:

```bash
npm run backend:build
```

## Current Local Runtime

When last started:

- PostgreSQL was running through Docker Compose.
- Backend was running on `http://localhost:3000`.
- Frontend was running on `http://localhost:5173`.
- `GET /dashboard/summary` returned seeded dashboard metrics successfully.

## Documentation Files

- Main README: `README.md`
- Implemented features: `docs/implemented-features.md`
- API examples: `docs/api-examples.http`
- Postman collection: `docs/postman-collection.json`
- Project context: `PROJECT_CONTEXT.md`
- AI handoff context: `docs/ai-handoff.md`
- Production readiness notes: `docs/production-readiness.md`

## Known Gaps / Future Work

- Add automated e2e tests specifically proving cross-property access is forbidden.
- Real OTA/channel manager live adapters are not implemented yet. The current channel module has adapter dispatch, mock syncs, mappings, sync logs, and explicit placeholders for external providers.
- Real payment live adapters and webhook verification are not implemented yet. The current payment module has adapter dispatch, mock/local collection flow, idempotency keys, and explicit placeholders for Razorpay/Stripe.
- Refresh-token sessions, session revocation, and password reset token flows exist. Production still needs email/SMS delivery for reset tokens and stricter device/session management UX.
- Audit logs exist for key operational actions, but a broader interceptor-based audit policy and full user-management audit coverage are still future work.
- Production deployment configuration is documented but not implemented as Docker/Kubernetes/Terraform files.
- No e2e tests yet.
- Pagination/search exists across current operational list endpoints.
- No soft-delete behavior for rooms or guests yet.

## Future-Ready Design Notes

- Add live OTA/channel manager integrations behind the existing channel adapter dispatch.
- Keep external channel IDs in mapping tables, not on core booking/room/rate tables.
- Replace mock WhatsApp sender with Twilio, Gupshup, or WhatsApp Business Cloud API provider adapter.
- Add e2e property-scope tests before exposing this as a real multi-tenant SaaS platform.
