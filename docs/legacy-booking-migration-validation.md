# Legacy Booking Migration Validation

Use this after deploying the migration that removes `Booking` and backfills `ReservationGroup` plus `ReservationRoom`.

## Goal

Validate that legacy `Booking` rows were migrated into reservation-centric data without losing billing continuity.

## Run

```bash
npm --workspace apps/backend run validate:legacy-migration
```

## What it validates

- every migrated reservation group uses source `LEGACY_BOOKING_MIGRATION`
- every migrated reservation group is linked to the synthetic `Legacy Booking Migration` channel connection
- every migrated reservation group has exactly one migrated reservation room
- migrated reservation-room property/group links are consistent
- migrated reservation groups still have a primary guest
- billings are linked to migrated reservation rooms instead of legacy booking IDs
- no billing rows remain without a reservation-room link

## Recommended rollout checklist

1. Back up the database before applying the migration.
2. Apply Prisma migrations.
3. Run `npm --workspace apps/backend run validate:legacy-migration`.
4. Run `npm run backend:test` against the migrated environment.
5. Smoke-test:
   - reservation group listing
   - reservation-room check-in / checkout
   - invoice listing
   - payment collection
   - Zodomus reservation import

## Limits

This validator checks post-migration consistency. It does not compare against the dropped `bookings` table, so if you need pre/post row-count reconciliation, capture that before rollout in your deployment checklist.
