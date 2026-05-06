# Zodomus Reservation Import Discussion

Historical reference: this note captures the architectural discussion that led to the current reservation-group model.

Last updated: 2026-05-05

## Purpose

This note is for architectural discussion about how HMS should import real Zodomus reservation payloads.

The immediate reason for this note is that live validation showed a real Zodomus reservation can contain **multiple rooms inside one reservation ID**, which may not fit the current HMS booking model cleanly.

## Real Validated Reservation Shape

Validated reservation:

- `reservationId = 9355237`

Important fields returned by Zodomus:

- reservation header:
  - `id = 9355237`
  - `status = 1`
  - `currencyCode = EUR`
  - `totalPrice = 520`
- customer block:
  - `firstName = John`
  - `lastName = Mendes`
  - email and phone can be empty
- rooms array contains **2 rooms**

Room 1:

- `id = 10001`
- `roomReservationId = 10064750`
- `arrivalDate = 2026-11-02`
- `departureDate = 2026-11-03`
- `totalPrice = 260`
- `rateId = 100991` inside `prices[]`

Room 2:

- `id = 10002`
- `roomReservationId = 10064751`
- `arrivalDate = 2026-11-02`
- `departureDate = 2026-11-03`
- `totalPrice = 260`
- `rateId = 100991` inside `prices[]`

The payload also includes:

- add-ons
- taxes
- guest counts
- cancellation penalties
- payment info

## Key Design Problem

One Zodomus reservation can represent multiple room stays under one reservation header.

The earlier HMS booking model appeared closer to:

- one reservation record
- one room category
- one rate plan
- optional one physical room assigned later

That means a direct 1:1 import from:

```text
one Zodomus reservation -> one HMS reservation record
```

may be incorrect for multi-room reservations.

## What Is Already Proven

The following is already confirmed:

- Zodomus setup is working
- room/rate onboarding is complete
- outbound availability sync works
- outbound rates sync works
- reservation test creation works
- reservation queue works
- reservation detail works

So the remaining issue is no longer provider access.

The remaining issue is **how HMS should represent and import the reservation correctly**.

## Main Questions To Decide

### 1. Should one external reservation create one HMS reservation record or many?

Real reservation `9355237` contains two rooms.

Possible options:

- Option A:
  one Zodomus reservation -> one HMS reservation record
- Option B:
  one Zodomus reservation -> multiple HMS reservation records, one per room item

### 2. What should be the true external dedupe key?

Possible choices:

- reservation header ID only:
  - `9355237`
- room-level reservation ID:
  - `10064750`
  - `10064751`
- both:
  - parent reservation ID + room reservation ID

### 3. Which amount should HMS store?

Possible choices:

- reservation total:
  - `520`
- room total:
  - `260` per room

If HMS creates one reservation record per room, room-level totals are more natural.

### 4. Which date fields are authoritative?

The payload includes room-level dates:

- `arrivalDate`
- `departureDate`

These are likely safer than assuming one global date range from reservation header alone.

### 5. Which guest fields are trustworthy?

The payload showed:

- customer name present
- email empty
- phone empty

So the importer must tolerate partial guest/contact data.

### 6. How should status be mapped?

The tested payload returned:

- `status = 1`

Status mapping must be defined explicitly for:

- new
- modified
- cancelled

and not guessed loosely.

## Practical Import Options

## Option A: Split into one HMS reservation record per room

Example:

```text
Zodomus reservation 9355237
  -> HMS reservation record A for roomReservationId 10064750
  -> HMS reservation record B for roomReservationId 10064751
```

Pros:

- fits a single-room reservation-record model better
- easier room category and rate plan resolution
- easier pricing per booked room
- easier later check-in / room assignment logic

Cons:

- one OTA reservation becomes multiple HMS reservation records
- reporting and guest-facing grouping must be handled
- parent-child linkage may need to be stored

## Option B: Redesign HMS for multi-room reservations

Example:

```text
one reservation header
many reservation room lines
```

Pros:

- more faithful to OTA reservation structure
- cleaner long-term channel-manager design

Cons:

- larger schema and service refactor
- broader UI impact
- more effort now

## Recommended Short-Term Direction

For the current HMS shape, the practical short-term recommendation is:

- import one Zodomus room entry as one HMS reservation record
- store parent reservation ID at linkage level
- store room reservation ID as the real item-level dedupe key

Suggested linkage shape conceptually:

```text
external reservation group id = 9355237
external reservation item id = 10064750 / 10064751
```

This gives:

- safe dedupe
- room-level reservation-record creation
- room-level totals
- cleaner mapping to current HMS domain

## Recommended Mapping Rules

If using one-HMS-reservation-record-per-room:

1. Resolve room category from room `id`
2. Resolve rate plan from room `prices[].rateId`
3. Use room-level `arrivalDate`
4. Use room-level `departureDate`
5. Use room-level `totalPrice`
6. Use customer name from `customer.firstName + lastName`
7. Allow missing email/phone
8. Keep original raw payload for debugging

## Risks To Discuss

- Duplicate imports if dedupe uses only parent reservation ID
- Wrong financial totals if importing the full reservation total into each room record
- Incorrect status handling if `status` values are not mapped carefully
- Missing support for room-level modifications/cancellations if linkage is too coarse
- Future mismatch if OTA sends mixed room categories or mixed dates in one reservation

## Decision Needed From Senior Review

The main decision to make is:

> For the earlier HMS model, should one Zodomus reservation with multiple rooms be split into multiple HMS reservation records, one per room item?

Recommended answer for the current system:

- yes, unless HMS is about to be redesigned for native multi-room reservations

## Current Bottom Line

Provider integration is no longer the blocker.

The remaining design problem is:

- **how HMS should import and represent multi-room Zodomus reservations safely and consistently**
