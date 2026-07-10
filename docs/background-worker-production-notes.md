# Background Worker Production Notes

## Current Production Shape

The backend already supports running API traffic and background jobs separately through environment configuration.

Run the same backend code as two services:

```text
API service
JOB_WORKER_DISABLED=true

Worker service
JOB_WORKER_DISABLED=false
JOB_WORKER_POLL_MS=2000
JOB_WORKER_BATCH_SIZE=10
```

In local development, one backend process can still do both API handling and background work. Production should prefer separate API and worker processes so long-running channel jobs do not compete with user-facing HTTP requests.

## Why Separate API And Worker

- API processes stay focused on fast user requests.
- Worker processes handle slow/retryable jobs such as Zodomus syncs and activation.
- Worker count can be scaled independently from API count.
- Provider rate limits can be controlled by tuning worker count and `JOB_WORKER_BATCH_SIZE`.

Recommended starting point:

```text
1 API service
1 worker service
```

Scale workers only after monitoring pending job age, dead-letter jobs, provider rate-limit errors, and database load.

## Current Activation Job Implementation

Channel activation jobs currently reuse `BackgroundJobType.CHANNEL_SYNC` with a payload marker:

```json
{
  "channel_action": "ROOMS_ACTIVATION",
  "channel_connection_id": "..."
}
```

This is functional and avoids a Prisma enum migration during the current change set.

The worker handles two action values:

```text
PROPERTY_ACTIVATION
ROOMS_ACTIVATION
```

The API prevents duplicate pending/processing activation jobs for the same channel connection and action.

## Future Cleanup

Before final production launch, consider adding a dedicated background job type:

```text
CHANNEL_ACTION
```

Then activation payloads can become:

```json
{
  "action": "ROOMS_ACTIVATION",
  "channel_connection_id": "..."
}
```

Benefits:

- Cleaner logs and metrics.
- Easier admin filtering.
- Less confusion between sync jobs and activation jobs.
- Better future support for additional channel actions.

This requires a Prisma enum migration for `BackgroundJobType`.

## Recommended Hardening

Add these before heavy production traffic:

- Worker health check showing pending, processing, dead-letter, and oldest pending job age.
- Stuck `PROCESSING` job recovery when `locked_at` is too old.
- Production runbook for API/worker deployment.
- Alerts for old pending jobs and new dead-letter jobs.
