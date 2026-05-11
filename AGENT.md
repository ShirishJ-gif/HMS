# Agent Setup Notes

This repo is a monorepo with:

- `apps/backend`: NestJS API + Prisma
- `apps/frontend`: React + Vite admin UI
- PostgreSQL via `docker compose`

## Prerequisites

- Node.js `20.11+`
- npm `10+`
- Docker

## First-Time Setup

Run from the repo root:

```bash
npm install
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env
npm run db:up
npm run backend:prisma:generate
npm run backend:prisma:migrate
npm run backend:seed
```

Default database URL:

```text
postgresql://hms:hms_password@localhost:5432/hms?schema=public
```

## Start The App

Backend:

```bash
npm run backend:start:dev
```

Frontend:

```bash
npm run frontend:dev
```

If you need the frontend on a fixed visible port:

```bash
cd apps/frontend
npm run dev -- --host 0.0.0.0 --port 5174
```

Expected local URLs:

- Backend: `http://localhost:3000`
- Frontend: usually `http://localhost:5173`
- Frontend fallback used in this session: `http://localhost:5174`

## Seed Login

Admin:

```text
admin@hms.local / Admin@12345
```

Scoped users:

```text
admin.harbour@hms.local / Admin@12345
staff.harbour@hms.local / Staff@12345
admin.lakeview@hms.local / Admin@12345
```

## Quick Verification

Backend health:

```bash
curl http://localhost:3000/health
```

Run backend tests:

```bash
npm run backend:test
```

Run full build:

```bash
npm run build
```

## What Worked In This Session

- Browser login through `POST /auth/login`
- Dashboard load through `GET /dashboard/summary`
- Reservations, guests, rooms, payments, channels, audit logs, webhook events, and background jobs list APIs
- UI-driven guest creation through `POST /guests`
- Full backend test suite passed after fixing one stale spec

## Known Local Quirks

- The backend may already be running on port `3000`. Check before starting another instance.
- The frontend may move off `5173` if that port is busy.
- DB-dependent commands and browser automation may need to run outside a restricted sandbox.
- A stale test was fixed in `apps/backend/src/modules/channel/inventory-sync-payload.service.spec.ts` because `InventorySyncPayloadService` now depends on `InventoryService`.

## Useful Commands

Start DB:

```bash
npm run db:up
```

Stop DB:

```bash
npm run db:down
```

Reseed data:

```bash
npm run backend:seed
```

Run Prisma deploy:

```bash
npm --workspace apps/backend run prisma:deploy
```

## 2026-05-06 Channel Flow Findings

Validated on `2026-05-06` against:

- Backend: `http://localhost:3000`
- Frontend: `http://localhost:5175`
- Browser automation: `agent-browser --headed`
- Scoped user: `admin.harbour@hms.local / Admin@12345`

### HMS APIs Confirmed Working

- `POST /auth/login`
- `GET /properties`
- `GET /room-categories`
- `GET /rate-plans`
- `GET /rooms`
- `GET /channels`

Harbour inventory baseline used by outbound sync:

- `Single`: 1 physical room
- `Double`: 1 physical room
- `Deluxe`: 2 physical rooms
- One Deluxe room is `MAINTENANCE`

### Zodomus Setup Run

Created Zodomus connection through the UI/API:

- connection id: `7883af02-5d89-4972-972f-73042d2872fe`
- provider: `ZODOMUS`
- ota: `Booking.com`
- `external_hotel_id`: `100`

Setup result after `POST /channels/zodomus/setup`:

- `activated = true`
- `catalog_loaded = true`
- `rooms_activated = false`
- `ready = false`

Provider catalog loaded correctly:

- rooms: `10001`, `10002`, `10003`
- room-scoped rates: `100991`, `100992`, `100993` under each room

### Mappings Saved

Room mappings:

- `Single -> 10001`
- `Double -> 10002`
- `Deluxe -> 10003`

Rate mappings:

- `Single Non Refundable -> 10001 / 100991`
- `Single Flexible -> 10001 / 100992`
- `Double Flexible -> 10002 / 100992`
- `Deluxe Flexible -> 10003 / 100992`

### Activation And Readiness Outcome

`POST /channels/:id/rooms-activate` succeeded and activated 3 rooms.

Persisted setup state after room activation:

- `rooms_activated = true`
- `activated_room_count = 3`
- `ready = false`

Provider-side blocker from `POST /channels/:id/property-check`:

- `returnCode = 400`
- `Property status = Evaluation OTA`
- `Channel status = OK`
- `Room status = OK`
- `Product status = Error: Some room/rates are not maped with the channel room/rates. Use /rooms-activation to map room/rates`

Important: even after successful HMS mapping and room activation, provider property `100` is still not live/approved. Subsequent provider operations return `Property status not Active`.

### Sync Outcomes Observed

### Final Resolved State

All remaining OTA blockers were resolved in this session.

Additional HMS rate plans were created so every provider room-rate product had a local mapping:

- `SINGLE-SPL` `Single Special`
- `DOUBLE-NRF` `Double Non Refundable`
- `DOUBLE-SPL` `Double Special`
- `DELUXE-NRF` `Deluxe Non Refundable`
- `DELUXE-SPL` `Deluxe Special`

That completed the full Zodomus matrix for property `100`:

- rooms: `10001`, `10002`, `10003`
- room-scoped rates under each room: `100991`, `100992`, `100993`
- mapped product count: `9/9`

After rerunning room activation and property check:

