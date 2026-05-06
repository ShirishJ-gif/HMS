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
    sync log shows success
  - Expected Zodomus result:
    POST /availability accepted, GET /availability shows matching value
  - Pass if:
    HMS availability number equals Zodomus stored availability

  ### 6. Rate sync

  - Action:
    trigger HMS rate sync for a date range
  - Expected HMS result:
    sync log shows success
  - Expected Zodomus result:
    POST /rates accepted
  - Pass if:
    correct roomId, rateId, dates, and price are accepted by Zodomus

  ### 7. New reservation import

  - Action:
    create test reservation in Zodomus, then trigger HMS reservation import sync
  - Expected HMS result:
    guest and reservation records created once
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
    modify the same reservation in Zodomus, then import again
  - Expected HMS result:
    existing reservation record updated
  - Expected Zodomus result:
    modified reservation returned by queue/detail
  - Pass if:
    HMS reflects updated reservation without duplicate reservation records

  ### 10. Reservation cancellation

  - Action:
    cancel the same reservation in Zodomus, then import again
  - Expected HMS result:
    reservation marked cancelled or updated appropriately
  - Expected Zodomus result:
    cancelled reservation returned by queue/detail
  - Pass if:
    HMS status matches cancellation correctly

  ### 11. Pause/resume behavior

  - Action:
    pause connection, wait for scheduler window, then resume
  - Expected HMS result:
    paused connection does not auto-sync; resumed connection does
  - Expected Zodomus result:
    no unexpected outbound changes while paused
  - Pass if:
    scheduler respects connection status

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
