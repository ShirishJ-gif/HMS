# Buffered OTA Inventory Strategy

## Purpose

This document explains a controlled inventory-buffer strategy for HMS and OTA channel syncs.

The goal is to reduce OTA overbooking risk while still allowing HMS to use the full physical inventory when business rules allow it.

## Core Idea

HMS should always know the real physical inventory.

Example:

```text
Total physical rooms: 10
Internal HMS inventory: 10
OTA sellable inventory: 8
Hidden buffer: 2
```

In this model, HMS does not pretend that only 8 rooms exist. HMS knows all 10 rooms exist. The limitation only applies when HMS syncs availability to OTA channels.

## Why This Helps

OTA availability is not always perfectly real-time. A booking may be accepted by an OTA before the latest HMS sync reaches that OTA, especially when multiple channels are selling the same room category.

By exposing only part of the real inventory, HMS keeps a safety buffer.

Benefits:


- Reduces OTA overbooking risk.
- Gives the hotel operational buffer for last-minute issues.
- Allows HMS to keep accepting valid reservations up to the real room count.
- Allows dynamic release of buffer inventory when occupancy is high.
- Gives different controls for direct, manual, and OTA reservations.

## Basic Formula

For a fixed sell limit:

```text
ota_sell_limit = configured OTA limit
ota_available = max(ota_sell_limit - active_booked_rooms, 0)
```

For a percentage-based sell limit:

```text
ota_sell_limit = floor(total_physical_rooms * sell_limit_percentage)
ota_available = max(ota_sell_limit - active_booked_rooms, 0)
```

Example:

```text
Total rooms: 10
OTA sell limit: 80%
ota_sell_limit = floor(10 * 0.80) = 8
```

Availability sent to OTA:

```text
Booked rooms: 0 -> send 8
Booked rooms: 3 -> send 5
Booked rooms: 7 -> send 1
Booked rooms: 8 -> send 0
Booked rooms: 9 -> send 0
```

HMS still internally knows there are 10 physical rooms.

## Dynamic Buffer Release

The buffer does not have to stay hidden forever. HMS can release buffer inventory when occupancy reaches a configured threshold.

Example dynamic rule:

```text
0% - 69% occupancy: expose up to 80% of inventory
70% - 89% occupancy: expose up to 90% of inventory
90%+ occupancy: expose up to 100% only for trusted channels
```

For 10 rooms:

```text
0% - 69% occupancy: sell limit = 8
70% - 89% occupancy: sell limit = 9
90%+ occupancy: sell limit = 10
```

Example:

```text
Total rooms: 10
Booked rooms: 7
Occupancy: 70%
Normal 80% OTA limit: 8
Dynamic threshold limit: 9
OTA availability sent: 9 - 7 = 2
```

Without dynamic release, OTA would only see 1 available room. With dynamic release, OTA can see 2.

## Larger Booking Example

Scenario:

```text
Total rooms: 10
Base OTA sell limit: 8
Booked rooms: 7
Hidden buffer: 2
```

Normal OTA availability:

```text
8 - 7 = 1 room
```

If a new OTA reservation requests 2 rooms:

```text
Real internal available: 10 - 7 = 3
Base OTA available: 1
Buffer available: 2
```

If the dynamic buffer rule allows it, HMS can accept the 2-room OTA reservation because real inventory is still available.

After accepting:

```text
Booked rooms: 9
Real available: 1
```

The next OTA sync should reduce availability according to the active rule.

If a new OTA reservation requests 4 rooms:

```text
Real internal available: 3
Requested rooms: 4
Result: reject/import-block because it exceeds physical inventory
```

The internal hard cap must always be the real room count.

## Relation To Existing Locking

This strategy does not replace database locking or transaction safety.

HMS still needs:

- Inventory allocation inside a transaction.
- Locking per property and room category.
- Final availability check before reservation creation/import.
- Conflict response when requested rooms exceed real available inventory.

The buffer strategy controls what is advertised to OTAs. The locking strategy prevents HMS from committing overbooked reservations.

