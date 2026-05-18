# Connection Lifecycle

Last updated: 2026-05-10

This is the current HMS -> Zodomus connection and sync lifecycle.

## 1. Create connection

Frontend calls HMS:

```http
POST /channels/zodomus/setup
```

Body:

```json
{
  "property_id": "HMS_PROPERTY_UUID",
  "ota_key": "BOOKING_COM",
  "external_hotel_id": "100"
}
```

HMS backend then:

1. creates the local `ChannelConnection`
2. validates provider access with `GET /account`
3. validates channel catalog with `GET /channels`
4. tries `POST /property-activation`
5. runs `POST /property-check`
6. loads `GET /room-rates`
7. stores setup snapshot and returns the provider catalog

Important:

- `property_id` is the HMS property UUID
- `external_hotel_id` is the Zodomus property ID
- activation can return `400` for an already-active property and still be operationally acceptable if `property-check` returns all OK
- `GET /account`, `POST /property-check`, inventory sync, rate sync, and booking polling all use the backend env credentials `ZODOMUS_API_USER` + `ZODOMUS_API_PASSWORD`
- if those env credentials are wrong, the connection mappings can still look correct locally while every live provider call fails with `401`

## 2. Load provider catalog

Frontend can reload the provider catalog later with:

```http
GET /channels/:connectionId/provider-catalog
```

This calls:

```http
GET /room-rates
```

The catalog matters in two layers:

- provider rooms
- provider room-scoped rates

Important:

- Zodomus rates are not globally unique enough by `rateId` alone
- the real key is `external_room_id + external_rate_id`

## 3. Save room mappings

Frontend calls HMS:

```http
POST /channels/:connectionId/room-mappings
```

Body:

```json
{
  "room_category_id": "HMS_ROOM_CATEGORY_UUID",
  "external_room_id": "10001"
}
```

This saves:

```text
HMS RoomCategory -> Zodomus roomId
```

This mapping is category-level, not physical-room-level.

## 4. Save rate mappings

Frontend calls HMS:

```http
POST /channels/:connectionId/rate-mappings
```

Body:

```json
{
  "rate_plan_id": "HMS_RATE_PLAN_UUID",
  "external_room_id": "10001",
  "external_rate_id": "100991"
}
```

This saves:

```text
HMS RatePlan -> Zodomus roomId + rateId
```

Important:

- HMS now stores rate mappings as room-aware mappings
- this is required because Zodomus can reuse the same `rateId` under multiple rooms
- the UI should filter provider rates to the mapped provider room for the selected HMS rate plan

## 5. Activate mapped rooms

Frontend calls HMS:

```http
POST /channels/:connectionId/rooms-activate
```

HMS backend builds the provider payload from:

- saved `ChannelRoomMapping`
- saved `ChannelRateMapping`
- physical room counts in HMS

Then it calls:

```http
POST /rooms-activation
```

and persists:

- `rooms_activated`
- `rooms_activated_at`
- `activated_room_count`
- `ready = false`
- `ready_at = null`

The operator must then run the final readiness check:

```http
POST /property-check
```

Only that post-room-activation property check can move the connection back to `ready = true`.

## 6. Readiness gate

A connection is operationally live only when HMS has:

- `activated = true`
- `catalog_loaded = true`
- `rooms_activated = true`
- `ready = true`
- `disconnected = false`

Property checks before room activation can store provider status, but they cannot mark the connection ready. After room activation, HMS resets `ready` and waits for a separate final property check.

## 7. Outbound syncs

Frontend/manual or scheduler calls HMS:

```http
POST /channels/:id/sync
```

Inventory:

```json
{
  "sync_type": "INVENTORY",
  "from": "2026-05-05",
  "to": "2026-05-10"
}
```

Rates:

```json
{
  "sync_type": "RATES",
  "from": "2026-05-05",
  "to": "2026-05-10"
}
```

HMS then calls Zodomus:

- `POST /availability`
- `POST /rates`

Important:

- inventory truth comes from HMS DB
- HMS builds inventory as one row per mapped provider room per day
- Zodomus receives one `/availability` push per room/date row
- rate truth comes from HMS DB
- rate sync must use `external_room_id + external_rate_id`
- HMS now builds rate sync as one row per mapped provider room/rate per day
- active HMS pricing rules are applied before each daily Zodomus `/rates` push
- Zodomus receives one `/rates` push per room/rate/date row for price models `1`, `3`, `4`, and `5`
- derived Booking pricing, price model `2`, receives `POST /rates` for the default price and then `POST /rates-derived` for base occupancy and offsets
- per-rate `pricing_config` on `channel_rate_mappings` can override default placeholders:
  - `single_price` for Maximum / Single
  - `baseOccupancy` or `base_occupancy` for Derived, Per Day, and Length of Stay
  - `offsets` or `derived_offsets` for Derived pricing
  - `occupancy_prices` for Occupancy pricing
  - `length_of_stay_prices` or `los_prices` for Length of Stay pricing
