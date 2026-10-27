# HMS operations audit — 7 October 2026

Scope: booking lifecycle and inventory, property/role permissions, billing through checkout and printing, and backup recovery. OTA imports, email ingestion, webhooks and external channel sync were excluded as requested.

This is an audit, not a production-readiness certification. The initial audit added reproduction tests without changing production logic. Its four failing safeguard tests have now been corrected and pass; the findings below retain the original reproduction evidence. The tests are opt-in and refuse to run outside a disposable local `hms_audit_*` database.

## Fix verification — 7 October 2026

All four findings below are **fixed in the current code**:

1. Check-in, checkout, direct reservation edits, and invoice creation lock the reservation group before reading mutable stay state. Repeated/concurrent check-in cannot occupy a second room, and repeated/concurrent checkout cannot create duplicate turnover tasks.
2. Explicit, automatic, and preassigned room selection all revalidate status, category/property, overlapping reservations, and dated maintenance. A maintenance period ending on arrival blocks assignment; one starting on checkout does not overlap the stay.
3. Refunds are limited by both the selected original payment's remaining amount and the invoice-wide remaining amount under the billing lock. Each new refund stores `metadata.original_payment_id` and preserves the original payment method. Unlinked or invalidly linked historical refunds conservatively reduce each selected payment's refundable limit; no historical linkage is guessed or rewritten. This can require reconciliation before some legacy refunds can proceed.
4. Editing a booked stay updates every existing full invoice in the same transaction, preserving tax, extras, payments, and refunds, recalculating payment status/credits, and recording a billing audit entry. Multi-room invoice locks use the same order as folio collection. Advance receipts identified by the direct-advance payment marker remain advance receipts until check-in expands them to the edited stay price. Missing invoices are not automatically issued during edits.

No schema migration or rewrite of existing working bookings/payments was required. These changes prevent the reproduced issues on subsequent operations; they do not retroactively amend historical invoices.

Final isolated verification: **33 tests passed** across the operations audit, billing integration, and property integration suites. This includes the original four safeguards and added concurrency, maintenance-boundary, multi-room amendment, advance-receipt, overpayment, per-payment refund, and legacy-refund checks. The database was created from a schema-only restore of the local database and populated only with test fixtures; notification/channel dispatch was stubbed.

Final booking/billing unit run: **40 passed**. Backend TypeScript compilation without emitting files passed. The local backend health endpoint returned `ok` after reloading the changes. The disposable audit database was removed after verification.

Broader-suite limits: the unrestricted test selection run inside the sandbox reported 319 passes, one date-sensitive OTA-import unit failure, and 37 general-app integration failures because that process could not reach PostgreSQL. The OTA fixture uses August stays that fall outside its rolling import window on 7 October. That suite and the general-app suite are not evidence that these four fixes failed; the relevant database suites above were run separately with access to the isolated database. Unrelated OTA test behavior was not changed.

## Highest-priority findings

### 1. Concurrent check-ins can occupy two rooms for one reservation — high, fixed

Two requests for the same reservation both read `BOOKED` before taking the inventory lock. After the first request commits, the second request continues using its stale reservation state and assigns another available room.

Reproduced with one reservation and two physical rooms: **both requests succeeded and both rooms became OCCUPIED**, while the reservation retained only the second room assignment. This is distinct from duplicate booking creation: simultaneous creation against the last available room correctly allowed only one booking.

Location: [BookingService.checkInReservationRoom](../apps/backend/src/modules/booking/booking.service.ts:732).

Recommended fix: serialize the reservation state transition itself and re-read/conditionally update status under that lock. Include repeat check-in and checkout tests and consistent lock ordering.

### 2. Check-in ignores dated room maintenance — high, fixed

The assignment query checks `Room.status = AVAILABLE` and overlapping room assignments, but does not exclude `RoomOutOfServicePeriod`. Global inventory calculations do account for these periods, so booking-time checks and physical room assignment disagree.

Reproduced for a stay starting today: a maintenance block created through `RoomService.createOutOfServicePeriod` covered the requested physical room, but explicit check-in into that room still succeeded. Another room was available, so the reservation itself was valid.

Location: [roomAvailabilityWhere](../apps/backend/src/modules/booking/booking.service.ts:760). Existing/preassigned rooms also require validation rather than trusting the saved room object.

Recommended fix: apply the room's dated unavailability checks to explicit, automatic and existing room assignment paths.

### 3. A refund can exceed the selected original payment — high, fixed

The refund endpoint identifies a payment, but computes its refund ceiling from **all successful payments on the invoice**, less all refunds. It then records the refund using the selected payment's method/reference.

Reproduced: collect ₹50 cash and ₹150 card; request a ₹100 refund against the ₹50 cash payment; the request succeeds and records a cash refund. The invoice-wide refund ceiling is enforced, but the original payment boundary and method allocation are not.

Location: [PaymentService.refundOnce](../apps/backend/src/modules/payment/payment.service.ts:323).

Recommended fix: persist each refund's original payment ID, calculate that payment's remaining refundable amount under a lock, and preserve provider/method allocation. Existing refunds need a careful compatibility policy; do not infer their original transaction without evidence.

### 4. Editing stay dates leaves an issued invoice stale — medium, fixed

Updating a booked reservation recalculates its group and room prices but does not update an already-issued invoice.

