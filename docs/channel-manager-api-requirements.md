# Channel Manager API Requirements For PMS

This document explains the main APIs a PMS needs from any channel manager. It is provider-neutral, so it can be used when comparing Zodomus with another channel manager.

## Purpose

A PMS and a channel manager must keep three things synchronized:

1. Availability: how many rooms can be sold for each date.
2. Rates: what price should be sold for each room/rate/date.
3. Reservations: bookings, modifications, cancellations, and guest/payment details.

If we remove one channel manager and use another, these API areas are the minimum we need to confirm before migration.

## Required API Groups

| API group | Required | Direction | Why it matters |
|---|---:|---|---|
| Account/authentication | Yes | PMS to provider | Confirms credentials and account access. |
| Property/hotel setup | Yes | PMS to provider | Connects an HMS property to the provider hotel/listing. |
| Provider catalog | Yes | Provider to PMS | Gives provider room IDs, rate IDs, channels, currencies, and pricing models. |
| Room mapping | Yes | PMS local + provider activation | Maps HMS room categories to provider room IDs. |
| Rate mapping | Yes | PMS local + provider activation | Maps HMS rate plans to provider rate IDs, usually room-aware. |
| Availability push | Yes | PMS to provider | Sends sellable inventory per room/date. |
| Rate push | Yes | PMS to provider | Sends prices per room/rate/date. |
| Restrictions push | Strongly preferred | PMS to provider | Sends stop-sell, CTA, CTD, min stay, max stay. |
| Reservation pull | Yes | Provider to PMS or PMS polling provider | Imports new bookings and changes. |
| Reservation detail | Yes | PMS to provider | Fetches full guest/stay/payment/room-line data. |
| Reservation cancellation/modification | Yes | Provider to PMS | Keeps PMS inventory and booking status correct. |
| Webhooks | Strongly preferred | Provider to PMS | Real-time booking, modification, cancellation notifications. |
| Sync logs/status | Yes | PMS local, provider response | Shows what succeeded, failed, and needs retry. |
| Retry/idempotency | Yes | PMS to provider | Prevents duplicate pushes/bookings during failures. |

## Provider APIs We Need

### 1. Authentication And Account Check

The provider should support an API to verify credentials and account status.

Needed data:

- API username/key/token
- account ID or partner ID
- account status
- error response when credentials are invalid

Questions for any new provider:

- Is authentication API-key based, OAuth based, or username/password based?
- Are credentials per hotel, per account, or global for the integration?
- Are rate limits documented?

### 2. Property Or Hotel Setup

The provider should expose APIs to connect or verify a hotel/listing/property.

Needed data:

- provider hotel ID/listing ID
- provider property status
- activation status
- supported OTA channels for that property
- allowed currencies
- pricing model

Typical PMS fields:

- HMS `property_id`
- provider `external_hotel_id`
- selected OTA/channel code
- activation/readiness status

### 3. Provider Catalog

The PMS needs to load provider-side rooms and rates before mapping.

Needed data:

- provider room ID
- provider room name
- provider rate ID
- provider rate name
- room-to-rate relationship
- pricing model
- currency
- channel code, if provider supports multiple OTAs

Important: rate IDs may not be globally unique. A safer mapping key is:

```text
provider_room_id + provider_rate_id
```

### 4. Mapping APIs

The PMS needs to store local mappings even if the provider has its own activation API.

Local HMS mappings:

| HMS object | Provider object |
|---|---|
| Room category | Provider room |
| Rate plan | Provider room + provider rate |

Provider activation may also be required after mappings are saved.

Minimum mapping data:

- HMS room category ID
- HMS rate plan ID
- provider room ID
- provider room name
- provider rate ID
- provider rate name
- activation enabled/disabled flag
- pricing config override, if needed

### 5. Availability Push

The PMS must push availability from its own inventory truth to the provider.

Minimum payload fields:

- provider hotel/listing ID
- provider room ID
- date
- available room count
- stop sell, if supported
- closed to arrival, if supported
- closed to departure, if supported
- min stay/max stay, if supported

Expected behavior:

- Can push one date or date range.
- Can identify row-level failures by room/date.
- Provider response should say which rows succeeded and which failed.
- Failed rows should be retryable.

### 6. Rate Push

The PMS must push rates from HMS rate plans and pricing rules.

Minimum payload fields:

- provider hotel/listing ID
- provider room ID
- provider rate ID
- date
- price
- currency
- occupancy price, if supported
- derived rate offset, if supported
- length-of-stay prices, if supported

Expected behavior:

