# HMS App API Tokens And Credentials

This file lists the tokens, secrets, and external credentials the HMS needs now and what it would need for live integrations later.

## 1. Required For Current App

These are needed to run the app locally or in production today.

### Backend

- `DATABASE_URL`
  - PostgreSQL connection string
  - Example: `postgresql://hms:hms_password@localhost:5432/hms?schema=public`

- `JWT_SECRET`
  - Secret used to sign access and refresh-related JWT flows
  - Must be strong in production

- `JWT_EXPIRES_IN`
  - Access-token lifetime
  - Example: `8h`

- `PAYMENT_WEBHOOK_SECRET`
  - HMAC secret used to verify inbound payment webhook signatures

- `CHANNEL_WEBHOOK_SECRET`
  - HMAC secret used to verify inbound channel/OTA webhook signatures

- `JOB_WORKER_DISABLED`
  - Turns the in-process background-job worker on or off
  - Example: `false`

- `JOB_WORKER_POLL_MS`
  - Polling interval for the in-process background-job worker

- `JOB_WORKER_BATCH_SIZE`
  - Max due jobs processed per worker cycle

- `JOB_RETRY_BASE_DELAY_MS`
  - Base retry delay used for backoff before a failed job becomes due again

### Frontend

- `VITE_API_BASE_URL`
  - Base URL of the backend API
  - Example: `http://localhost:3000`

## 2. Optional But Already Supported

These are only needed if you want real WhatsApp delivery instead of mock logging.

- `WHATSAPP_PROVIDER`
  - `mock` or `cloud_api`

- `WABA_ACCESS_TOKEN`
  - WhatsApp Cloud API access token

- `WABA_PHONE_NUMBER_ID`
  - WhatsApp Business phone number ID

- `WABA_API_VERSION`
  - Example: `v20.0`

## 3. Not Needed Yet, But Will Be Needed For Live Channel Manager Integration

The current code has the channel integration boundary, mappings, and sync logs, but real provider adapters are still placeholders.

For a live SiteMinder-style integration, expect to need:

- SiteMinder API token / access token
- SiteMinder account or client ID
- SiteMinder property or hotel ID
- SiteMinder room mapping IDs
- SiteMinder rate mapping IDs
- webhook secret or signature-verification secret if the provider supports callbacks

Depending on the provider contract, you may also need:

- API username / password
- partner key
- request signing secret
- sandbox and production base URLs

## 4. Not Needed Yet, But Will Be Needed For Live Payment Integration

The current payment flow supports local/mock providers. Real Razorpay or Stripe support is not implemented yet.

For live payments, expect to need:

### Razorpay

- Razorpay key ID
- Razorpay key secret
- Razorpay webhook secret

### Stripe

- Stripe secret key
- Stripe publishable key
- Stripe webhook signing secret

## 5. If You Build A Direct Booking Website Later

If you add a public hotel-booking frontend, you may also need:

- guest auth token or session secret, if customers can log in
- OTP / SMS provider token, if phone verification is used
- email provider API key, if booking emails are sent
- analytics / conversion tracking keys, if marketing tracking is required

These are not required for the current admin HMS.

## 6. Practical Summary

### Needed right now

- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `PAYMENT_WEBHOOK_SECRET`
- `CHANNEL_WEBHOOK_SECRET`
- `VITE_API_BASE_URL`

### Needed only for real WhatsApp

- `WHATSAPP_PROVIDER=cloud_api`
- `WABA_ACCESS_TOKEN`
- `WABA_PHONE_NUMBER_ID`
- `WABA_API_VERSION`

### Needed later for live integrations

- channel manager credentials such as SiteMinder token + external property IDs
- payment gateway credentials such as Razorpay/Stripe keys

## 7. Current Source Of Truth

Current env examples in this repo:

- `apps/backend/.env.example`
- `apps/frontend/.env.example`

Current live-capable tokens already reflected in env examples:

- backend database/auth config
- webhook verification secrets
- WhatsApp Cloud API config

Channel-manager and payment-provider credentials are not yet represented as first-class env vars because those integrations are still placeholders.
