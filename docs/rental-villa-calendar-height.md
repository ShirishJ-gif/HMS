# Rental villa calendar height — 2026-09-21

Requested change: fit the Reservations timeline to its visible content for rental villas, removing the fixed 720px minimum. Keep the viewport height cap and scrolling for larger calendars. Hotel, mixed-property, and preview timelines retain their existing sizing.

Only the villa timeline scope and two sizing styles in `apps/frontend/src/pages/BookingsPage.tsx` changed. Calendar rows, booking data, and the Reports / Analytics change are independent.

To revert only this change, from the repository root:

```sh
git apply --reverse --check docs/rental-villa-calendar-height.patch
git apply --reverse docs/rental-villa-calendar-height.patch
```

The patch records only this request, excluding earlier edits already in BookingsPage.tsx. If later edits cause a conflict, reverse these specific changes manually; do not restore the entire file. Keep the reports change unless separately requested.