Both are required.

## OTA Reservation Imports

The same concept can apply to OTA reservations.

HMS may only show 80% inventory to OTA during normal syncs, but if an OTA reservation arrives, HMS should validate it against real internal inventory.

Example:

```text
Total rooms: 10
OTA sell limit: 8
Booked rooms: 7
Real available: 3
OTA visible availability before sync: 1
Incoming OTA reservation: 2 rooms
```

If the buffer release rule allows this case, HMS can accept the reservation because 3 real rooms are available.

If the incoming OTA reservation asks for 4 rooms, HMS should reject or import-block it because only 3 real rooms are available.

## Per-Channel Control

Buffer release should not necessarily apply to every OTA equally.

Recommended controls:

- Per channel sell limit.
- Per room category sell limit.
- Per date range or season sell limit.
- Trusted-channel setting for releasing final buffer rooms.
- Emergency stop-sell override.

Example:

```text
Booking.com: expose up to 90% at high occupancy
Airbnb: expose up to 80% only
Direct/manual HMS: allow up to 100%
Corporate channel: allow up to 100% for contracted inventory
```

## Recommended Rule Model

A practical first version:

```text
Base OTA sell limit: 80%
Occupancy >= 70%: allow up to 90%
Occupancy >= 90%: allow up to 100% for trusted channels only
Never exceed real physical inventory
```

Per-room-category example:

```text
Deluxe Room
Total rooms: 10
Base OTA sell limit: 80%
High occupancy limit: 90%
Final buffer release: trusted channels only
```

Computed sell limits:

```text
Normal: 8 rooms
High occupancy: 9 rooms
Final release: 10 rooms
```

## Risks

This is a strong strategy, but it is not risk-free.

Main risks:

- Releasing buffer to multiple OTAs at the same time can still create race conditions outside HMS.
- Hiding too much inventory can reduce revenue.
- Releasing buffer too aggressively can remove operational safety.
- Staff may not understand why OTA availability differs from HMS availability unless the UI explains it clearly.
- Provider sync delay can still cause OTA-side mismatch.

## Monitoring And Audit Requirements

HMS should make buffer usage visible.

Recommended audit events:

- Buffer inventory exposed to OTA.
- Buffer inventory consumed by reservation.
- Dynamic sell limit changed.
- Channel-specific limit changed.
- Reservation accepted using buffer.
- Reservation rejected because it exceeded real physical inventory.

Recommended UI fields:

```text
Physical rooms
Booked rooms
Real available
OTA sell limit
OTA available
Buffer rooms
Buffer used
Active threshold rule
```

Example UI summary:

```text
Deluxe Room
Physical rooms: 10
Booked: 7
Real available: 3
OTA sell limit: 8
OTA available: 1
Buffer available: 2
Active rule: Base 80%
```

With dynamic release:

```text
Deluxe Room
Physical rooms: 10
Booked: 7
Real available: 3
OTA sell limit: 9
OTA available: 2
Buffer available: 1
Active rule: 70% occupancy threshold
```

## Rating

This method is an 8/10 feature.

It is production-useful because it reduces OTA overbooking risk and gives the hotel more control over sellable inventory. It is not a complete replacement for locking, conflict handling, or channel reconciliation.

It becomes strongest when combined with:

- Existing HMS transaction locking.
- Per-channel rules.
- Per-room-category rules.
- Clear audit logs.
- Clear UI visibility.
- Conservative buffer release thresholds.

## Final Recommendation

Implement this as a dynamic OTA sell-limit layer.

HMS should keep real inventory as the source of truth:

```text
real_available = total_physical_rooms - blocked_rooms - active_booked_rooms
```

OTA sync should use a controlled sell limit:

```text
ota_available = min(real_available, active_sell_limit - active_booked_rooms)
```

Reservation creation/import should still use real inventory as the final hard cap:

```text
requested_rooms <= real_available
```

The buffer should protect the business from OTA sync delay and channel mismatch, while the database transaction and inventory locks protect HMS from technical overbooking.