- Rate sync must be room-aware.
- Active HMS pricing rules should be applied before pushing.
- Provider must return useful errors when rates are rejected.
- Failed rate rows should be visible in sync logs.

### 7. Reservation Import

The PMS must receive or fetch reservations from the channel manager.

Minimum reservation fields:

- provider reservation ID
- provider reservation version or modified timestamp
- status: new, modified, cancelled
- booking source/channel
- booked timestamp
- modified timestamp
- guest name
- guest phone/email, if available
- arrival date
- departure date
- provider room reservation ID
- provider room ID
- provider rate ID
- adults/children
- currency
- total amount
- tax amount, if available
- payment/prepayment information, if available
- raw provider payload for audit/debugging

Expected behavior:

- New bookings create PMS reservation groups and room lines.
- Modifications update stay dates, room lines, guest data, totals, and statuses.
- Cancellations release PMS inventory.
- Duplicate provider reservations must be detected by provider reservation ID.
- The raw provider payload should be stored before import if fetching from a queue.

### 8. Webhooks

Webhooks are strongly preferred because polling alone can miss or delay changes.

Needed webhook events:

- new reservation
- reservation modification
- reservation cancellation
- property/channel status change
- optional: failed delivery retry notification

Webhook requirements:

- signature or shared-secret verification
- dedupe key or stable event ID
- timestamp
- retry policy
- clear payload schema
- way to fetch full reservation detail after receiving the webhook

Minimum HMS webhook shape:

```http
POST /webhooks/:domain/:provider
```

For channel managers:

```http
POST /webhooks/channel/{provider}
```

Current Zodomus compatibility alias:

```http
POST /webhooks/zodomus
```

### 9. Sync Logs And Diagnostics

The PMS should log every provider operation.

Minimum log data:

- connection ID
- sync type: inventory, rates, bookings
- status: queued, succeeded, partial failed, failed
- request payload
- response payload
- row-level results for inventory/rate failures
- error message
- timestamps

This is needed for operations teams to answer:

- Was inventory pushed?
- Did rates fail for one room/date or the whole property?
- Did a booking import fail after the provider queue was consumed?
- Can we retry only failed rows?

## Current HMS Channel Manager Endpoints

These are the main PMS-side APIs currently exposed by HMS.

### Connection Setup

| Endpoint | Purpose |
|---|---|
| `POST /channels` | Create a generic channel connection. |
| `GET /channels` | List channel connections. |
| `GET /channels/workspace` | Load channel workspace data for the frontend. |
| `GET /channels/:id` | Get one channel connection. |
| `DELETE /channels/:id` | Delete a channel connection. |
| `POST /channels/:provider/setup` | Setup provider connection, e.g. `zodomus`. |
| `POST /channels/:id/pause` | Pause sync activity. |
| `POST /channels/:id/resume` | Resume sync activity. |
| `POST /channels/:id/disconnect` | Disconnect a channel. |
| `POST /channels/:id/automation` | Update automation settings. |

### Provider Catalog And Status

| Endpoint | Purpose |
|---|---|
| `GET /channels/:id/provider-catalog` | Load provider rooms/rates/catalog. |
| `GET /channels/:id/provider-account` | Check provider account. |
| `GET /channels/:id/provider-channels` | List provider OTA/channel options. |
| `GET /channels/:id/provider-currencies` | List provider currencies. |
| `GET /channels/:id/provider-price-models` | List provider pricing models. |
| `POST /channels/:id/property-check` | Check provider property readiness. |
| `POST /channels/:id/property-activate` | Activate provider property. |

### Mapping And Activation

| Endpoint | Purpose |
|---|---|
| `POST /channels/:id/room-mappings` | Save one room mapping. |
| `PATCH /channels/:id/room-mappings/:mappingId` | Update one room mapping. |
| `DELETE /channels/:id/room-mappings/:mappingId` | Delete one room mapping. |
| `PATCH /channels/:id/room-mappings/:mappingId/activation` | Enable/disable room mapping activation. |
| `POST /channels/:id/rate-mappings` | Save one rate mapping. |
| `PATCH /channels/:id/rate-mappings/:mappingId` | Update one rate mapping. |
| `DELETE /channels/:id/rate-mappings/:mappingId` | Delete one rate mapping. |
| `PATCH /channels/:id/rate-mappings/:mappingId/activation` | Enable/disable rate mapping activation. |
| `PATCH /channels/:id/rate-mappings/:mappingId/pricing-config` | Save per-rate pricing config. |
| `POST /channels/:id/mappings/batch` | Save mappings in batch. |
| `POST /channels/:id/rooms-activate` | Activate mapped rooms/rates with provider. |
| `POST /channels/:id/rooms-cancellation` | Cancel/deactivate mapped provider rooms. |

