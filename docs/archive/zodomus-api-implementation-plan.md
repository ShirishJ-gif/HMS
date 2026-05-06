# Zodomus API Implementation Plan

Historical reference: this document captures the original implementation plan. It remains useful for rationale and provider details, but it is not the canonical statement of current system behavior.

Last updated: 2026-05-04

## Goal

Implement Zodomus as the first real OTA channel adapter in this HMS backend, using the existing channel sync, background job, audit log, and webhook foundations.

## External Reference

Primary reference used for this plan:

- Zodomus developers page: https://www.zodomus.com/developers

Key facts from that page:

- Base endpoint: `https://api.zodomus.com`
- Auth: HTTP Basic Auth with API user and API password
- Sandbox is available and should be used first
- Relevant API groups for this HMS:
  - Account: `/account`, `/channels`
  - Mapping: `/property-activation`, `/property-check`, `/rooms-activation`
  - Rates and availability: `/room-rates`, `/availability`, `/rates`, `/rates-derived`
  - Reservations: `/reservations-queue`, `/reservations`, `/reservations-summary`
  - Content: `/property`, `/room`, `/rate`

## Current HMS Fit

The current codebase already has most of the right boundaries:

- channel connection and mapping models in `apps/backend/prisma/schema.prisma`
- channel endpoints in `apps/backend/src/modules/channel/channel.controller.ts`
- sync queue and logs in `apps/backend/src/modules/channel/channel.service.ts`
- provider adapter boundary in `apps/backend/src/modules/channel/channel-provider.service.ts`
- background job execution in `apps/backend/src/modules/background-job/background-job.service.ts`
- generic webhook ingest in `apps/backend/src/modules/webhook/webhook.service.ts`

Current limitation:

- `ChannelProviderService` only supports `MOCK`
- external channel providers intentionally throw `NotImplementedException`
- sync payload generation only covers `INVENTORY` and `RATES`
- reservation ingestion from external channels is not implemented
- webhook processing is generic but does not yet contain provider-specific business logic

## Recommended Scope

Do not implement the full Zodomus surface in the first pass.

### Phase 1

Ship the minimum path that matches the current HMS domain well:

- create a Zodomus channel connection
- validate credentials against Zodomus
- activate property and room/rate mappings
- push inventory
- push rates
- import reservations

### Phase 2

Add operational hardening:

- reservation update and cancellation reconciliation
- provider-specific webhook verification if Zodomus provides callbacks for the chosen flows
- retry classification and better provider error mapping
- sync observability and admin troubleshooting fields

### Phase 3

Only after Phase 1 and 2 are stable:

- content APIs for property, room, and rate creation/update
- promotions
- reviews
- reporting
- opportunities

## Endpoint Mapping

| HMS need | Zodomus API | Phase | Notes |
| --- | --- | --- | --- |
| Verify account and channels | `GET /account`, `GET /channels` | 1 | Use during connection test and health checks |
| Validate property eligibility | `POST /property-check` | 1 | Run before activation |
| Activate property on channel | `POST /property-activation` | 1 | Store external property status/result |
| Activate room/rate mappings | `POST /rooms-activation` | 1 | Driven from `channelRoomMapping` and `channelRateMapping` |
| Fetch provider room/rate metadata | `GET /room-rates` | 1 | Useful for mapping validation and UI autofill |
| Push availability | `POST /availability` | 1 | Maps to HMS `INVENTORY` sync |
| Push rates | `POST /rates` | 1 | Maps to HMS `RATES` sync |
| Pull reservation queue | `GET /reservations-queue` | 1 | Recommended first reservation import path |
| Fetch reservation detail | `GET /reservations` | 1 | Use per queued reservation |
| Pull future reservation summary | `GET /reservations-summary` | 2 | Useful for reconciliation/backfill |
| Manage channel property content | `POST /property`, `POST /room`, `POST /rate` | 3 | Defer until core sync is stable |

## Architecture Decisions

### 1. Add Zodomus as an explicit provider

Update `ChannelProvider` in Prisma to include `ZODOMUS`.

Reason:

- Zodomus is not just another generic `BOOKING_COM` or `AIRBNB` integration
- it is an aggregator API with its own auth, payloads, and operational behavior
- it deserves its own adapter and connection type

### 2. Keep the existing adapter boundary

Do not rewrite the channel module. Extend the existing provider boundary instead.

Recommended file split:

- keep `channel-provider.service.ts` as the provider router
- add `apps/backend/src/modules/channel/providers/zodomus-channel.adapter.ts`
- add `apps/backend/src/modules/channel/providers/zodomus-client.ts`
- add `apps/backend/src/modules/channel/providers/zodomus.types.ts`

### 3. Prefer reservation polling first, not webhook-first

The Zodomus public developers page clearly documents reservation queue endpoints. That is a better first fit than assuming webhook-driven reservation delivery.

Reason:

- current HMS already has background jobs
- polling is easier to certify and replay safely
- reservation queue import can be made idempotent with external reservation IDs

## Data Model Changes

## Required

### Prisma enum updates

- add `ZODOMUS` to `ChannelProvider`

### Channel connection credentials

Continue using `ChannelConnection.credentials`, but standardize the expected shape for Zodomus:

```json
{
  "api_user": "string",
  "api_password": "string",
  "environment": "sandbox|production",
  "channel_code": "booking|expedia|airbnb|...",
  "webhook_secret": "optional-string"
}
```

### Additional channel connection fields

Consider adding these fields if Phase 1 needs stronger operational visibility:

- `external_account_id`
- `last_connection_check_at`
- `last_connection_check_status`
- `last_reservation_cursor`

These can be stored either as first-class columns or inside a structured provider metadata JSON field. First-class columns are better if they will be queried often.

### External reservation linkage

Phase 1 reservation import will be fragile without a way to dedupe external reservations.

Add one of these:

- preferred: a reservation-link table or equivalent reservation-group linkage
- older first-pass option: nullable external fields on legacy `Booking`

Recommended link fields:

- `channel_connection_id`
- `external_reservation_id`
- `external_reservation_version` or `modified_at`
- `external_status`
- `raw_payload`

Add a unique constraint on:

- `channel_connection_id + external_reservation_id`

## Service Changes

### Channel connection creation

In `apps/backend/src/modules/channel/channel.service.ts`:

- validate Zodomus credential shape on create
- optionally call `GET /account` or `GET /channels` as a connection test
- reject incomplete credentials before persisting an `ACTIVE` connection

### Provider adapter

In the new Zodomus adapter:

- build an HTTP client with Basic Auth
- switch base URL by `environment`
- normalize provider errors into a stable internal shape
- return structured `responsePayload` objects for sync logs

Minimum adapter methods:

- `validateConnection()`
- `activateProperty()`
- `activateRoomsAndRates()`
- `pullRoomRates()`
- `pushAvailability()`
- `pushRates()`
- `pullReservationQueue()`
- `getReservation()`

### Sync behavior

Current sync flow already queues a `CHANNEL_SYNC` job. Keep that.

Change the implementation so that:

- `INVENTORY` sync calls Zodomus `POST /availability`
- `RATES` sync calls Zodomus `POST /rates`
- `BOOKINGS` does not try to push reservations outbound

Important adjustment:

- `BOOKINGS` should mean `pull/import reservations from provider`, not outbound sync

That means `buildSyncPayload()` in `channel.service.ts` will need provider-aware logic or a separate import path.

### Reservation import flow

Add a dedicated service, for example:

- `apps/backend/src/modules/channel/zodomus-reservation-import.service.ts`

Suggested import algorithm:

1. Call `GET /reservations-queue`
2. For each queued reservation reference, call `GET /reservations`
3. Resolve mapped property, room category, and rate plan
4. Upsert the external reservation link
5. Create or update local reservation records
6. Record audit log and sync log metadata
7. Mark import outcome in job result payload

### Background jobs

Current job types are:

- `WEBHOOK_PROCESS`
- `CHANNEL_SYNC`
- `NOTIFICATION_SEND`

That is enough for a first pass if reservation import is triggered through `CHANNEL_SYNC` with `sync_type = BOOKINGS`.

If reservation import becomes frequent, add a dedicated job type later:

- `CHANNEL_RESERVATION_IMPORT`

## API and DTO Changes

### `CreateChannelConnectionDto`

Keep the current DTO, but add provider-specific validation rules for `credentials` when `provider === ZODOMUS`.

Recommended required credential keys:

- `api_user`
- `api_password`
- `environment`
- `channel_code`

### `SyncChannelDto`

Current fields:

- `sync_type`
- `from`
- `to`

For Zodomus, Phase 1 may need optional fields such as:

- `full_refresh`
- `reservation_ids`
- `dry_run`

If added, keep them optional and provider-safe.

### New admin endpoints

Recommended additions:

