# HMS AI Handoff Context

Use this file first in future sessions. It summarizes what exists, how to run it, and what should be built next.

## Project Snapshot

This is a Hotel Management System monorepo:

- Backend: NestJS, TypeScript, Prisma, PostgreSQL.
- Frontend: React/Vite, Axios, functional components.
- Database: PostgreSQL via Docker Compose.
- Auth: JWT with `SUPER_ADMIN`, `ADMIN`, and `STAFF`.
- Auth lifecycle: refresh-token sessions, logout/session revocation, and password reset token endpoints.
- Seed login: `admin@hms.local / Admin@12345`.
- Scoped seed logins: `admin.harbour@hms.local / Admin@12345`, `staff.harbour@hms.local / Staff@12345`, `admin.lakeview@hms.local / Admin@12345`.

## Current Capabilities

- Multi-property setup with properties, room categories, physical rooms, and rate plans.
- Dynamic pricing rules can add weekend, date-range/festival, and occupancy-based surcharges on top of base rates.
- OTA-imported reservations reserve room-category inventory and assign a physical room at check-in.
- Imported OTA reservations are stored as reservation groups with reservation-room lines.
- Availability checks category inventory for a date range.
- Housekeeping tracks room cleaning/out-of-service operations.
- Billing supports invoices and extra charges.
- Reservation-room invoices and reservation-group folio payment allocation are implemented for imported stays.
- Payments are recorded as transactions with adapter dispatch and idempotency-key support. Mock/local providers work; Razorpay/Stripe are still placeholders until credentials and webhook verification are implemented.
- Channel manager support now includes a real Zodomus adapter. Property check, property activation, provider catalog fetch, availability sync, rate sync, reservation queue polling, reservation detail fetch, and reservation import are implemented. SiteMinder/Booking.com direct/Airbnb direct remain placeholders.
- Generic signed webhook ingestion is available for `PAYMENT` and `CHANNEL` domains, with persisted webhook-event logs and replay deduplication.
- Accepted webhooks, channel sync requests, and notification deliveries enqueue persisted background jobs with retry scheduling and dead-letter state.
- Backend HTTP logs now include a request ID, and the frontend sends `x-request-id` so user-facing failures can be traced in server logs.
- Backend metrics are exposed through `GET /metrics` and `GET /metrics/summary`.
- Concrete dashboard panels and first alert thresholds are defined in `docs/metrics-alerting.md`.
- Audit logs record reservation-room check-in/checkout, room create/update/delete, payment collection/refunds, channel setup/mappings, and channel sync outcomes.
- Operational list endpoints support paginated/searchable responses.
- Property and room-category photos can be uploaded locally and previewed in Property Setup.
- WhatsApp notification service sends booking confirmations, hotel-owner booking notifications, and check-in reminders. Delivery now runs through queued background jobs. It defaults to mock logs and supports WhatsApp Cloud API mode through environment variables.
- Frontend pages exist for dashboard, property setup, availability, rooms, bookings, guests, housekeeping, payments, channels, and audit logs.
- The bookings UI is reservation-group based and focuses on imported OTA stays with nested room lines.
- The frontend now has shared compact filter bars, a bookings timeline/ledger toggle, a queried-night availability strip, and richer integrations surfaces for syncs, webhook events, background jobs, and metrics-summary snapshots.
- Public health endpoint: `GET /health`.
- Uploaded files are stored under `apps/backend/uploads/` and served as `/uploads/...`; this folder is gitignored.
- Property isolation is implemented for core hotel data. `SUPER_ADMIN` sees all properties; `ADMIN`/`STAFF` are restricted to their assigned `property_id`.

## Key Files

- Backend app module: `apps/backend/src/app.module.ts`
- Prisma schema: `apps/backend/prisma/schema.prisma`
- Seed data: `apps/backend/prisma/seed.ts`
- SQL schema artifact: `apps/backend/prisma/sql/schema.sql`
- Frontend shell: `apps/frontend/src/App.tsx`
- Frontend API client: `apps/frontend/src/api/client.ts`
- Frontend types: `apps/frontend/src/api/types.ts`
- Audit logs page: `apps/frontend/src/pages/AuditLogsPage.tsx`
- Pagination helper: `apps/frontend/src/api/pagination.ts`
- API examples: `docs/api-examples.http`
- Implemented features: `docs/implemented-features.md`
- Production notes: `docs/production-readiness.md`
- Main context: `PROJECT_CONTEXT.md`

