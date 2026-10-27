# Imported villa calendar history

Refreshing a property-linked iCal feed preserves previously observed unavailable
nights before today in Asia/Kolkata. Today and future nights are replaced by the
latest valid feed, so removed or cancelled events still release future inventory.
An existing block spanning today keeps its historical portion through yesterday.
Newly encountered past nights are also retained, without duplicating nights already
recorded for that property and feed.

The availability calendar labels past imported dates **Previously unavailable**.
The merged iCal calendar shows **History**, with the source, original reason, and
dates in the details. Imported unavailability is not treated as proof of a booking
or used to create reservations or financial transactions.

Empty feeds, Remove, and Clear all release current and future imported blocks;
they retain past history for linked properties. Other feeds and manual blocks are
unaffected. Malformed feeds leave existing data unchanged. The 90-day availability
window does not determine historical retention.

History is preserved from the imported data currently stored in HMS onward. Past
entries already deleted by older refreshes cannot be reconstructed unless a feed
supplies them again. Unlinked calendars stored only in the browser are not part of
this persisted villa inventory history.

Validation: `calendar-history.spec.ts` covers date boundaries and deduplication;
`calendar-history.integration.spec.ts` exercises sync and inventory readback in a
database transaction that is always rolled back. Enable the latter with
`RUN_ICAL_HISTORY_INTEGRATION=true`.