- `POST /channels/:id/validate`
- `POST /channels/:id/activate-property`
- `POST /channels/:id/activate-rooms`
- `GET /channels/:id/provider-room-rates`

Reason:

- these are setup operations, not normal sync operations
- they should be explicit and separately auditable

## Mapping Rules

The current HMS already stores:

- `external_hotel_id`
- room mappings
- rate mappings

That aligns well with Zodomus.

Phase 1 mapping rules:

- `ChannelConnection.externalHotelId` maps to the Zodomus property/hotel identifier
- `ChannelRoomMapping.externalRoomId` maps to the Zodomus room identifier
- `ChannelRateMapping.externalRateId` maps to the Zodomus rate identifier

Before allowing sync:

- require at least one room mapping for inventory sync
- require at least one rate mapping for rate sync
- require `external_hotel_id`
- require active credentials

## Webhooks

The current webhook layer is generic and useful, but Zodomus webhook behavior is not clearly documented on the public developers page.

Plan:

- do not block Phase 1 on webhook integration
- keep webhook support optional until Zodomus backoffice/API reference confirms event formats and signature scheme
- if callbacks exist, implement provider-specific verification instead of reusing only the current shared channel secret

Important current gap:

- `WebhookService` uses one shared `CHANNEL_WEBHOOK_SECRET`
- real provider integrations usually need provider-specific or connection-specific secrets

Recommended future shape:

- resolve webhook secret by provider and connection
- store the secret on the channel connection or provider config

## Error Handling and Observability

### Error classes to normalize

- auth failure
- invalid property mapping
- invalid room/rate mapping
- unsupported channel capability
- rate limit / throttling
- transient provider outage
- validation error from provider payload rules

### What to store in sync logs

For Zodomus `responsePayload`, store:

- endpoint called
- provider request id if present
- accepted / rejected status
- provider error code
- provider error message
- external references returned

### Metrics

Extend existing metrics with labels for:

- `provider = ZODOMUS`
- operation type: `availability_push`, `rates_push`, `reservation_import`

## Test Plan

### Unit tests

- credential validation for Zodomus connections
- adapter request building for availability and rates
- provider error parsing
- reservation payload to local reservation-record mapping
- duplicate reservation import handling

### Integration tests

- create Zodomus connection and mappings
- queue inventory sync and verify log success
- queue rates sync and verify log success
- queue reservation import sync and verify reservation records are created idempotently
- retry transient provider failures through background jobs

### Sandbox validation

Before production rollout:

- verify `/account`
- verify `/channels`
- verify property activation
- verify room/rate activation
- verify one availability push
- verify one rates push
- verify one test reservation import

## Implementation Order

1. Add `ZODOMUS` provider enum and run Prisma migration.
2. Add provider-specific credential validation.
3. Implement `zodomus-client.ts` with Basic Auth and environment switching.
4. Implement read-only connection validation using `/account` or `/channels`.
5. Implement property and room/rate activation endpoints.
6. Implement `GET /room-rates` fetch for mapping validation.
7. Implement inventory push with `POST /availability`.
8. Implement rate push with `POST /rates`.
9. Implement reservation import using `/reservations-queue` and `/reservations`.
10. Add tests, sandbox docs, and operational runbook.

## Files Likely To Change

- `apps/backend/prisma/schema.prisma`
- `apps/backend/src/modules/channel/channel-provider.service.ts`
- `apps/backend/src/modules/channel/channel.service.ts`
- `apps/backend/src/modules/channel/channel.controller.ts`
- `apps/backend/src/modules/channel/dto/create-channel-connection.dto.ts`
- `apps/backend/src/modules/channel/dto/sync-channel.dto.ts`
- `apps/backend/src/modules/background-job/background-job.service.ts`
- `apps/backend/src/modules/webhook/webhook.service.ts`
- new files under `apps/backend/src/modules/channel/providers/`
- new tests under `apps/backend/src/modules/channel/` and `apps/backend/src/integration/`

## Non-Goals For First Pass

- direct Booking.com, Airbnb, or Expedia integrations outside Zodomus
- guest review APIs
- promotions APIs
- reporting APIs
- OTA content parity across every channel
- PCI-sensitive credit card reservation data storage

## Recommended First Deliverable

The first shippable milestone should be:

- create a Zodomus connection
- validate credentials
- activate mappings
- push inventory
- push rates
- import reservations into local reservation records idempotently

That delivers real business value without overcommitting to the full Zodomus API surface too early.
