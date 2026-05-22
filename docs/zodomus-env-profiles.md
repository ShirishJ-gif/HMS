# Zodomus Env Profiles

Last updated: 2026-05-11

Use this file when deciding how aggressively HMS should talk to Zodomus.

The goal is simple:

- sandbox should be conservative
- production should still be careful
- neither environment should hammer the provider

## Important Rule

Production credentials do not mean unlimited API usage.

Keep these protections enabled in both environments:

- batched inventory sync calls
- batched rate sync calls
- auth failure cooldown
- rate-limit cooldown
- modest concurrency

## Sandbox Profile

Use this profile for development, QA, and any provider account that is easy to suspend.

```text
ZODOMUS_ENVIRONMENT="sandbox"
ZODOMUS_SYNC_CONCURRENCY="1"
ZODOMUS_AUTO_SYNC_ENABLED="true"
ZODOMUS_AUTO_SYNC_INVENTORY_MINUTES="60"
ZODOMUS_AUTO_SYNC_RATES_MINUTES="180"
ZODOMUS_AUTO_SYNC_BOOKINGS_MINUTES="15"
ZODOMUS_AUTO_SYNC_WINDOW_DAYS="7"
ZODOMUS_SANDBOX_MIN_INVENTORY_SYNC_MINUTES="60"
ZODOMUS_SANDBOX_MIN_RATES_SYNC_MINUTES="180"
ZODOMUS_SANDBOX_MIN_BOOKINGS_SYNC_MINUTES="15"
ZODOMUS_SANDBOX_MAX_SYNC_WINDOW_DAYS="7"
SHOW_DETACHED_OTA_RESERVATION_HISTORY="false"
SHOW_PROVIDER_ONLY_RESERVATION_FAILURES="false"
ZODOMUS_SANDBOX_AUTH_BACKOFF_MINUTES="180"
ZODOMUS_SANDBOX_RATE_LIMIT_BACKOFF_MINUTES="60"
```

Recommended usage:

- leave inventory and rate sync on only if you are actively validating outbound payloads
- if the sandbox account is fragile, set `ZODOMUS_AUTO_SYNC_ENABLED="false"` and run manual syncs only
- verify `GET /channels/:id/provider-account` before turning automation back on after any auth issue
- keep detached OTA reservation history hidden during local/test cleanup so removed or paused OTA connections do not keep noisy test reservations, imported guests, or dashboard counts visible

## Production Profile

Use this as the starting point when real provider credentials are available.

Do not immediately raise traffic above this without confirming provider quotas.

```text
ZODOMUS_ENVIRONMENT="production"
ZODOMUS_SYNC_CONCURRENCY="2"
ZODOMUS_AUTO_SYNC_ENABLED="true"
ZODOMUS_AUTO_SYNC_INVENTORY_MINUTES="30"
ZODOMUS_AUTO_SYNC_RATES_MINUTES="60"
ZODOMUS_AUTO_SYNC_BOOKINGS_MINUTES="5"
ZODOMUS_AUTO_SYNC_WINDOW_DAYS="90"
ZODOMUS_PRODUCTION_ROUTINE_SYNC_WINDOW_DAYS="90"
ZODOMUS_PRODUCTION_FULL_SYNC_WINDOW_DAYS="365"
ZODOMUS_FULL_SYNC_WINDOW_DAYS="365"
SHOW_DETACHED_OTA_RESERVATION_HISTORY="true"
SHOW_PROVIDER_ONLY_RESERVATION_FAILURES="true"
ZODOMUS_AUTH_BACKOFF_MINUTES="60"
ZODOMUS_RATE_LIMIT_BACKOFF_MINUTES="30"
```

Recommended usage:

- start with concurrency `2`
- move to `3` only after provider stability is proven
- keep inventory and rate intervals moderate unless Zodomus explicitly approves a tighter cadence
- use the 365-day full sync action for go-live or repair instead of routine scheduling
- monitor sync failures before increasing throughput

## When To Tune Production Upward

Consider increasing production traffic only when all of these are true:

- the provider confirms your quota or rate limits
- the account has stable `200` responses over multiple days
- you are not seeing `401`, `403`, or `429` responses
- sync logs show that batching still leaves acceptable freshness

If you need more throughput, change one variable at a time:

1. increase `ZODOMUS_SYNC_CONCURRENCY`
2. then reduce inventory/rate interval minutes
3. keep booking polling separate from outbound inventory/rate tuning

## If You See `401` Or `429`

Do not solve that by making syncs more frequent.

Instead:

1. stop or slow automation
2. confirm the provider account is still valid and not suspended
3. verify the backend is using the intended env values
4. re-enable syncs gradually

## Notes About Current HMS Behavior

Current HMS protections:

- contiguous inventory rows with the same availability are batched into one Zodomus request
- contiguous rate rows with the same nightly price are batched into one Zodomus request
- sandbox concurrency defaults to `1`
- sandbox windows are capped to `7` days
- sandbox automation intervals are normalized upward for existing connections
- auth/rate-limit style failures stop retry amplification and pause automated scheduling

These protections reduce provider pressure, but they do not replace provider-side quota checks.
