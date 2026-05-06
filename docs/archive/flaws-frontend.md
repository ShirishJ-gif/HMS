
• 1. The app has no session recovery path, so any expired access token turns the UI into a broken authenticated shell instead of re-authing or logging out cleanly. In apps/
     frontend/src/api/client.ts:20 every request blindly sends hms_access_token, but there is no response interceptor for 401, no refresh-token exchange, and no forced logout
     path. That is especially problematic because login explicitly stores a refresh token in apps/frontend/src/App.tsx:261 but the frontend never uses it. In practice, once
     the access token expires, pages will just accumulate request errors until the user manually clears session state.
  2. Corrupt or stale localStorage can crash the entire app on startup before React renders any fallback. In apps/frontend/src/App.tsx:59, the initial user state does
     JSON.parse(rawUser) with no try/catch. Any malformed hms_user value, partial write, or schema drift will throw during render initialization and take down the SPA. This is
     a real reliability bug for a local-storage-auth app.
  3. The channel manager UI cannot configure real provider connections, even though the backend contract supports credentials. In apps/frontend/src/pages/ChannelsPage.tsx:157,
     createConnection() only posts property_id, provider, name, and external_hotel_id. There is no way to enter credentials, even though the backend DTO accepts them. Combined
     with the hardcoded provider list in apps/frontend/src/pages/ChannelsPage.tsx:18, this means the UI can create connections that look valid in the table but are not
     actually usable for any non-mock integration.
  4. Multiple pages silently cap core datasets at 100 records and then do client-side filtering/calculation, which will produce incomplete lists and wrong operational counts
     as soon as the dataset grows. Examples:

  - apps/frontend/src/pages/BookingsPage.tsx:33 loads properties, guests, categories, and rate plans with limit: 100.
  - apps/frontend/src/pages/PaymentsPage.tsx:25 loads billings and reservation groups with limit: 100, then computes uninvoiced checked-out room stays from that partial set.
  - apps/frontend/src/pages/PropertySetupPage.tsx:69 caps properties, categories, rate plans, and pricing rules at 100.
  - apps/frontend/src/pages/ChannelsPage.tsx:100 caps connections, properties, categories, rate plans, jobs, and webhook events.
    This is a correctness issue, not just a scalability concern, because the UI presents totals and action candidates as if they were complete.

  5. useAsync clears previously loaded data on any refresh failure, which makes transient request errors unnecessarily destructive and causes pages to blank out instead of
     degrading gracefully. In apps/frontend/src/hooks/useAsync.ts:28, a failed reload sets data: null instead of preserving the last good payload. On operational screens with
     multiple parallel loads, that means one temporary API failure can wipe tables and derived stats the user was actively using, even though the last successful data was
     still useful.

  Open questions / assumptions:

  - I’m assuming token expiry is part of the intended auth model because the frontend stores both access and refresh tokens.
  - I did not do a pixel-level design review here; this is strictly about behavior, resilience, and data correctness.

  Change summary:

  - The frontend is functional for MVP/demo use, but it still behaves like an optimistic internal tool. The biggest weaknesses are session handling, local persistence
    robustness, incomplete data loading patterns, and the fact that integration-facing screens overstate what can actually be configured.
