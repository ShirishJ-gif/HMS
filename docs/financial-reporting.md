# Financial reporting and folio reconciliation

Payments & Folios shows all stay dates for the selected property, with current billed, collected, and outstanding totals. It has no date filter and does not inherit the Reports date selection. Payment-status filters and dashboard outstanding-balance navigation remain available.

Reports & Analytics retains its date filter, defaulting to month to date. Date ranges are inclusive and limited to 366 days; checkout does not count as a stay night. If any room in a booking overlaps the selected report dates, financial totals include **all invoices in that booking**, including room lines outside those dates. Reports and Payments can therefore show different totals when the report selects only some stays. Tax and billable extra charges, such as food and laundry, are included in full. Invoiced cancellations remain included because a cancellation does not itself void an invoice. Blocked imports and historical OTA metadata charge rows are excluded. Both views use the same booking visibility and property authorization rules.

## Current invoice totals

- **Total billed:** complete current invoice amounts, tax, and guest extra charges.
- **Collected on these bills:** all successful payments on the selected invoices, less refunds, regardless of transaction date.
- **Airbnb settlement:** the existing non-cash adjustment that settles room charges against an applied net host payout. Extra services remain separately payable. This does not increase cash collected or room revenue.
- **Credit balances:** excess coverage on individual invoices, kept separate from amounts owed on other invoices.
- **Outstanding:** sum of the remaining positive balances of the same invoices.

The reconciliation is:

`billed − net collected − Airbnb settlement + credit balances = outstanding`

These are current balances, including subsequent payments and refunds. They are not historical closing balances. A booking may overlap several reporting periods; full booking totals must not be summed across periods. Comparisons show current invoice totals for the previous stay-date cohort.

## Period activity

The chart intentionally measures a different basis:

- **Room revenue:** invoiced room charges allocated evenly across stay nights within the period, excluding tax, extra charges, cancelled stays, and blocked imports.
- **Period collections:** successful payments minus refunds recorded within the period, using transaction creation dates in UTC. These can relate to bookings outside the selected stay dates.

Extra charges are included in full booking totals, not distributed across room nights. This change does not introduce service-date revenue recognition or infer when historical services were delivered from their entry timestamps.

CSV exports use the same definitions and include non-cash settlement and credit balances per invoice.

## Reservation amendments and refunds

Editing a booked direct reservation updates its existing full invoices atomically with the new stay price. Existing tax amounts, extra charges, payments, and refunds are preserved; outstanding amounts and payment status are recalculated. If a shorter stay creates excess payment, that amount remains a credit balance. A billing audit entry records each changed room charge. Advance receipts created by the direct-booking advance workflow continue to bill only the advance before check-in; check-in expands them to the full edited stay price. An edit does not issue an invoice where none exists.

Each new refund records the selected successful payment in `metadata.original_payment_id`. Refund limits apply to that original payment as well as the invoice as a whole. Refunds retain the original payment method. Historical refunds without a valid link to a successful payment on the invoice conservatively reduce the selected payment's remaining limit; the system does not infer or rewrite old links. Some legacy cases may therefore require reconciliation before an additional refund is permitted.

## API and rollout

Reports, Reservations, and Payments overview reads use a session-scoped in-memory cache for 60 seconds. Returning to a recently opened page reuses its results and shares any pending request. Property/date/page filters use separate cache entries. Successful writes invalidate cached reads; Refresh forces a new read. Expired results remain visible while being refreshed on the next load, and logout clears the cache. The shared property selector no longer fetches on every navigation. Reservation form reference data and availability load when the form opens, and the ledger feed loads only when the ledger is shown.

Dashboard and Reports filter preferences survive browser reloads in local storage,
scoped to the signed-in account, page, and property (including All Properties).
Dashboard sample/live preferences are separate. Saved preferences include applied
date selections, Dashboard schedule/completed filters, and Reports sorting; draft
custom dates are not saved until Apply dates. Relative presets are recalculated
using Asia/Kolkata and advance when the day changes, including on return to the tab.
Custom dates remain fixed. Reset filters restores Today on Dashboard and This month
on Reports for the current property, along with each page's default view/sort.
Ordinary navigation preserves each page's selection; View detailed report explicitly
copies the Dashboard period into Reports for that property. Logout and account
changes clear saved filters; token renewal for the same account preserves them.
Cached financial results are not persisted with these preferences.

`GET /finance/overview` accepts optional paired `from` and `to` dates alongside `property_id` for API callers. Payments & Folios omits both dates and requests all-stay totals, including when opened from Reports. Partial, invalid, reversed, or oversized date ranges supplied by other callers are rejected.

`GET /reports/analytics` retains the `billed_total` and `paid_total` keys for current full invoice totals. Period activity is exposed separately as `room_revenue`, `period_net_collected`, `period_gross_collected`, and `period_refunded_total`. For compatibility, chart points retain the `billed` key, now meaning room revenue; room-category `billed_total` also means room revenue. Frontend labels and CSV exports describe these explicitly.

Deploy the backend and frontend together because summary semantics changed. No database migration or historical financial data rewrite is required.

## Verification

Regression tests cover date validation, property scope, multi-room folios across months, cancelled and blocked bookings, tax, extra charges, OTA metadata, refunds, Airbnb settlement, and overpayments. The database integration test compares Reports, Finance, and BillingService totals using transactional fixtures that are rolled back.