## Main Backend Modules

- `auth`: JWT login, bootstrap, user creation/listing, roles guard.
- `audit-log`: paginated/searchable audit trail for admins.
- `property`: properties, room categories, rate plans.
- `room`: physical room CRUD.
- `guest`: guest creation/listing with pagination/search.
- `booking`: reservation-group listing and imported reservation-room operational actions.
- `availability`: category-level availability.
- `housekeeping`: housekeeping task CRUD/update.
- `billing`: invoice generation, extra charges, payment status correction.
- `payment`: collect/refund payment transaction workflow with provider adapter dispatch, reservation-group folio collection, and paginated/searchable listing.
- `channel`: channel connections, room/rate mappings, provider adapter dispatch, Zodomus setup/sync/import flow, and sync logs.
- `webhook`: signed webhook ingestion, replay-safe event storage, and admin-visible webhook-event listing.
- `background-job`: persisted async job queue with worker loop, retries, dead-letter status, and admin retry endpoint.
- `property`: also owns local image upload endpoints for properties and room categories.
- `notification`: WhatsApp provider boundary with mock and Cloud API modes.
- `health`: public uptime check.

## Run Commands

```bash
npm install
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
npm run db:up
npm run backend:prisma:generate
npm run backend:prisma:migrate
npm run backend:seed
npm run backend:start:dev
npm run frontend:dev
```

Local URLs:

- Backend: `http://localhost:3000`
- Frontend: `http://localhost:5173`

Validation:

```bash
npm test
npm run build
```

## Important Business Rules

- `check_out_date` must be after `check_in_date`.
- Reservation-room totals come from nightly dynamic pricing built from the base rate plus any active pricing rules.
- Overlapping reservation-room stays are allowed only until category inventory is sold out.
- Active reservation statuses for availability are `BOOKED` and `CHECKED_IN`.
- Imported reservation-room lines are included in availability depletion and physical-room conflict checks.
- Check-in assigns an available physical room and marks it `OCCUPIED`.
- Check-out marks the reservation room `CHECKED_OUT` and room `AVAILABLE`.
- Imported reservation-room lines support line-level check-in and check-out, with reservation-group status recomputed from room-line state.
- `MAINTENANCE` rooms are excluded from sellable inventory.
- Billing allows one invoice per reservation room.
- Imported reservation groups can be billed through room-line invoices plus folio-style payment allocation.
- Payments are immutable transaction records; invoice status is derived from paid/refunded totals.
- Channel sync builds payloads from internal mappings and logs request/response payloads.
- Zodomus `BOOKINGS` sync is inbound reservation polling/import rather than outbound booking push.
- Signed payment/channel webhooks are verified with HMAC secrets and deduplicated through persisted replay keys.
- Login plus property setup, room, guest, housekeeping, booking, payment, and channel admin actions now disable duplicate submits in the frontend while requests are in flight.
- Bookings can now be reviewed in both ledger and short-window timeline views, with inline row detail expansion.
- Audit logs now render as a filterable event stream instead of a plain table-only view.
- Sensitive operational actions create audit log records.
- Paginated list responses use `{ data, meta }` across current operational list endpoints.

## Current Production Gaps

- Add e2e tests that prove property-scoped authorization blocks cross-hotel reads/writes.
- Add production email/SMS delivery for password reset tokens and session-management UI.
- Expand audit coverage to user management and any future rate-plan update endpoints.
- Add real payment providers with webhook verification.
- Complete the Zodomus provider-side onboarding flow by wiring `rooms-activation`.
- Add additional real channel adapters such as SiteMinder, Booking.com direct, and Airbnb direct.
- Add e2e API tests against PostgreSQL.
- Add soft-delete policies.
- Add dashboard provisioning, alert routing, and external monitoring configuration.

## Next Best Engineering Steps

1. Add e2e tests that prove property-scoped authorization across every endpoint.
2. Add production reset-token delivery and session-management UI.
3. Add e2e tests for idempotent payment and channel sync replay/conflict behavior.
4. Add e2e tests for booking, payment, audit-log, channel sync, and webhook flows.
5. Finish the remaining Zodomus onboarding gaps and then add additional provider-specific adapters when credentials/contracts are available.
