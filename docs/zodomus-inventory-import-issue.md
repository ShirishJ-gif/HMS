# Zodomus Inventory And Reservation Import Issue

## Summary

This note captures the issue investigated on May 7, 2026 for the active Zodomus sandbox connection:

- Property: `Harbour Residency`
- Property ID: `edce6718-c5fc-44f3-a7f4-a08c32a3d6fd`
- Channel connection ID: `7883af02-5d89-4972-972f-73042d2872fe`
- Provider hotel ID: `100`

Observed symptoms:

- Zodomus booking imports were failing with `Insufficient inventory on ...`
- Past-dated provider reservations such as `2019-05-20` were being processed by HMS
- Future sold-out dates such as `2026-08-07` were still bookable on the provider side
- Inventory syncs were partially failing with provider-side row errors

## Root Causes

### 1. Past-dated provider reservations were not skipped

HMS attempted to import stale provider reservations whose stay had already departed.

Result:

- old sandbox bookings such as `2019-05-20` reached local inventory allocation
- import failed with local `Insufficient inventory` errors instead of being ignored

### 2. Zodomus inventory sync horizon was too short

The Zodomus automation window was effectively `30` days.

Result:

- on May 7, 2026, inventory was only being pushed roughly through June 6, 2026
- sold-out dates like `2026-08-07` were outside the provider sync horizon
- Zodomus never received the sold-out signal for those dates

### 3. Provider-side room / transport issues still exist

After widening the sync window, provider-side failures remained.

There are two failure classes:

- hard room association issue for `10001`
- transport or provider instability for `10002` and `10003`

## HMS Fixes Applied

### Past reservation skip

Code change:

- [`apps/backend/src/modules/channel/zodomus-reservation-import.service.ts`](../apps/backend/src/modules/channel/zodomus-reservation-import.service.ts)

Behavior:

- new provider reservations are skipped when their latest departure date is already before today
- this only applies when the reservation does not already exist locally

Result:

- old sandbox stays such as `2019-05-20` are now counted as `skipped`
- they no longer fail import with inventory conflicts

### Minimum Zodomus sync horizon

Code change:

- [`apps/backend/src/modules/channel/channel.service.ts`](../apps/backend/src/modules/channel/channel.service.ts)

Behavior:

- effective `sync_window_days` is normalized to a minimum of `365`
- applies to defaults, existing saved connection config, and automation updates

Result:

- future sold-out dates are included in Zodomus inventory pushes

### Regression coverage

Tests added:

- [`apps/backend/src/modules/channel/zodomus-reservation-import.service.spec.ts`](../apps/backend/src/modules/channel/zodomus-reservation-import.service.spec.ts)
- [`apps/backend/src/modules/channel/channel.service.spec.ts`](../apps/backend/src/modules/channel/channel.service.spec.ts)

Validation:

- `npm run backend:test`
- result: all backend tests passed

## Runtime Fixes Applied To Local Sandbox

The local Zodomus sandbox connection was updated and re-synced.

Applied actions:

1. Set connection automation `sync_window_days` to `365`
2. Triggered inventory sync from `2026-05-07` through `2027-05-07`
3. Triggered booking sync to verify stale past reservations are skipped

## Verified Outcomes

### Past-date import behavior

Latest booking sync import summary showed:

- `discovered: 12`
- `skipped: 6`
- `failed: 6`

Meaning:

- old past-dated provider stays are now skipped
- remaining failures were only future `2026-08-07` reservations competing for already sold-out inventory

### August 7, 2026 sold-out push

Persisted inventory sync rows confirmed:

- `external_room_id = 10001`
- `syncDate = 2026-08-07`
- `available = 0`
- `status = SUCCEEDED`

This confirms HMS successfully pushed the sold-out `Single` inventory for `2026-08-07`.

## Remaining Provider-Side Issues

These are not fixed by HMS code changes.

### Room `10001`

Provider catalog:

- `10001 = Single room`

Latest wide inventory sync summary for `10001`:

- total rows: `366`
- succeeded: `2`
- failed: `364`

Primary provider error:

- `Check your room association with Zodomus. Your availability is higher than declared`

Interpretation:

- Zodomus does not accept the availability HMS is sending for room `10001`
- most likely Zodomus has a lower declared inventory count than HMS
- HMS currently has `2` sellable `Single` rooms

Required provider-side action:

- verify room `10001` is correctly associated and activated in Zodomus
- verify Zodomus declared inventory for that room matches HMS capacity

### Rooms `10002` and `10003`

Provider catalog:

- `10002 = Double room`
- `10003 = Suite`

Latest wide inventory sync patterns:

- `10002`: mostly `fetch failed`
- `10003`: mostly `fetch failed`

Interpretation:

- these do not currently look like mapping-rule rejections
- they look like transient provider/network failures

Required provider-side action:

- verify provider availability endpoint stability
- re-run syncs after provider-side checks
- consider retry/backoff improvements in HMS if this remains common

## Practical Conclusion

The HMS-side bugs were fixed:

- stale past bookings are skipped
- future inventory horizon is no longer too short

The remaining problem is on the provider side:

- `10001` has a Zodomus room association / declared inventory mismatch
- `10002` and `10003` show repeated provider transport failures

## Recommended Next Steps

1. Verify Zodomus room `10001` sellable inventory matches HMS `Single` capacity of `2`
2. Re-run inventory sync after provider-side correction
3. Confirm `10001` succeeds across the full forward window, not only on isolated dates
4. Investigate retry/backoff behavior for `fetch failed` inventory rows on `10002` and `10003`

## Follow-Up On May 9, 2026

The next live issue was not the earlier inventory horizon bug. The active blocker had shifted to provider authentication.

### Zodomus auth regression

Observed live behavior on May 9, 2026:

- `GET /account` returned `401`
- `POST /property-check` returned `401`
- inventory, rate, and booking syncs all failed with `401`

Root cause:

- backend env values `ZODOMUS_API_USER` and `ZODOMUS_API_PASSWORD` were no longer accepted by Zodomus
- HMS connection mappings were still correct; the app-level provider credentials were the problem

Fix applied locally:

1. Update `ZODOMUS_API_USER`
2. Update `ZODOMUS_API_PASSWORD`
3. Restart backend so the new env values are loaded

Verification after auth fix:

- direct Zodomus `/account` call returned `200`
- HMS `GET /channels/:id/provider-account` returned `200`
- HMS `POST /channels/:id/property-check` returned `200`

### Post-auth live sync results

After credentials were fixed and the backend restarted:

- `RATES` sync succeeded with `9/9` rows accepted
- `INVENTORY` sync for `2026-08-07` to `2026-08-08` partially succeeded with `5/6` rows accepted
- `BOOKINGS` sync succeeded in fetching the queue again

Important row-level inventory outcome:

- room `10001`, `2026-08-07`, `available = 0` succeeded
- room `10001`, `2026-08-08`, `available = 2` failed with `Check your room association with Zodomus. Your availability is higher than declared`

### Stronger room `10001` conclusion

Persisted inventory row history now strongly suggests Zodomus room `10001` is declared as capacity `1`.

Observed row history:

- `available = 2`: `0` successes, `1807` failures
- `available = 1`: `159` successes, `39` failures
- `available = 0`: `3` successes, `2` failures

Interpretation:

- Zodomus consistently accepts `0` and frequently accepts `1`
- Zodomus never accepts `2`
- HMS local `Single` capacity is still `2`

Practical provider-side action:

- update Zodomus room `10001` declared/sellable inventory to `2`

### Additional provider-side booking limitation

Live booking polling after auth recovery also exposed a provider-side reservation-detail limit.

Observed provider message:

- `Reservation already downloaded 5 times. The limit was reached.`

Interpretation:

- this is not an HMS auth or mapping problem
- repeated provider detail fetches eventually stop returning full reservation details for those reservation IDs
