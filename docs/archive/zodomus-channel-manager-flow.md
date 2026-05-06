# Zodomus Channel Manager Flow

Last updated: 2026-05-06

## Purpose

This document explains the current HMS <-> Zodomus channel-manager flow:

- which HMS APIs the frontend should call
- which Zodomus APIs the backend should call
- how room and rate mapping works
- how reservation intake works
- what is automatic and what is admin-driven

Zodomus credentials remain backend configuration, not staff-entered values.

Required backend env vars:

```env
ZODOMUS_API_USER="..."
ZODOMUS_API_PASSWORD="..."
ZODOMUS_ENVIRONMENT="sandbox"
ZODOMUS_WEBHOOK_KEY="..."
```

## Core Principle

The frontend calls HMS APIs only.

The HMS backend owns:

- Zodomus credentials
- provider `channelId`
- provider `priceModelId`
- provider onboarding
- room/rate ID discovery
- provider-side room activation
- outbound inventory/rate sync
- inbound reservation import
- webhook verification and processing

## OTA Defaults

| Staff choice | HMS `ota_key` | Zodomus `channelId` | Zodomus `priceModelId` |
| --- | --- | ---: | ---: |
| Booking.com | `BOOKING_COM` | `1` | `1` |
| Expedia | `EXPEDIA` | `2` | `3` |
| Airbnb | `AIRBNB` | `3` | `4` |

## Staff-Facing Setup Flow

### Step 1: Add OTA connection

Frontend calls HMS:

```http
POST /channels/zodomus/setup
```

Request body:

```json
{
  "property_id": "HMS_PROPERTY_UUID",
  "ota_key": "BOOKING_COM",
  "external_hotel_id": "100"
}
```

HMS backend performs:

1. create local `ChannelConnection`
2. `GET /account`
3. `GET /channels`
4. `POST /property-activation`
5. `POST /property-check`
6. `GET /room-rates`

Important:

- `property_id` is the HMS property UUID
- `external_hotel_id` is the Zodomus property ID
- `property-check`, not activation alone, is the readiness indicator

### Step 2: Map rooms

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

This maps:

```text
HMS RoomCategory -> Zodomus roomId
```

### Step 3: Map rates

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

This maps:

```text
HMS RatePlan -> Zodomus roomId + rateId
```

Important:

- Zodomus can reuse the same `rateId` under different rooms
- HMS now stores rate mappings with room context
- importer and outbound rate sync both depend on `external_room_id + external_rate_id`

### Step 4: Activate mapped rooms

Frontend calls HMS:

```http
POST /channels/:connectionId/rooms-activate
```

HMS builds provider payload from:

- saved room mappings
- saved room-aware rate mappings
- physical room counts in HMS

Then HMS calls:

```http
POST /rooms-activation
```

and follows with:

```http
POST /property-check
```

### Step 5: Reload provider catalog for existing connections

Frontend can reload the provider catalog with:

```http
GET /channels/:connectionId/provider-catalog
```

This calls:

```http
GET /room-rates
```

## Zodomus APIs Used By HMS

### Setup

- `GET /account`
- `GET /channels`
- `POST /property-activation`
- `POST /property-check`
- `GET /room-rates`
- `POST /rooms-activation`

### Outbound sync

- `POST /availability`
- `POST /rates`

### Inbound reservation import

- `GET /reservations-queue`
- `GET /reservations`

### Webhook trigger

- `POST /webhooks/channel/zodomus` on HMS

## Availability Sync Flow

Direction:

```text
HMS inventory -> Zodomus -> OTA
```

Availability should be triggered by:

- reservation created
- reservation modified
- reservation cancelled
- maintenance changes
- manual admin sync
- scheduled sync

Important live rule:

- Zodomus rejects availability higher than the quantity declared during `rooms-activation`

## Rate Sync Flow

Direction:

```text
HMS pricing -> Zodomus -> OTA
```

Rate sync must always send:

- `roomId`
- `rateId`

Important:

- the real provider key is `roomId + rateId`
- this is now also the local HMS mapping rule

## Reservation Import Flow

Direction:

```text
OTA -> Zodomus -> HMS
```

### Polling path

Manual or scheduler:

```http
POST /channels/:connectionId/sync
```

Body:

```json
{
  "sync_type": "BOOKINGS"
}
```

HMS then calls:

1. `GET /reservations-queue`
2. `GET /reservations`

### Webhook path

Zodomus can trigger fast intake through:

```http
POST /webhooks/channel/zodomus
```

Webhook behavior:

1. verify signature or webhook key
2. store `WebhookEvent`
3. queue `WEBHOOK_PROCESS`
4. match ready Zodomus connection by provider property and channel
5. queue a `BOOKINGS` sync
6. reuse the normal reservation polling/import path

This means:

- webhook = fast trigger
- queue/detail APIs = normalized import source

### Import mapping rules

HMS importer resolves:

- room mapping by `external_room_id`
- rate mapping by `external_room_id + external_rate_id`

### Reservation shape

A single Zodomus reservation can contain multiple rooms.

HMS imports that as:

- one `ReservationGroup`
- one `ReservationRoom` per provider room line

## Immediate Inventory Fan-Out

After a successful reservation import that changes inventory, HMS immediately queues `INVENTORY` syncs for the other ready Zodomus connections on the same property.

Direction:

```text
Booking.com reservation import
-> HMS inventory decreases
-> HMS syncs other OTA connections through Zodomus
```

## Readiness Rule

Operationally, a connection is live when:

- `activated = true`
- `catalog_loaded = true`
- `ready = true`
- `disconnected = false`

Provider-side room activation should normally be completed too, but webhook-triggered reservation intake now trusts the final `ready` state instead of re-blocking on a stale `rooms_activated` snapshot alone.
