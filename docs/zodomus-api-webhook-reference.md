# Zodomus API And Webhook Reference

Last updated: 2026-05-06

This is the practical reference for the current HMS <-> Zodomus integration.

It focuses on:

- HMS APIs you call locally
- Zodomus APIs HMS calls internally
- webhook request expectations
- validated response patterns
- room and rate mapping rules

## HMS APIs

### Guided setup

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

### Provider catalog

```http
GET /channels/:connectionId/provider-catalog
```

### Room mapping

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

### Rate mapping

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

### Activate mapped rooms

```http
POST /channels/:connectionId/rooms-activate
```

### Run property check

```http
POST /channels/:connectionId/property-check
```

### Manual sync

```http
POST /channels/:connectionId/sync
```

Reservation import body:

```json
{
  "sync_type": "BOOKINGS"
}
```

### Inventory reconciliation

```http
GET /channels/:connectionId/inventory-reconciliation
```

### Persisted inventory row results

```http
GET /channels/:connectionId/inventory-row-results
```

### Retry failed inventory rows

```http
POST /channels/:connectionId/sync-logs/:syncLogId/retry-failed-rows
```

## Zodomus APIs HMS Calls Internally

Setup:

- `GET /account`
- `GET /channels`
- `POST /property-activation`
- `POST /property-check`
- `GET /room-rates`
- `POST /rooms-activation`

Outbound:

- `POST /availability`
- `POST /rates`

Inbound:

- `GET /reservations-summary`
- `GET /reservations`

## Webhook Endpoint

Zodomus webhook target in HMS:

```http
POST /webhooks/channel/zodomus
```

Expected env:

```env
ZODOMUS_WEBHOOK_KEY="your_secret_here"
```

Accepted verification headers:

- `x-webhook-signature`
- `x-webhook-key`
- `x-api-key`
- `Authorization`

Verification supports:

- direct key match
- HMAC-SHA256 style signature match

## Minimal Test Webhook Body

```json
{
  "event_id": "zodomus-test-3",
  "event_type": "reservation.created",
  "propertyId": "100",
  "channelId": "1",
  "reservationId": "9355237"
}
```

## Webhook Processing Path

1. HMS verifies the webhook
2. HMS stores `WebhookEvent`
3. HMS queues `WEBHOOK_PROCESS`
4. HMS matches a ready Zodomus connection
5. HMS queues a `BOOKINGS` channel sync
6. If the webhook includes `reservationId`, HMS tries a targeted reservation-detail fetch first
7. If targeted fetch is unusable, HMS falls back to reservation summary plus detail reconciliation
8. HMS imports the resolved reservation payloads
9. HMS fans out inventory updates if inventory changed

For inventory pushes:

- HMS sends batched `/availability` calls for contiguous room/date ranges with the same availability
- inventory row results are persisted locally
- partial provider failure becomes `PARTIAL_FAILED` instead of pretending the whole sync succeeded

## Connection Match Requirements

The webhook processor matches a connection using:

- provider `ZODOMUS`
- matching `external_hotel_id`
- matching provider `channel_id`
- `status = ACTIVE`
- automation enabled
- `activated = true`
- `catalog_loaded = true`
- `ready = true`
- not disconnected

## Validated Provider Catalog Behavior

Validated property `100` returned:

Rooms:

- `10001` = Single room
- `10002` = Double room
- `10003` = Suite

Rates inside room payloads:

- `100991` = Non refundable
- `100992` = Standard rate
- `100993` = Special rate

Important:

- Zodomus can reuse the same `rateId` under multiple rooms
- treat the real key as `external_room_id + external_rate_id`

## Validated Setup Status Pattern

Healthy setup status should include:

```json
{
  "checked": true,
  "activated": true,
  "catalog_loaded": true,
  "rooms_activated": true,
  "ready": true
}
```

Important:

- `property-activation` can return `400` for an already-existing property
- final readiness still depends on `property-check`

## Validated Reservation Import Pattern

Real reservations can contain:

- one reservation header
- multiple rooms
- one `roomReservationId` per room line
- room-scoped `rateId`

HMS import shape:

- one `ReservationGroup`
- one `ReservationRoom` per provider room line

## Inventory Sync Outcome Pattern

Inventory sync logs can now end as:

- `SUCCEEDED`
- `PARTIAL_FAILED`
- `FAILED`

For inventory syncs, HMS stores:

- sync-level `ChannelSyncLog`
- room/date-level `InventorySyncRow`

The provider response now contains:

- `row_results`
- `summary.total_rows`
- `summary.succeeded_rows`
- `summary.failed_rows`

This supports:

- row-level retry
- recurring failure analytics
- inventory reconciliation against the last successful baseline

## Common Failure Cases

### No ready Zodomus channel connection matched the webhook event

Meaning:

- no matching ready connection exists for provider property/channel

### No room mapping found for external room ID 10001

Meaning:

- the room mapping is missing in HMS

### No rate mapping found for external room ID 10001 and external rate ID 100991

Meaning:

- the room-aware rate mapping is missing in HMS

### Mapped rate plan is not available for this property

Meaning:

- the chosen HMS rate plan does not belong to the same HMS room category as the resolved room mapping

### Inventory sync is `PARTIAL_FAILED`

Meaning:

- at least one room/date row succeeded
- at least one room/date row failed
- use `GET /channels/:id/inventory-row-results` to inspect recurring room failures
- use `POST /channels/:id/sync-logs/:syncLogId/retry-failed-rows` to retry only the failed rows

## Immediate Fan-Out

After successful import that changes inventory:

```text
OTA reservation -> Zodomus -> HMS import -> HMS inventory update -> Zodomus -> other ready OTAs
```
