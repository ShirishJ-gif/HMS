# Live database audit — 30 September 2026

Checked the configured local PostgreSQL database `hms`, schema `public`, at `localhost:5432`. This report does not cover a separate production database. Metadata and data checks ran in read-only, repeatable-read transactions. Prisma schema comparison only printed differences; no migration or data correction was applied.

Latest data snapshot: 2026-09-30T10:52:22.563Z. Audited 49 targeted data/operational checks and 61 foreign keys. These checks establish the findings below, not a guarantee of every possible business invariant or physical database health.

## Findings requiring attention

### 1. Stored billing totals omit extra charges — high priority

Two bills have a stored total below amount + tax + saved extra charges. Both are INR walk-in stays marked CHECKED_OUT. The combined difference is INR 27,000. This is a stored-data discrepancy; it does not establish that this money is collectible or that every screen displays the incorrect value.

| Billing ID | Base amount | Tax | Extra charges | Stored total | Component total | Recorded net payments |
|---|---:|---:|---:|---:|---:|---:|
| `54fd035d-ad12-4fc0-8602-9a41c9c7dddf` | 30000 | 0 | 25000 | 30000 | 55000 | 20000.00 |
| `42cbfc50-2141-4279-a8ab-6cd2c25d5461` | 8200 | 0 | 2000 | 8200 | 10200 | 8200.00 |

Code evidence: `BookingService.ensureReservationRoomBilling` in `apps/backend/src/modules/booking/booking.service.ts` loads payments but not extra charges and overwrites `total` with `amount + tax`. It is invoked by check-in and check-out. This is a confirmed omission in the current code and a plausible cause of the observed records; the audit did not replay historical requests.

### 2. Paid status and recorded payments need reconciliation

| Billing ID | Source / stay status | Stored total (INR) | Recorded net payments (INR) | Finding |
|---|---|---:|---:|---|
| `0afa270f-37fb-45a1-89a5-a2bcc74ecc09` | WALK_IN / CANCELLED | 10200 | 5200.00 | Cancelled walk-in bill remains PAID despite recorded payments below its stored total. |
| `c99ff8c6-bcdc-44ae-b7ee-da40983bd76f` | AIRBNB / BOOKED | 162547.36 | 109512.84 | Review OTA settlement accounting: net host payout can differ from the gross bill; do not automatically classify the difference as guest debt. |

`BillingService.addExtraCharge` and `deleteExtraCharge` update total without recalculating payment status. `EmailAutomationService.applyPayoutPayment` sets PAID after applying an Airbnb net payout without comparing it to the gross total. These code paths explain why a blanket repair based only on payment sums would be inappropriate. The second total-omission bill above is also marked PAID against its understated total.

### 3. Live schema and repository differ

- Live database: 40 application tables plus `_prisma_migrations`. Current Prisma schema: 39 models. No expected application tables are missing.
- All 42 local migrations have successful matching-checksum records. No pending local migrations, unresolved failed migrations, or checksum mismatches were found.
- The database also records an applied migration `20260902093000_inventory_block_google_events` whose directory is absent from the repository. There are 43 successful applied migrations overall.
- Extra table `inventory_block_google_events`: zero rows, no current Prisma model or source references found. This is a cleanup candidate, but the missing migration history should be reconciled before choosing a removal migration.
- Extra `expenses.notes` and `expenses.reference` columns: no non-null values in the five expense rows. Both remain in the original expense migration but are absent from the current Prisma model.
- `expenses.id` has a database UUID default not represented by the Prisma model’s client-side UUID default.
- Two expense foreign keys use database-default ON UPDATE NO ACTION while Prisma expects ON UPDATE CASCADE: `expenses_reservation_group_id_fkey`, `expense_receipts_expense_id_fkey`. Their ON DELETE RESTRICT behavior is correct.
- Extra index `inventory_blocks_google_calendar_event_id_idx` is absent from the Prisma schema. An extra index is not inherently harmful; decide whether it is useful before changing it.

The comparison was read-only. Its generated DROP statements were not executed.

### 4. Redundant billing index — low priority

`billings_reservation_room_id_idx` indexes the same column as the unique `billings_reservation_room_id_key`. The ordinary index is a likely redundant maintenance/storage cost; retain the unique constraint.

### 5. Operational follow-up

- 242 expired refresh-session records remain. Define retention and cleanup rather than deleting active sessions.
- 6 incoming emails are FAILED with PROCESSING_FAILED. Their underlying failures require a separate processing investigation; this count is not evidence of database corruption.