Reproduced: issue a full ₹200 invoice for two ₹100 nights, extend the reservation to three nights, and retrieve the invoice: it remains **₹200**, while the reservation is ₹300. Check-in later calls the billing refresh, but the invoice is stale before then.

Location: [BookingService.updateDirectReservation](../apps/backend/src/modules/booking/booking.service.ts:454).

Recommended fix: define how issued invoices are amended and apply the chosen rule atomically with reservation edits, preserving payments, tax and extras. Distinguish full invoices from advance receipts, which currently intentionally bill only the advance before check-in.

## Operational gaps and policy decisions

- **Manual cancellation is missing.** The direct-booking controller has create, edit, check-in and checkout routes but no cancellation route, and the reservation page has no working manual cancellation action. Calendar rebuilding correctly releases a stay whose room/group statuses have been changed to CANCELLED in the audit fixture; that is not a usable staff cancellation workflow. Add cancellation with explicit inventory, advance/refund and audit-log handling. In-house date extensions are also currently rejected by the booked-only edit rule.
- **Staff financial powers are broad.** Actual HTTP tests confirmed a STAFF account can refund and delete extra charges in its own property. Those routes have property authorization but no manager-role restriction. Cross-property attempts were denied. Decide whether these actions require ADMIN/owner privileges or approval; this is a permission-policy gap, not evidence of cross-property access.
- **Printed Airbnb reconciliation is incomplete.** The invoice HTML prints total, net paid and balance, but no separate settlement adjustment or credit balance. Normal cash/extra/refund printing passed. A synthetic Airbnb invoice with a non-cash adjustment had no settlement label, leaving the printed totals unexplained even though Reports/Payments expose the adjustment.
- **Automated backup/PITR is not demonstrated.** No backup scheduler/retention/offsite configuration was found in the checked repository, and the local PostgreSQL instance reports `archive_mode = off`. Docker volume persistence is present. This does not establish whether an external production hosting provider has separate backups; that environment was not available for verification.

## Verified protections and working paths

- Two concurrent booking-creation requests for the last hotel room allow exactly one reservation.
- Checkout-day arrival is allowed; extending into a sold-out night fails and preserves the original booking dates.
- A whole-villa booking reserves all four configured rooms and prevents an overlapping room-count booking; the whole-villa price is charged once.
- Manual inventory blocks prevent booking; removing a block restores availability. Cancelled room/group state is excluded when rebuilding available inventory.
- A full stay with a ₹50 advance, ₹200 room charge, ₹25 food charge, ₹175 subsequent collection and ₹10 refund reaches checkout with one invoice, net paid ₹215, balance ₹10, one housekeeping task and audit entries. The generated invoice includes food and the refund.
- HTTP requests from another property cannot read the invoice, edit the booking, check in the room, collect payment or remove its charge.
- AuthGuard uses the current database role rather than an inflated token claim. Missing tokens, disabled accounts and expired credential versions are denied.
- Organization owners' property lists are refreshed from the database; a token carrying another organization's property ID does not grant access.
- Existing billing integration tests continue to pass, including Airbnb settlement/extras, partial refunds, charge changes and atomic billing audit records.

## Current-data consistency checks

Read-only queries against the working local database returned zero for each of:

- reservation-room/group property mismatches;
- reservation/primary-guest property mismatches;
- occupied rooms without a checked-in assigned stay;
- checked-in assigned stays whose physical room is not occupied;
- overlapping active assigned-stay pairs;
- direct checked-in/checked-out room-charge mismatches between invoice and reservation room.

These checks cover specific invariants, not all possible historical data issues. The reproduced problems used artificial fixtures on the disposable restored copy; no working reservations were changed.

## Backup recovery evidence

A consistent PostgreSQL snapshot was exported inside a read-only repeatable-read transaction. `pg_dump -Fc --snapshot` backed it up, and `pg_restore --exit-on-error` restored it to a newly created local audit database. All **41 public tables, 2,958 rows, per-table row counts and order-independent row-content hashes matched** the source snapshot. The restored database was then usable by the actual application services and HTTP guard tests.

This verifies a fresh logical backup/restore, not recovery from a pre-existing scheduled backup, point-in-time recovery, offsite recovery, retention or a production recovery-time objective. Temporary database/dump cleanup is part of the audit; this temporary dump must not be treated as an ongoing backup.

## Original audit test evidence and reproduction

- Existing targeted backend unit suites: **107 passed**.
- Final isolated integration run: **17 passed, 4 failed** across the new audit, billing and property suites. The four failures correspond to findings 1–4.
- Maintenance finding rechecked independently using a real dated-block service call for today's date: reproduced.
- Existing frontend billing/report grouping and print-related utility tests: **16 passed**.
- Generated the fictional lifecycle invoice and visually checked its rendered HTML.

[Audit regression suite](../apps/backend/src/integration/operations-audit.integration.spec.ts) requires `RUN_OPERATIONS_AUDIT=true` and a localhost database named `hms_audit_<hex>`. Create and verify a disposable restore before running it. Run with `npm --workspace apps/backend test -- --runInBand operations-audit.integration.spec` in that isolated environment. The suite writes fixtures to that database; all four safeguards now pass. Notification and channel-sync dispatch are stubbed, and tests use local payment adapters; no OTA imports or external payments are exercised.

Remaining work outside these four fixes: cancellation workflow, staff financial-permission policy, printed settlement reconciliation, and scheduled offsite backups/recovery drills. The four fixes do not resolve those separate operational gaps.