- routine Zodomus `sync_window_days` is the rolling scheduler/manual window
- explicit full-sync actions use `full_sync_window_days`, which defaults to `365` in production
- inventory sync status can now be `SUCCEEDED`, `PARTIAL_FAILED`, or `FAILED`
- provider `returnCode != 200` now counts as a failed row/result, so provider business rejection is no longer shown as a successful sync
- rate sync outcome now uses provider row/result summaries too, instead of defaulting every completed push to `SUCCEEDED`

## 8. Reservation import by polling

Frontend/manual or scheduler calls HMS:

```http
POST /channels/:id/sync
```

Body:

```json
{
  "sync_type": "BOOKINGS"
}
```

HMS then calls:

1. `GET /reservations-summary`
2. `GET /reservations` for each discovered reference

Then HMS importer:

1. resolves room mapping by `external_room_id`
2. resolves rate mapping by `external_room_id + external_rate_id`
3. upserts guest
4. creates or updates `ReservationGroup`
5. creates or updates `ReservationRoom`

Important:

- new provider reservations whose stay has already departed are skipped instead of failing local inventory allocation
- repeated Zodomus reservation detail fetches can eventually return `Reservation already downloaded 5 times. The limit was reached.`, which is a provider-side limit rather than an HMS import bug

Important:

- HMS now backfills recent past provider stays and skips only reservations whose latest departure is older than the current 30-day import window.
- The stale-stay cutoff is computed in the property's configured timezone, not raw UTC date.
- Import can still fail intentionally when a mapped room category has no remaining local inventory for the requested stay dates.
- Incomplete room/rate mappings still block import for the affected provider reservation lines.

## 9. Reservation import by webhook trigger

Zodomus can trigger reservation intake through webhook delivery.

Provider calls HMS:

```http
POST /webhooks/channel/zodomus
```

Expected backend env:

```env
ZODOMUS_WEBHOOK_KEY="..."
```

The webhook is the fast trigger path, not the final import payload source.

HMS behavior:

1. verify webhook secret or signature
2. store `webhook_events` row
3. enqueue `WEBHOOK_PROCESS`
4. match active Zodomus connection by:
   - provider `external_hotel_id`
   - provider `channel_id`
   - final readiness state
5. enqueue `BOOKINGS` sync for that connection
6. if webhook payload includes `reservation_id`, `reservationId`, `reservation_ids`, or `reservationIds`, try targeted `GET /reservations` for those reservations first
7. if targeted fetch is unavailable, incomplete, or hits the provider download limit, fall back to reservation queue reconciliation
8. import the resolved reservation payloads

This keeps:

- webhook = fast trigger
- targeted reservation fetch = fast-path import when the webhook identifies a booking
- reservation queue/detail APIs = fallback and normalized reconciliation source

Validated local webhook behavior:

- A signed `POST /webhooks/channel/zodomus` request with `propertyId`, `channelId`, and `reservationId` is accepted as a `WebhookEvent`.
- The webhook processor queues a webhook-triggered `BOOKINGS` sync for the matching ready Zodomus connection.
- The sync fetches the targeted reservation from Zodomus when possible.
- Provider reservation status `3` is imported as `CANCELLED`.
- Cancellation of an already-imported reservation updates the reservation group and all room lines to `CANCELLED`; the reservation remains visible for history and no longer blocks active inventory.

Current edge behavior:

- If HMS first sees a provider reservation only after it is already cancelled and Zodomus returns no room lines, HMS skips it instead of inventing incomplete local reservation data.
- Zodomus sandbox test reservations can return duplicate room-line data under different reservation IDs or stale past stays; HMS intentionally skips duplicates and stale stays.
- The current webhook verification uses one configured `ZODOMUS_WEBHOOK_KEY` or channel webhook secret from env. This is acceptable for a single Zodomus webhook secret setup; per-connection webhook secrets would be a future hardening step for multi-account isolation.

## 9A. One-time future reservation backfill

At production go-live, the operator can manually queue a one-time reservation summary backfill:

```http
POST /channels/:connectionId/reservations-summary-backfill
```

HMS requires the Zodomus connection to be ready, then queues a `BOOKINGS` sync with:

```json
{
  "reservation_import": {
    "mode": "summary_backfill"
  },
  "trigger": "manual_summary_backfill"
}
```

The worker calls:

1. `GET /reservations-summary`
2. `GET /reservations` for discovered reservation IDs

This is not part of routine polling. Normal ongoing intake remains webhook first, with `GET /reservations-queue` as the fallback.

## 9B. Provider reservation intake records

Zodomus `GET /reservations` can consume a reservation from the provider queue. To avoid losing the fetched payload when local import fails, HMS persists each fetched reservation detail before import.

For every fetched reservation detail in a queued `BOOKINGS` sync, HMS stores a `provider_reservation_intake_records` row with:

- `channel_sync_log_id`
- `channel_connection_id`
- `property_id`
- `external_reservation_id`
- raw provider payload
- intake status
- error message when import fails

Intake statuses:

- `FETCHED`: detail was received from Zodomus and stored before local import
- `IMPORTED`: local import created, updated, or cancelled the HMS reservation
- `SKIPPED`: HMS intentionally skipped the payload, for example stale or duplicate provider data
- `FAILED`: local import failed after the provider detail was already fetched

This gives operators a recoverable HMS-side record even when the provider queue item is no longer available from Zodomus.

## 10. Inventory fan-out after import

After a successful Zodomus reservation import that changed room-stay inventory, HMS now immediately queues `INVENTORY` syncs for the other ready Zodomus connections on the same property.

Flow:

```text
OTA -> Zodomus -> HMS import -> HMS inventory recalculation -> Zodomus -> other OTAs
```

## 11. Inventory reconciliation and row analytics

HMS now exposes two operational inventory diagnostics on top of sync logs.

### Reconciliation

```http
GET /channels/:connectionId/inventory-reconciliation
```

This compares:

- the latest successful inventory sync snapshot
- the freshly recalculated HMS inventory for the same date window

It returns:

- overall status: `NO_BASELINE`, `IN_SYNC`, `DRIFT_DETECTED`
- compared window
- summary counts
- drift rows by provider room/date

### Persisted row results

```http
GET /channels/:connectionId/inventory-row-results
```

This returns:

- total persisted inventory row attempts
- failed row count
- succeeded row count
- recent failed rows
- grouped recurring failures by provider room

HMS persists each room/date outcome in `inventory_sync_rows`, so operators can query failure patterns without reading raw `response_payload` JSON.

## 12. Retry only failed inventory rows

When an inventory sync is `PARTIAL_FAILED`, operators can requeue only the failed rows.

```http
POST /channels/:connectionId/sync-logs/:syncLogId/retry-failed-rows
```

HMS behavior:

1. read failed `row_results` from the source inventory sync
2. build a new queued inventory sync containing only failed room/date rows
3. preserve `retry_of_sync_log_id` in the new request payload
4. send only those failed rows back to Zodomus

## 13. What gets stored

After setup:

- `ChannelConnection`
- setup snapshot in `provider_config_summary`
- provider catalog snapshot

After mapping:

- `ChannelRoomMapping`
- `ChannelRateMapping`

After syncs:

- `ChannelSyncLog`
- `InventorySyncRow`

After webhooks:

- `WebhookEvent`
- `BackgroundJob`

After reservation import:

- `ReservationGroup`
- `ReservationRoom`

## 14. Actual execution order

Current recommended order:

1. `POST /channels/zodomus/setup`
2. `GET /account`
3. `GET /channels`
4. `POST /property-activation`
5. `POST /property-check`
6. `GET /room-rates`
7. `POST /channels/:id/room-mappings`
8. `POST /channels/:id/rate-mappings`
9. `POST /channels/:id/rooms-activate`
10. `POST /property-check`
11. `POST /channels/:id/sync` for `INVENTORY` and `RATES`
12. `POST /channels/:id/sync` for `BOOKINGS` or `POST /webhooks/channel/zodomus`

## 15. Rule to keep in mind

- HMS is the operational source of truth
- Zodomus is the channel-manager bridge
- local HMS mapping is not enough without provider-side activation
- provider `rateId` must be treated with room context
- frontend never calls Zodomus directly

## 16. Fast Troubleshooting

- `GET /channels/:id/provider-account` failing with `401` means the backend env credentials are invalid or expired. Fix `ZODOMUS_API_USER` and `ZODOMUS_API_PASSWORD`, then restart the backend.
- `POST /channels/:id/property-check` returning all OK means auth, property activation, room activation, and mapped product readiness are all good enough for live syncs.
- room `10001` rejecting `available = 2` with `Your availability is higher than declared` indicates a provider-side declared inventory mismatch, not an HMS payload-shaping issue.
