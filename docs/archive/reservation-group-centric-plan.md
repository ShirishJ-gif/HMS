# Reservation-Group-Centric Plan

Historical reference: this document explains the transition decision that led to the current reservation-centric architecture. The active system should be described from [docs/README.md](/Users/cronberry/Hms/docs/README.md), [README.md](/Users/cronberry/Hms/README.md), and [PROJECT_CONTEXT.md](/Users/cronberry/Hms/PROJECT_CONTEXT.md).

Last updated: 2026-05-05

## Purpose

This document defines the target direction for moving HMS from a single-room-booking-centric model to a reservation-group-centric model.

This change is being driven by validated Zodomus reservation payloads, which can contain multiple rooms under one reservation ID.

The goal is:

- one external reservation
- one internal reservation group
- many internal room-stay lines

instead of splitting the reservation into unrelated bookings.

## Why This Change Is Needed

Validated Zodomus reservation `9355237` showed:

- one reservation header
- one customer
- two room entries
- two room reservation IDs
- room-level dates
- room-level prices

That means the OTA/channel-manager model is:

```text
reservation group
  -> many room stays
```

The current HMS booking model is:

```text
one booking
  -> one room category
  -> one rate plan
  -> one stay
```

This mismatch becomes a real product limitation when importing OTA reservations.

## Target Domain Model

HMS should move to a reservation-group-centric structure.

Suggested core model:

```text
ReservationGroup
- id
- property_id
- primary_guest_id
- source
- external_reservation_id
- currency
- total_amount
- status
- remarks
- booked_at
- modified_at

ReservationRoom
- id
- reservation_group_id
- external_room_reservation_id
- external_room_id
- room_category_id
- rate_plan_id
- room_id (nullable until check-in)
- arrival_date
- departure_date
- total_amount
- status
- guest_name
- adults
- children
- raw_room_payload
```

The header represents the grouped reservation.

The room table represents each room stay inside that reservation.

## Design Principles

### 1. Preserve external grouping

One external reservation ID should remain one internal reservation group.

Example:

```text
external reservation id = 9355237
```

### 2. Preserve room-level identity

Each room item inside the reservation must have its own stable identity.

Example:

```text
external room reservation ids
- 10064750
- 10064751
```

These should be used as the line-level dedupe key.

### 3. Room-level dates and amounts win

Dates and totals should be stored at the reservation-room level.

Do not assume:

- one reservation = one date range
- one reservation = one room amount

### 4. Header-level data stays at header level

Use the header/group for:

- primary guest/contact
- source
- currency
- overall total
- overall status
- remarks

### 5. Physical room assignment stays line-based

Check-in should happen per room line, not only at header level.

That allows:

- 1 reservation group
- 3 room lines
- 3 physical room assignments

## Suggested Schema Direction

## Current likely booking model

Today the schema is effectively:

```text
Booking
- property_id
- guest_id
- room_category_id
- rate_plan_id
- room_id
- check_in_date
- check_out_date
- total_amount
- booking_status
```

That is room-stay-centric.

## Proposed future model

### Header table

Suggested new table:

```text
ReservationGroup
```

Suggested fields:

- `id`
- `property_id`
- `primary_guest_id`
- `external_reservation_id`
- `source`
- `currency`
- `total_amount`
- `status`
- `remarks`
- `booked_at`
- `modified_at`
- `raw_payload`
- timestamps

### Line table

Suggested new table:

```text
ReservationRoom
```

Suggested fields:

- `id`
- `reservation_group_id`
- `external_room_reservation_id`
- `external_room_id`
- `room_category_id`
- `rate_plan_id`
- `room_id`
- `arrival_date`
- `departure_date`
- `total_amount`
- `status`
- `guest_name`
- `adults`
- `children`
- `raw_payload`
- timestamps

### Billing direction

Likely long-term billing model:

- billing can remain group-level
- but totals must be derivable from room lines

That should be decided carefully during implementation.

## Mapping Rules From Zodomus

For each reservation payload:

### Header mapping

Map:

- `reservation.id` -> `external_reservation_id`
- `reservation.currencyCode` -> `currency`
- `reservation.totalPrice` -> group total
- `reservation.remarks` -> remarks
- `reservation.bookedAt` -> booked_at
- `reservation.modifiedAt` -> modified_at
- customer block -> primary guest/contact

### Room-line mapping

For each entry in `rooms[]`:

- `roomReservationId` -> `external_room_reservation_id`
- `id` -> `external_room_id`
- mapped room category from external room ID
- mapped rate plan from `prices[].rateId`
- `arrivalDate` -> arrival_date
- `departureDate` -> departure_date
- `totalPrice` -> room total
- `guestName` -> line guest name

## Status Mapping Direction

Status mapping must be explicit.

The live payload returned:

- `status = 1`

Before implementation, define:

- reservation-group status mapping
- reservation-room status mapping

for:

- new
- modified
- cancelled
- checked-in
- checked-out

## Operational Changes Needed

Moving to reservation-group-centric affects:

- booking creation
- booking read APIs
- check-in flow
- room assignment
- billing
- payment allocation
- availability calculations
- audit logs
- reports
- housekeeping relationships
- frontend booking pages

This is not only an importer change.

It is a booking-domain change.

## Phased Rollout Plan

## Phase 0: Design freeze

Agree on:

- target schema
- naming
- dedupe rules
- status rules
- billing ownership

No code changes yet.

## Phase 1: Introduce new persistence model

Add new tables/entities for:

- reservation group/header
- reservation room lines

Keep existing booking flow unchanged for now if needed.

Goal:

- schema exists
- no importer switch yet

## Phase 2: Write importer against new model

Zodomus importer should:

1. upsert reservation group by external reservation ID
2. upsert reservation room lines by external room reservation ID
3. resolve mapped room category and rate plan
4. store raw payloads

Goal:

- multi-room reservations can be stored correctly

## Phase 3: Read model / APIs

Update backend APIs so reservation groups can be read with nested room lines.

Goal:

- admin and frontend can inspect grouped reservations

## Phase 4: Operational flows

Refactor:

- check-in
- room assignment
- check-out
- billing
- payment logic

Goal:

- room-line operations work safely

## Phase 5: UI transition

Frontend should show:

- one reservation group
- many room lines
- per-room assignment and status

Goal:

- staff understands one reservation can have many rooms

## Phase 6: Deprecate old assumptions

Remove or isolate code that assumes:

- one booking = one room stay

Goal:

- booking domain becomes consistently reservation-group-centric

## Migration Strategy Questions

These must be answered before coding:

1. Will existing `Booking` remain and become the header?
2. Or will `Booking` become the line and a new header table be added?
3. How will existing single-room bookings be migrated?
4. How will billing reference old and new records during transition?
5. Will frontend support mixed old/new data temporarily?

## Recommended Direction

For lower migration pain, the cleaner path is usually:

- keep `Booking` as the future header/group entity
- add a new room-line child table

That may reduce API naming churn, but it depends on how deeply current services assume single-room fields live directly on `Booking`.

Alternative:

- leave current `Booking` alone temporarily
- introduce new header + line tables in parallel

This is safer for migration, but creates more temporary duplication.

## Risks

- broad service refactor surface
- billing and payment assumptions may break
- availability logic may still assume one booking row = one room hold
- UI complexity increases
- migration of legacy bookings must be handled cleanly

## Benefits

- matches OTA/channel-manager reality
- handles 2-room, 4-room, or mixed-type reservations cleanly
- allows proper room-level modifications/cancellations
- cleaner long-term architecture for channel distribution

## Recommended Next Step

Before implementation:

1. review this design with senior engineering/product
2. decide header vs line table strategy
3. decide migration strategy for current bookings
4. decide whether billing remains header-level or becomes line-aware

Only after those are agreed should code changes start.

## Bottom Line

If HMS is going reservation-group-centric, it should do it deliberately as a core booking-domain redesign.

The right target is:

```text
one reservation group
many reservation room lines
```

That is the correct shape for real OTA/channel-manager reservation payloads.
