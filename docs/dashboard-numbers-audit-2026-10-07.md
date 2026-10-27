# Dashboard numbers audit — 7 October 2026

Checked the running local dashboard for Maaruji Castillo, its API, and the working local PostgreSQL database. Database reconciliation ran inside read-only, repeatable-read transactions. The initial audit changed no application logic or business records. The follow-up correction below changes the dashboard filter only. This does not verify a separate deployed production database.

## Follow-up correction

After confirming that villa Airbnb bookings must exist without a channel connection, the dashboard now uses the shared financial booking visibility rule. Bookings count independently of payouts; collections still count only recorded successful payments less refunds on their transaction dates.

The rebuilt service was checked against the working database in a read-only transaction: September collections are now ₹1,19,712.84; June–7 October collections are ₹1,90,912.84; the latter period includes 13 bookings and 14 room arrivals/departures. Active groups are 5. Outstanding remains ₹89,800 and matches Finance. All 46 targeted dashboard, financial-scope, and finance tests passed, and the backend build passed. The historical findings below describe the pre-fix behavior.

## Confirmed error: excluded Airbnb booking and payment

The dashboard's visibility rule includes unconnected bookings only when their source is DIRECT or WALK_IN. Payments & Folios includes manual/unconnected Airbnb and other supported sources as well. The local configuration uses the sandbox visibility branch.

One non-blocked AIRBNB booking without a channel connection is therefore omitted. It was created on 31 August, has one room dated 7–9 August, and has a successful payment of ₹1,09,512.84 recorded on 1 September. The booking is currently BOOKED. Its invoice has no outstanding balance.

| Metric, Maaruji Castillo | Dashboard | Including the omitted booking/payment |
| --- | ---: | ---: |
| Net collections, 1–30 September | ₹10,200.00 | ₹1,19,712.84 |
| Net collections, 1 June–7 October | ₹81,400.00 | ₹1,90,912.84 |
| Bookings created, 1 June–7 October | 12 | 13 |
| Room arrivals, 1 June–7 October | 13 | 14 |
| Room departures, 1 June–7 October | 13 | 14 |
| Current active booking groups | 4 | 5 |

The September ₹10,200 result was also confirmed against the running authenticated HTTP API. The chart and source totals reconcile with the dashboard's reduced total; the error is record inclusion, not chart addition. The omitted payment is cash collection; non-cash Airbnb settlement credit is excluded from these expected collection totals.

Root cause: `apps/backend/src/modules/dashboard/dashboard.service.ts`, `reservationGroupVisibilityWhere`, particularly the source list at line 393. Compare `apps/backend/src/modules/billing/financial-scope.ts`, `financialGroupVisibilityWhere`.

Recommended correction: align the dashboard's booking-source visibility with the shared financial visibility rules, with regression coverage for an unconnected Airbnb booking/payment. Do not globally enable detached OTA history as a workaround because that changes the scope more broadly.

## Values that match current records

For Maaruji Castillo on 7 October, and for the period 1–7 October:

- Arrivals, departures, bookings created, and collections: zero.
- Occupied rooms: 0 of 8; occupancy: 0%; unoccupied: 8; out of service: 0. An independent database check found no checked-in stays.
- Open and overdue housekeeping tasks: 0.
- Current outstanding: ₹89,800 across 10 invoices, matching Payments & Folios with no stay-date restriction.

Outstanding balances also reconcile for every local property and the aggregate: ₹2,89,800 across 18 open invoices. No visible invoice marked PAID had a positive recalculated balance in the checked data. The dashboard prefilters PAID invoices, so stale persisted payment status remains an unproven edge-case risk rather than a current discrepancy.

## Interpretation and checks

Selected dates govern arrivals, departures, booking creation, and payment/refund collections. Room occupancy, housekeeping, active groups, and outstanding balances reflect current records. Arrival/departure counts represent room lines, while bookings created represent reservation groups. Collections use IST transaction creation dates; they are not stay revenue or invoice totals. Reports currently documents UTC boundaries for its period collections, so cross-screen comparisons near midnight must account for that separate convention.

Existing dashboard backend tests: 27 passed. Frontend collection aggregation tests: 4 passed. These tests do not currently detect the real source-visibility discrepancy above.