- `activated = true`
- `catalog_loaded = true`
- `rooms_activated = true`
- `ready = true`
- `Property status = Active`
- `Channel status = OK`
- `Product status = OK`
- `Room status = OK`

### Bugs Fixed

Backend sync outcome classification was corrected in both request paths:

- [apps/backend/src/modules/channel/channel.service.ts](/Users/cronberry/Hms/apps/backend/src/modules/channel/channel.service.ts:2154)
- [apps/backend/src/modules/background-job/background-job.service.ts](/Users/cronberry/Hms/apps/backend/src/modules/background-job/background-job.service.ts:1087)

Fixes:

- `RATES` no longer reports false `SUCCEEDED` when all provider rows fail
- `BOOKINGS` now fails when `reservation_queue.status.returnCode != 200`
- numeric-string summary counts are handled correctly
- background-job booking outcome parsing also now handles numeric provider `returnCode` values

Inventory sync also required an adapter fix:

- [apps/backend/src/modules/channel/providers/zodomus-channel.adapter.ts](/Users/cronberry/Hms/apps/backend/src/modules/channel/providers/zodomus-channel.adapter.ts:1)

Root cause:

- one-day inventory rows were sent with `dateFrom = dateTo`
- Zodomus rejects that with `date to is smaller or equal than date from`

Fix:

- daily inventory rows now send `dateTo = next day`

### Final Live Verification

Verified on `2026-05-06` against `http://localhost:3000` after restarting the patched backend.

Latest successful sync examples:

- `BOOKINGS`
  - sync log id: `559dda25-86b7-4105-a8ba-0d04190717f1`
  - result: `SUCCEEDED`
  - provider queue `returnCode = 200`
- `RATES`
  - sync log id: `b5e5985d-f15f-49c0-aab5-395ece897bcc`
  - result: `SUCCEEDED`
  - summary: `total_rows = 9`, `succeeded_rows = 9`, `failed_rows = 0`
- `INVENTORY`
  - sync log id: `c4ca4015-e336-40c9-95b1-2c3699dfe82c`
  - result: `SUCCEEDED`
  - summary: `total_rows = 9`, `succeeded_rows = 9`, `failed_rows = 0`

Current operational state:

- full setup flow works
- room mapping works
- rate mapping works
- `ready = true`
- inventory sync works
- rate sync works
- booking queue sync works

### Regression Coverage Added

Added direct regression tests for the two service-level sync outcome resolvers that previously misclassified failed provider responses:

- [apps/backend/src/modules/channel/channel.service.spec.ts](/Users/cronberry/Hms/apps/backend/src/modules/channel/channel.service.spec.ts:1)
- [apps/backend/src/modules/background-job/background-job.service.spec.ts](/Users/cronberry/Hms/apps/backend/src/modules/background-job/background-job.service.spec.ts:1)

Inventory sync:

- `POST /channels/:id/sync` with `sync_type=INVENTORY` queued successfully
- final sync log status: `PARTIAL_FAILED`
- provider rejected all `9/9` rows with `Property status not Active`
- this classification is correct

Rate sync:

- `POST /channels/:id/sync` with `sync_type=RATES` queued successfully
- provider rejected all `4/4` rows with `Property status not Active`
- sync log `response_payload.summary.failed_rows = 4`
- final sync log status was still `SUCCEEDED`
- this is a backend classification bug

Booking sync:

- `POST /channels/:id/provider-reservations-create-test` returned provider `400` with `Property status not Active`
- `GET /channels/:id/provider-reservations-queue` returned provider `400` with `Property status not Active`
- `POST /channels/:id/sync` with `sync_type=BOOKINGS` queued successfully
- no reservations were imported
- final sync log status was still `SUCCEEDED`
- this is a backend classification bug

### Likely Follow-Up Work

- Verify the sync outcome fix live on the long-running backend worker after restarting the old process on port `3000`
- Re-check whether Zodomus readiness should remain blocked until all provider room/rate combinations are mapped, or whether provider property `100` simply needs manual activation/approval outside HMS

### Follow-Up Done On 2026-05-06

Patched `apps/backend/src/modules/channel/channel.service.ts` so sync outcome resolution now:

- derives `INVENTORY` and `RATES` status from `row_results` and summary counts
- accepts numeric counts even if JSON stores them as strings
- marks `BOOKINGS` as failed when `reservation_queue.status.returnCode != 200`

Compiled verification against the built service class returned:

- `RATES -> FAILED` for payloads with failed row results
- `BOOKINGS -> FAILED` for provider queue payloads with `returnCode = 400`

Important: a clean live proof still needs the old backend worker on port `3000` restarted, because the shared DB background-job queue was still being processed by that older process during replay.

### Live Verification After Restart

The old backend on port `3000` was restarted after patching both:

- `apps/backend/src/modules/channel/channel.service.ts`
- `apps/backend/src/modules/background-job/background-job.service.ts`

Reason: queued syncs are finalized by the background-job worker, so fixing only `ChannelService` was not enough.

Final live replay on `http://localhost:3000` produced:

- `RATES` sync log `395abdf9-ec5e-441d-b5e0-72c5649d11ba` -> `FAILED`
- `BOOKINGS` sync log `161783df-5cfa-44d8-b496-3e91df2a0dfe` -> `FAILED`

Observed failure messages:

- `RATES`: `4 rate row(s) failed while 0 succeeded.`
- `BOOKINGS`: `Property status not Active`

This confirms the new sync-status classification is working live on port `3000`.
