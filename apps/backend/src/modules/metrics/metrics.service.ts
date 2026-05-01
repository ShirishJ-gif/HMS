import { Injectable } from '@nestjs/common';
import {
  BackgroundJobStatus,
  BackgroundJobType,
  ChannelSyncStatus,
  ChannelSyncType,
  PaymentTransactionStatus,
  WebhookDomain,
  WebhookEventStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type MetricLabels = Record<string, string | number | boolean | undefined | null>;

type CounterMetric = {
  name: string;
  help: string;
  type: 'counter';
  values: Map<string, { labels: Record<string, string>; value: number }>;
};

type HistogramMetric = {
  name: string;
  help: string;
  type: 'histogram';
  buckets: number[];
  values: Map<
    string,
    {
      labels: Record<string, string>;
      count: number;
      sum: number;
      bucketCounts: number[];
    }
  >;
};

@Injectable()
export class MetricsService {
  private readonly counters = new Map<string, CounterMetric>();
  private readonly histograms = new Map<string, HistogramMetric>();

  constructor(private readonly prisma: PrismaService) {}

  recordHttpRequest(input: {
    method: string;
    path: string;
    statusCode: number;
    durationMs: number;
  }) {
    const normalizedPath = this.normalizePath(input.path);
    const statusClass = `${Math.floor(input.statusCode / 100)}xx`;

    this.incrementCounter('hms_http_requests_total', {
      method: input.method,
      path: normalizedPath,
      status_class: statusClass,
      status_code: input.statusCode,
    });
    this.observeHistogram('hms_http_request_duration_ms', input.durationMs, {
      method: input.method,
      path: normalizedPath,
      status_class: statusClass,
    });
  }

  recordPaymentCollect(status: PaymentTransactionStatus, provider: string) {
    this.incrementCounter('hms_payment_collect_total', { status, provider });
  }

  recordPaymentRefund(status: PaymentTransactionStatus, provider: string) {
    this.incrementCounter('hms_payment_refund_total', { status, provider });
  }

  recordChannelSyncQueued(syncType: ChannelSyncType, provider: string) {
    this.incrementCounter('hms_channel_sync_queued_total', { sync_type: syncType, provider });
  }

  recordChannelSyncCompleted(syncType: ChannelSyncType, provider: string, status: ChannelSyncStatus) {
    this.incrementCounter('hms_channel_sync_completed_total', {
      sync_type: syncType,
      provider,
      status,
    });
  }

  recordWebhookIngested(domain: WebhookDomain, provider: string, duplicate: boolean) {
    this.incrementCounter('hms_webhook_ingested_total', {
      domain,
      provider,
      duplicate,
    });
  }

  recordWebhookRejected(domain: string, reason: string) {
    this.incrementCounter('hms_webhook_rejected_total', {
      domain,
      reason,
    });
  }

  recordBackgroundJobQueued(type: BackgroundJobType) {
    this.incrementCounter('hms_background_job_queued_total', { type });
  }

  recordBackgroundJobCompleted(type: BackgroundJobType, status: BackgroundJobStatus) {
    this.incrementCounter('hms_background_job_completed_total', { type, status });
  }

  recordBackgroundJobRetried(type: BackgroundJobType) {
    this.incrementCounter('hms_background_job_retried_total', { type });
  }

  recordNotificationSend(template: string, result: 'sent' | 'failed' | 'skipped') {
    this.incrementCounter('hms_notification_send_total', { template, result });
  }

  async getSummary() {
    const [backgroundJobs, webhookEvents, channelSyncLogs] = await Promise.all([
      this.prisma.backgroundJob.groupBy({
        by: ['status', 'type'],
        _count: { _all: true },
      }),
      this.prisma.webhookEvent.groupBy({
        by: ['status', 'domain'],
        _count: { _all: true },
      }),
      this.prisma.channelSyncLog.groupBy({
        by: ['status', 'syncType'],
        _count: { _all: true },
      }),
    ]);

    return {
      uptime_seconds: Math.floor(process.uptime()),
      counters: this.serializeCounters(),
      histograms: this.serializeHistograms(),
      current: {
        background_jobs: backgroundJobs.map((entry) => ({
          status: entry.status,
          type: entry.type,
          count: entry._count._all,
        })),
        webhook_events: webhookEvents.map((entry) => ({
          status: entry.status,
          domain: entry.domain,
          count: entry._count._all,
        })),
        channel_sync_logs: channelSyncLogs.map((entry) => ({
          status: entry.status,
          sync_type: entry.syncType,
          count: entry._count._all,
        })),
      },
      timestamp: new Date().toISOString(),
    };
  }

  async renderPrometheus() {
    const summary = await this.getSummary();
    const lines: string[] = [];

    for (const counter of this.counters.values()) {
      lines.push(`# HELP ${counter.name} ${counter.help}`);
      lines.push(`# TYPE ${counter.name} counter`);
      for (const value of counter.values.values()) {
        lines.push(`${counter.name}${this.formatLabels(value.labels)} ${value.value}`);
      }
    }

    for (const histogram of this.histograms.values()) {
      lines.push(`# HELP ${histogram.name} ${histogram.help}`);
      lines.push(`# TYPE ${histogram.name} histogram`);
      for (const value of histogram.values.values()) {
        let cumulative = 0;
        histogram.buckets.forEach((bucket, index) => {
          cumulative += value.bucketCounts[index] ?? 0;
          lines.push(
            `${histogram.name}_bucket${this.formatLabels({ ...value.labels, le: bucket })} ${cumulative}`,
          );
        });
        lines.push(
          `${histogram.name}_bucket${this.formatLabels({ ...value.labels, le: '+Inf' })} ${value.count}`,
        );
        lines.push(`${histogram.name}_sum${this.formatLabels(value.labels)} ${value.sum}`);
        lines.push(`${histogram.name}_count${this.formatLabels(value.labels)} ${value.count}`);
      }
    }

    for (const entry of summary.current.background_jobs) {
      lines.push(
        `hms_background_jobs_current${this.formatLabels({
          status: entry.status,
          type: entry.type,
        })} ${entry.count}`,
      );
    }

    for (const entry of summary.current.webhook_events) {
      lines.push(
        `hms_webhook_events_current${this.formatLabels({
          status: entry.status,
          domain: entry.domain,
        })} ${entry.count}`,
      );
    }

    for (const entry of summary.current.channel_sync_logs) {
      lines.push(
        `hms_channel_sync_logs_current${this.formatLabels({
          status: entry.status,
          sync_type: entry.sync_type,
        })} ${entry.count}`,
      );
    }

    lines.push(`hms_uptime_seconds ${summary.uptime_seconds}`);
    return `${lines.join('\n')}\n`;
  }

  private incrementCounter(name: string, labels: MetricLabels, amount = 1) {
    const metric = this.ensureCounter(name);
    const normalizedLabels = this.normalizeLabels(labels);
    const key = this.labelsKey(normalizedLabels);
    const existing = metric.values.get(key);

    if (existing) {
      existing.value += amount;
      return;
    }

    metric.values.set(key, { labels: normalizedLabels, value: amount });
  }

  private observeHistogram(name: string, value: number, labels: MetricLabels) {
    const metric = this.ensureHistogram(name);
    const normalizedLabels = this.normalizeLabels(labels);
    const key = this.labelsKey(normalizedLabels);
    const existing =
      metric.values.get(key) ??
      {
        labels: normalizedLabels,
        count: 0,
        sum: 0,
        bucketCounts: metric.buckets.map(() => 0),
      };

    existing.count += 1;
    existing.sum += value;
    metric.buckets.forEach((bucket, index) => {
      if (value <= bucket) {
        existing.bucketCounts[index] += 1;
      }
    });

    metric.values.set(key, existing);
  }

  private ensureCounter(name: string) {
    const existing = this.counters.get(name);
    if (existing) {
      return existing;
    }

    const help = this.helpFor(name);
    const metric: CounterMetric = {
      name,
      help,
      type: 'counter',
      values: new Map(),
    };
    this.counters.set(name, metric);
    return metric;
  }

  private ensureHistogram(name: string) {
    const existing = this.histograms.get(name);
    if (existing) {
      return existing;
    }

    const help = this.helpFor(name);
    const metric: HistogramMetric = {
      name,
      help,
      type: 'histogram',
      buckets: [25, 50, 100, 250, 500, 1000, 2500, 5000],
      values: new Map(),
    };
    this.histograms.set(name, metric);
    return metric;
  }

  private serializeCounters() {
    return Array.from(this.counters.values()).map((metric) => ({
      name: metric.name,
      help: metric.help,
      values: Array.from(metric.values.values()).map((value) => ({
        labels: value.labels,
        value: value.value,
      })),
    }));
  }

  private serializeHistograms() {
    return Array.from(this.histograms.values()).map((metric) => ({
      name: metric.name,
      help: metric.help,
      buckets: metric.buckets,
      values: Array.from(metric.values.values()).map((value) => ({
        labels: value.labels,
        count: value.count,
        sum: value.sum,
        bucket_counts: value.bucketCounts,
      })),
    }));
  }

  private normalizeLabels(labels: MetricLabels) {
    return Object.fromEntries(
      Object.entries(labels)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => [key, String(value)]),
    );
  }

  private labelsKey(labels: Record<string, string>) {
    return JSON.stringify(Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)));
  }

  private formatLabels(labels: Record<string, string | number>) {
    const entries = Object.entries(labels);
    if (entries.length === 0) {
      return '';
    }

    return `{${entries
      .map(([key, value]) => `${key}="${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
      .join(',')}}`;
  }

  private normalizePath(path: string) {
    return path
      .split('?')[0]
      .replace(
        /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
        ':id',
      )
      .replace(/\/\d+\b/g, '/:id');
  }

  private helpFor(name: string) {
    const map: Record<string, string> = {
      hms_http_requests_total: 'Total HTTP requests observed by the HMS backend',
      hms_http_request_duration_ms: 'HTTP request duration in milliseconds',
      hms_payment_collect_total: 'Total payment collection attempts by status and provider',
      hms_payment_refund_total: 'Total payment refund attempts by status and provider',
      hms_channel_sync_queued_total: 'Total channel sync requests queued by provider and sync type',
      hms_channel_sync_completed_total: 'Total channel sync completions by provider, sync type, and status',
      hms_webhook_ingested_total: 'Total accepted webhook ingests by domain, provider, and replay status',
      hms_webhook_rejected_total: 'Total rejected webhook requests by domain and reason',
      hms_background_job_queued_total: 'Total background jobs queued by type',
      hms_background_job_completed_total: 'Total background jobs completed by type and final status',
      hms_background_job_retried_total: 'Total background job manual retries by type',
      hms_notification_send_total: 'Total notification delivery attempts by template and result',
    };

    return map[name] ?? name;
  }
}
