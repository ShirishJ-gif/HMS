Use this as your validation sheet.

  Zodomus-HMS Validation Sheet

  ### 1. Connection setup

  - Action:
    Create OTA connection from HMS Channels page
  - Expected HMS result:
    connection saved, Property checked, Activated, IDs loaded
  - Expected Zodomus result:
    property-check and property-activation accepted
  - Pass if:
    HMS status and Zodomus responses both confirm setup

  ### 2. Provider catalog load

  - Action:
    click Load IDs in HMS and also call GET /room-rates in Postman
  - Expected HMS result:
    room IDs and rate IDs appear in mapping dropdowns
  - Expected Zodomus result:
    same room/rate IDs returned by room-rates
  - Pass if:
    HMS IDs match Postman IDs

  ### 3. Room mapping

  - Action:
    map one HMS room category to one Zodomus room ID
  - Expected HMS result:
    mapping appears in Mapped rooms
  - Expected Zodomus result:
    no direct API result needed here
  - Pass if:
    correct room category is linked to correct external room ID

  ### 4. Rate mapping

  - Action:
    map one HMS rate plan to one Zodomus rate ID
  - Expected HMS result:
    mapping appears in Mapped rates
  - Expected Zodomus result:
    no direct API result needed here
  - Pass if:
    correct rate plan is linked to correct external rate ID

  ### 5. Inventory sync

  - Action:
    trigger HMS inventory sync for a date range
  - Expected HMS result:
    sync log shows success or `PARTIAL_FAILED` with row-level failure details when only some provider rows are rejected
  - Expected Zodomus result:
    POST /availability accepted, GET /availability shows matching value
  - Pass if:
    HMS availability number equals Zodomus stored availability

  Operational note:
    if room `10001` accepts `available = 0` and `available = 1` but rejects `available = 2` with `Your availability is higher than declared`, treat that as a provider-side declared-capacity mismatch. Current live evidence indicates Zodomus room `10001` is declared as capacity `1` while HMS currently sends `2` on open dates.

  ### 6. Rate sync

  - Action:
    trigger HMS rate sync for a date range
  - Expected HMS result:
    sync log shows success and stores daily row results with date-specific base rates
  - Expected Zodomus result:
    POST /rates accepted for each room/rate/date row, or for price model `2`, POST /rates plus POST /rates-derived accepted
  - Pass if:
    correct roomId, rateId, dates, and price are accepted by Zodomus
  - Live proof:
    for room `10001` / rate `100991`, HMS pushed `2200` on `2026-05-15` and `3080` on `2026-05-16`, and Zodomus returned `200 OK` for both rows

  ### 7. New reservation import

  - Action:
    create test reservation in Zodomus through `POST /channels/:id/provider-reservations-create-test`
  - Preconditions:
    all provider rooms and rate IDs used by the test reservation must already be mapped to HMS room categories and rate plans
  - Expected HMS result:
    guest and reservation records created once without waiting for a later `BOOKINGS` sync
  - Expected Zodomus result:
    reservation appears in queue/detail APIs
  - Pass if:
    reservation data in HMS matches reservation data in Zodomus

  ### 8. Replay/idempotency

  - Action:
    trigger reservation import again for the same reservation
  - Expected HMS result:
    no duplicate reservation record created
  - Expected Zodomus result:
    same reservation may still be returned
  - Pass if:
    HMS updates or skips safely, no duplicate records

  ### 9. Reservation modification

  - Action:
    modify the same reservation in Zodomus through `POST /channels/:id/provider-reservations-create-test` with `status = modified`
  - Expected HMS result:
    existing reservation record updated immediately
  - Expected Zodomus result:
    modified reservation returned by queue/detail
  - Pass if:
    HMS reflects updated reservation without duplicate reservation records

  ### 10. Reservation cancellation

  - Action:
    cancel the same reservation in Zodomus through `POST /channels/:id/provider-reservations-create-test` with `status = cancelled`
  - Expected HMS result:
    existing HMS reservation group and room lines are marked cancelled immediately and inventory is released
  - Expected Zodomus result:
    cancelled reservation returned by queue/detail
  - Pass if:
    HMS status matches cancellation correctly even when provider detail omits `rooms[]`

  ### 10a. Stale and inventory edge cases

  - Action:
    trigger a `BOOKINGS` sync against a provider queue that contains old or overlapping sandbox reservations
  - Expected HMS result:
    reservations older than the 30-day backfill window are skipped, and overlapping stays can fail with inventory errors instead of overbooking HMS
  - Expected Zodomus result:
    provider queue/detail APIs can still return those stale or overlapping reservations
  - Pass if:
    HMS logs stale-skip or insufficient-inventory outcomes without creating duplicate or impossible reservation state

  ### 11. Pause/resume behavior

  - Action:
    pause connection, wait for scheduler window, then resume
  - Expected HMS result:
    paused connection does not auto-sync; resumed connection does
  - Expected Zodomus result:
    no unexpected outbound changes while paused
  - Pass if:
    scheduler respects connection status

  ### 11a. Provider auth verification

  - Action:
    call `GET /channels/:id/provider-account` and `POST /channels/:id/property-check`
  - Expected HMS result:
    both endpoints return `200` when backend env credentials are valid
  - Expected Zodomus result:
    account lookup returns `OK`; property-check returns active/OK statuses
  - Pass if:
    provider-backed endpoints do not return `401`
  - Notes:
    if they return `401`, fix backend env `ZODOMUS_API_USER` and `ZODOMUS_API_PASSWORD`, then restart backend before testing sync behavior

  ### 12. Remote disconnect

  - Action:
    click Disconnect
  - Expected HMS result:
    connection paused and marked disconnected
  - Expected Zodomus result:
    property cancellation accepted
  - Pass if:
    remote disconnect succeeds and connection is no longer treated as active

  What to record for each test

  - Test name
  - Action taken
  - HMS result
  - Zodomus result
  - Expected result
  - Pass / Fail
  - Notes / payload mismatch

  Final rule
  The integration is working correctly only if:

  - setup is valid
  - mappings are correct
  - outbound inventory/rates match
  - inbound reservations create/update/cancel correctly
  - replay does not create duplicates

  If you want, I can convert this into a markdown file in docs/ as a formal QA checklist.

 
› Implement {feature}
 
  gpt-5.4 medium · ~/Hms · 48.7M used
