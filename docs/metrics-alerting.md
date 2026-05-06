# HMS Metrics, Dashboards, and Alerts

This file defines the first concrete dashboard and alert set on top of `GET /metrics` and `GET /metrics/summary`.

## Primary Dashboard Panels

Use a 5-minute scrape interval or faster. These are the first panels to build in Grafana or any equivalent dashboard.

### API Health

- Request rate by path and status class from `hms_http_requests_total`
- 5xx rate by path from `hms_http_requests_total`
- p95 request latency by path from `hms_http_request_duration_ms`
- Top slow endpoints by average/p95 latency

### Background Jobs

- Current pending jobs by type from `hms_background_jobs_current`
- Current dead-letter jobs by type from `hms_background_jobs_current`
- Job completion outcomes by type from `hms_background_job_completed_total`
- Retry volume by type from `hms_background_job_retried_total`

### Channel Operations

- Queued channel sync volume by provider and sync type from `hms_channel_sync_queued_total`
- Channel sync completion outcomes by provider, sync type, and status from `hms_channel_sync_completed_total`
- Current failed channel sync logs by sync type from `hms_channel_sync_logs_current`
- Track persisted failed inventory rows per connection from `GET /channels/:id/inventory-row-results`
- Track recurring failed provider rooms from `GET /channels/:id/inventory-row-results`

### Webhooks

- Accepted webhook volume by domain/provider/duplicate from `hms_webhook_ingested_total`
- Rejected webhook volume by domain/reason from `hms_webhook_rejected_total`
- Current received/failed webhook backlog by domain from `hms_webhook_events_current`

### Payments

- Payment collect outcomes by provider and status from `hms_payment_collect_total`
- Payment refund outcomes by provider and status from `hms_payment_refund_total`

### Notifications

- Notification delivery attempts by template and result from `hms_notification_send_total`
- Current pending and dead-letter notification jobs from `hms_background_jobs_current{type="NOTIFICATION_SEND"}`

## Alert Thresholds

These thresholds are intentionally conservative for a small single-region PMS deployment. Tighten them only after observing normal production baselines.

### API

- `HighApi5xxRate`
  - Condition: 5xx responses are more than 2% of total requests for 5 minutes
  - Severity: critical
  - Why: users are actively failing requests

- `SlowApiP95`
  - Condition: p95 request latency is above 750 ms for 10 minutes on any high-traffic path
  - Severity: warning
  - Why: the app is healthy enough to answer, but degraded

- `SevereApiP95`
  - Condition: p95 request latency is above 1500 ms for 10 minutes on any high-traffic path
  - Severity: critical

### Background Jobs

- `DeadLetterJobsPresent`
  - Condition: any `hms_background_jobs_current{status="DEAD_LETTER"}` is above 0 for 10 minutes
  - Severity: critical
  - Why: work is no longer self-healing

- `PendingJobsBacklog`
  - Condition: `hms_background_jobs_current{status="PENDING"}` is above 50 for 10 minutes
  - Severity: warning

- `PendingJobsBacklogCritical`
  - Condition: `hms_background_jobs_current{status="PENDING"}` is above 200 for 10 minutes
  - Severity: critical

- `HighJobRetryRate`
  - Condition: more than 20 retries across all job types in 15 minutes
  - Severity: warning

### Channel Sync

- `ChannelSyncFailures`
  - Condition: more than 5 failed channel sync completions in 15 minutes
  - Severity: warning

- `ChannelSyncFailureSpike`
  - Condition: more than 15 failed channel sync completions in 15 minutes
  - Severity: critical

- `ChannelSyncDeadLetter`
  - Condition: any dead-letter `CHANNEL_SYNC` job exists for 5 minutes
  - Severity: critical

- `InventoryPartialFailuresPresent`
  - Condition: any inventory sync completions with status `PARTIAL_FAILED` in 15 minutes
  - Severity: warning
  - Why: some room/date rows are drifting even though the sync pipeline is still partially working

- `RecurringInventoryRoomFailures`
  - Condition: the same provider room appears in failed inventory rows 3 or more times in 1 hour
  - Severity: warning
  - Why: this usually indicates a room-specific provider rejection or stale mapping problem

- `InventoryFailedRowSpike`
  - Condition: a connection accumulates 10 or more failed inventory rows in 1 hour
  - Severity: critical
  - Why: provider-side inventory truth is actively diverging from HMS

### Webhooks

- `WebhookSignatureFailures`
  - Condition: more than 10 rejected webhooks in 15 minutes with reason `invalid_signature`
  - Severity: warning
  - Why: may indicate a provider config break or an attack/noise event

- `WebhookProcessingBacklog`
  - Condition: `hms_webhook_events_current{status="RECEIVED"}` is above 20 for 10 minutes
  - Severity: warning

- `WebhookFailuresPresent`
  - Condition: any `hms_webhook_events_current{status="FAILED"}` is above 0 for 10 minutes
  - Severity: critical

### Payments

- `PaymentFailures`
  - Condition: more than 5 failed payment collections in 15 minutes
  - Severity: warning

- `PaymentFailureRate`
  - Condition: failed payment collections exceed 10% of collection attempts in 15 minutes
  - Severity: critical

### Notifications

- `NotificationFailures`
  - Condition: more than 5 failed notification sends in 15 minutes
  - Severity: warning

- `NotificationDeadLetter`
  - Condition: any dead-letter `NOTIFICATION_SEND` job exists for 10 minutes
  - Severity: critical

## Suggested PromQL Sketches

Adjust label filters for your deployment.

```promql
sum(rate(hms_http_requests_total{status_class="5xx"}[5m]))
/
sum(rate(hms_http_requests_total[5m]))
```

```promql
histogram_quantile(
  0.95,
  sum by (le, path) (rate(hms_http_request_duration_ms_bucket[5m]))
)
```

```promql
sum(hms_background_jobs_current{status="DEAD_LETTER"})
```

```promql
sum(increase(hms_channel_sync_completed_total{status="FAILED"}[15m]))
```

```promql
sum(increase(hms_channel_sync_completed_total{sync_type="INVENTORY",status="PARTIAL_FAILED"}[15m]))
```

```promql
sum(increase(hms_webhook_rejected_total{reason="invalid_signature"}[15m]))
```

```promql
sum(increase(hms_notification_send_total{result="failed"}[15m]))
```

## Operating Notes

- `GET /metrics` is the scrape endpoint.
- `GET /metrics/summary` is useful for lightweight internal dashboards and sanity checks, but alerts should be driven from scraped time-series metrics.
- Persisted failed inventory row analytics come from `GET /channels/:id/inventory-row-results`; they are not yet exported as first-class Prometheus series.
- Start with warning alerts routed to Slack/email and critical alerts routed to pager/on-call.
- Keep notification and channel alerts property-agnostic until provider-specific handlers add richer labels.