### Inventory, Availability, Rates

| Endpoint | Purpose |
|---|---|
| `POST /channels/:id/sync` | Queue inventory, rates, or bookings sync. |
| `POST /channels/:id/availability-multiple` | Push provider availability directly. |
| `POST /channels/:id/rates-multiple` | Push provider rates directly. |
| `GET /channels/:id/provider-availability` | Read provider availability for comparison. |
| `GET /channels/:id/inventory-reconciliation` | Compare HMS inventory with provider state. |
| `GET /channels/:id/inventory-row-results` | See row-level inventory push results. |
| `POST /channels/:id/sync-logs/:syncLogId/retry-failed-rows` | Retry failed inventory rows. |

### Reservations

| Endpoint | Purpose |
|---|---|
| `GET /channels/:id/provider-reservations-queue` | Read provider reservation queue. |
| `GET /channels/:id/provider-reservations-summary` | Read provider reservation summary. |
| `GET /channels/:id/provider-reservations/:reservationId` | Fetch provider reservation detail. |
| `GET /channels/:id/provider-reservations/:reservationId/card` | Fetch reservation card/payment detail if supported. |
| `POST /channels/:id/provider-reservations-create-test` | Create/fetch/import a provider test reservation. |
| `POST /channels/:id/reservations-summary-backfill` | Backfill reservation summary data. |

### Logs And Diagnostics

| Endpoint | Purpose |
|---|---|
| `GET /channels/:id/sync-logs` | List sync logs. |
| `GET /channels/:id/diagnostics` | Show connection diagnostics. |
| `GET /webhook-events` | List stored webhook events. |

## Database Tables Used By Channel Manager

| Table | Role |
|---|---|
| `channel_connections` | Main provider connection. |
| `channel_room_mappings` | HMS room category to provider room mapping. |
| `channel_rate_mappings` | HMS rate plan to provider room/rate mapping. |
| `channel_sync_logs` | Sync attempts and status. |
| `inventory_sync_rows` | Row-level inventory/rate push results. |
| `provider_reservation_intake_records` | Raw fetched provider reservations before/after import. |
| `reservation_groups` | Imported booking group, optionally linked to channel connection. |
| `reservation_rooms` | Imported booking room lines. |
| `inventory_calendar` | HMS inventory truth used for sync. |
| `rate_plans` | HMS rate truth used for sync. |
| `pricing_rules` | PMS pricing rules applied before rate sync. |
| `webhook_events` | Incoming provider webhook events. |
| `background_jobs` | Queued sync/webhook work. |
| `audit_logs` | Operator and sync audit trail. |

## Migration Checklist For Replacing A Channel Manager

Use this checklist before removing Zodomus or adding another provider.

1. Confirm the new provider supports property setup and account validation.
2. Confirm the new provider can return room and rate catalog data.
3. Confirm whether rate IDs are room-scoped or globally unique.
4. Confirm availability push supports date ranges, row-level errors, and retries.
5. Confirm rates push supports the pricing models the property uses.
6. Confirm restriction support: stop-sell, CTA, CTD, min stay, max stay.
7. Confirm reservation webhooks exist for new, modified, and cancelled bookings.
8. Confirm there is a reservation detail API after webhook notification.
9. Confirm webhook signature verification and deduplication rules.
10. Confirm API rate limits and retry/backoff expectations.
11. Confirm sandbox/test hotel availability.
12. Map new provider room IDs to HMS room categories.
13. Map new provider rate IDs to HMS rate plans.
14. Run inventory sync for a small date range first.
15. Run rate sync for a small date range first.
16. Import test reservations covering new, modified, and cancelled flows.
17. Check sync logs, webhook logs, and booking inventory movement.
18. Only then disable/delete old provider connections.

## Minimum Provider Acceptance Criteria

A channel manager is usable for HMS only if all of these are true:

- HMS can authenticate reliably.
- HMS can map local room categories to provider rooms.
- HMS can map local rate plans to provider rates.
- HMS can push availability per room/date.
- HMS can push rates per room/rate/date.
- HMS can receive or fetch reservations.
- HMS can process cancellations and modifications.
- HMS can detect duplicates.
- HMS can store raw payloads for debugging.
- HMS can show failed sync rows and retry them.

Without these, the PMS may oversell rooms, sell wrong prices, miss cancellations, or lose booking data during provider failures.
