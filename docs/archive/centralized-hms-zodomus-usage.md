# How Centralized HMS Should Use Zodomus APIs

Last updated: 2026-05-06

## Purpose

This document explains how the centralized HMS should use Zodomus now that:

- provider-side onboarding is implemented
- reservation import is implemented
- webhook-triggered reservation intake is implemented
- room-aware rate mapping is required by real provider behavior

## Core Model

Think of the system as:

- HMS = operational source of truth
- Zodomus = channel-manager bridge
- OTA = external reservation source

Direction:

- HMS pushes availability and rates outward
- Zodomus distributes them to OTAs
- Zodomus returns OTA reservations inward
- HMS imports and operates those reservations locally

## HMS Responsibilities

HMS owns:

- property records
- room categories
- rate plans
- room mappings
- room-aware rate mappings
- availability calculation
- rate calculation
- reservation import
- sync scheduling
- webhook handling
- sync logging
- operator controls

## Zodomus Responsibilities

Zodomus owns:

- OTA-side bridge
- provider-side room/rate activation layer
- OTA delivery of availability and rates
- OTA reservation queue and reservation detail retrieval

## Setup Layer

Use these APIs when creating or repairing a connection:

- `GET /account`
- `GET /channels`
- `POST /property-activation`
- `POST /property-check`
- `GET /room-rates`
- `POST /rooms-activation`

Recommended setup order:

1. create local channel connection
2. validate credentials and channel list
3. activate property
4. run property check
5. load provider catalog
6. save room mappings
7. save room-aware rate mappings
8. run rooms activation
9. run property check again

Important:

- local HMS mapping alone is not enough
- provider-side `rooms-activation` is required
- final `property-check` is the readiness gate

## Mapping Rule

Room mapping key:

```text
HMS RoomCategory -> external_room_id
```

Rate mapping key:

```text
HMS RatePlan -> external_room_id + external_rate_id
```

This room-aware rate mapping is required because validated Zodomus responses can reuse the same `rateId` under multiple provider rooms.

## Sync Layer

Use these APIs after setup is ready:

- `POST /availability`
- `POST /rates`

### Availability rule

HMS calculates inventory locally and pushes the result outward.

Important live rule:

- HMS must not send availability above the quantity declared during `rooms-activation`

### Rate rule

Rate sync must always send:

- `roomId`
- `rateId`

Not just `rateId`.

## Import Layer

Use these provider APIs for inbound reservations:

- `GET /reservations-queue`
- `GET /reservations`

Use this HMS endpoint for fast webhook-triggered intake:

- `POST /webhooks/channel/zodomus`

### Import behavior

HMS should:

1. poll reservation queue on schedule
2. or accept verified webhook and enqueue `BOOKINGS` sync immediately
3. fetch reservation detail
4. resolve room mapping by `external_room_id`
5. resolve rate mapping by `external_room_id + external_rate_id`
6. upsert guest
7. create or update `ReservationGroup`
8. create or update `ReservationRoom`
9. store sync result and raw payload trace

## Multi-Room Reservation Rule

Validated Zodomus reservations can contain multiple room lines under one reservation ID.

HMS should model them as:

- one `ReservationGroup` per external reservation ID
- one `ReservationRoom` per provider room line

## What Should Be Automatic

HMS should automate:

- property activation
- room/rate catalog fetch
- rooms activation
- final readiness check
- scheduled inventory sync
- scheduled rate sync
- scheduled reservation polling
- webhook-triggered reservation sync enqueueing
- immediate inventory fan-out after imported reservation changes

## Immediate Fan-Out Rule

After a successful reservation import that changes room inventory, HMS should immediately queue `INVENTORY` syncs for the other ready Zodomus connections on the same property.

This is what makes the centralized model behave correctly across OTAs.