## Checks that passed

- All 61 checked foreign keys had zero orphan rows; constraints were validated and indexes valid.
- No missing reservation-room links on bills, no reservation groups without rooms, and no invalid stay date ranges.
- No overlapping BOOKED/CHECKED_IN stays assigned to the same physical room in the checked data.
- No cross-property inconsistencies in the checked booking, guest, room, rate-plan, channel-mapping, housekeeping, expense, inventory, and email relationships.
- No negative inventory counts, availability above capacity, or discrepancies in available = max(total - blocked - reserved, 0). This checks stored arithmetic, not a complete independent reconstruction of availability.
- No negative payment/billing values, refunds exceeding recorded collections, or invalid expense payment bounds.
- Email reservation/enquiry links exist and their paired enquiry references agree. Checked tenant/organization fields match the owning property.
- No DEAD_LETTER jobs, PENDING jobs overdue by more than one hour, PROCESSING jobs locked more than one hour, or failed webhook records at the snapshot.
- Old `bookings`, `channel_booking_links`, and all four retired WhatsApp tables are absent.

## Flags reviewed and not classified as corruption

- Seven completed villa stays retain historical DELUXE/DOUBLE booking categories while referencing an HMS_WHOLE_VILLA room in the same property. `RoomService.delete` explicitly transfers historical references when retiring legacy villa rooms. This matches the supported history-preservation path; no active cross-property assignment was found.
- A same-day inventory block is valid because inventory blocks use inclusive from/to dates.
- Empty feature tables (for example email attachments and expense receipts) are not automatically useless. Current code supports them.

## Recommended order

1. Fix the billing recalculation paths, then reconcile the identified bills and statuses with the intended charges and OTA settlement rules.
2. Reconcile the missing migration and schema differences with a reviewed migration that preserves required data and constraints.
3. Remove the redundant non-unique index if confirmed unnecessary; establish expired-session retention and investigate failed emails.

No database records, tables, indexes, or migration history were changed during this audit.

## Billing repair — 2026-10-01

The billing findings above were repaired after the audit, with user authorization. The confirmed Airbnb rule is that an applied net host payout settles the room charge; extra services are collected separately. Settlement coverage does not increase recorded cash collections.

Shared decimal calculations now preserve extras during check-in/check-out, recalculate payment status after charge changes, account for refunds during collection, and count a newly created refund once. Billing, finance, dashboard balances and report balances use the same settlement calculation. Payment-status updates cannot override the ledger. Billing mutations acquire row locks to serialize concurrent changes, including folio collection and payout application.

The reconciliation script `apps/backend/prisma/reconcile-billing-calculations.ts` previews changes by default, saves a before snapshot, and applies only the reviewed changes. It aborts if affected records have changed since preview. The local `localhost:5432/hms` repair updated only totals/statuses and wrote an audit entry for each bill:

| Billing ID | Total before → after (INR) | Status before → after | Balance after (INR) |
|---|---:|---|---:|
| `54fd035d-ad12-4fc0-8602-9a41c9c7dddf` | 30000 → 55000 | PARTIAL → PARTIAL | 35000 |
| `42cbfc50-2141-4279-a8ab-6cd2c25d5461` | 8200 → 10200 | PAID → PARTIAL | 2000 |
| `0afa270f-37fb-45a1-89a5-a2bcc74ecc09` | 10200 → 10200 | PAID → PARTIAL | 5000 |

The cancelled reservation's existing charges and payments were retained. Airbnb bill `c99ff8c6-bcdc-44ae-b7ee-da40983bd76f` remains PAID with zero balance under the confirmed settlement rule. No payment transactions were changed by the repair.

Verification:

- Rechecked all 23 bills after repair: zero total/status discrepancies under the shared calculation.
- 77 tests passed across six focused suites, including three PostgreSQL integration scenarios whose fixtures rolled back. These cover refunds and recollection, extras added/removed from paid bills, and Airbnb services collected/refunded separately.
- Backend build and `git diff --check` passed.
- The running billing and finance APIs agreed on the two repaired bills accessible to seeded admins and the preserved Airbnb settlement. The third repaired bill belongs to another property; its result was verified directly in PostgreSQL, without bypassing API property access controls.
- The broader test run had unrelated guest/channel test failures and app integration failures because the sandbox could not connect to PostgreSQL. That full suite is not green; the focused billing integration tests were run separately with local database access and passed.

The schema-history, expired-session and failed-email follow-ups from the original audit remain separate work.
