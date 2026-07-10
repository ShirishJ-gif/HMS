import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export type ApiCallTraceKind = 'SYSTEM' | 'ZODOMUS';
export type ApiCallTraceDirection = 'INBOUND' | 'OUTBOUND';
export type ApiCallTraceStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED';

export type ApiCallTraceContext = {
  requestId: string;
  screenName?: string | null;
  userId?: string | null;
  userEmail?: string | null;
  userRole?: string | null;
  propertyId?: string | null;
  propertyIds?: string[] | null;
};

export type ApiCallTraceRecord = {
  id: string;
  sequence: number;
  trace_id: string;
  kind: ApiCallTraceKind;
  direction: ApiCallTraceDirection;
  target: string;
  screen_name: string | null;
  user_id: string | null;
  user_email: string | null;
  user_role: string | null;
  property_id: string | null;
  property_ids: string[];
  method: string;
  path: string;
  status: ApiCallTraceStatus;
  status_code: number | null;
  duration_ms: number | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
};

type StartCallInput = {
  kind: ApiCallTraceKind;
  direction: ApiCallTraceDirection;
  target: string;
  screenName?: string | null;
  method: string;
  path: string;
};

type FinishCallInput = {
  status: Exclude<ApiCallTraceStatus, 'PENDING'>;
  statusCode?: number | null;
  errorMessage?: string | null;
};

type ListTracesQuery = {
  traceId?: string;
  kind?: ApiCallTraceKind;
  limit?: number;
  propertyIds?: string[] | null;
};

type AttachActorInput = {
  userId: string;
  userEmail: string;
  userRole: string;
  propertyId?: string | null;
  propertyIds?: string[] | null;
};

@Injectable()
export class ApiCallTraceService {
  private static readonly storage = new AsyncLocalStorage<ApiCallTraceContext>();
  private static readonly records: ApiCallTraceRecord[] = [];
  private static sequence = 0;

  runWithContext<T>(context: ApiCallTraceContext, callback: () => T) {
    return ApiCallTraceService.storage.run(context, callback);
  }

  startSystemRequest(input: Pick<StartCallInput, 'method' | 'path' | 'screenName'>) {
    return ApiCallTraceService.startCall({
      kind: 'SYSTEM',
      direction: 'INBOUND',
      target: 'HMS_API',
      screenName: input.screenName,
      method: input.method,
      path: redactSensitiveUrl(input.path),
    });
  }

  finishCall(id: string, input: FinishCallInput) {
    ApiCallTraceService.finishCall(id, input);
  }

  attachAuthenticatedUser(input: AttachActorInput) {
    const context = ApiCallTraceService.storage.getStore();
    if (!context) {
      return;
    }

    context.userId = input.userId;
    context.userEmail = input.userEmail;
    context.userRole = input.userRole;
    context.propertyId = input.propertyId ?? null;
    context.propertyIds = input.propertyIds ?? null;

    for (const record of ApiCallTraceService.records) {
      if (record.trace_id !== context.requestId) continue;

      record.user_id = input.userId;
      record.user_email = input.userEmail;
      record.user_role = input.userRole;
      record.property_id = input.propertyId ?? null;
      record.property_ids = input.propertyIds ?? [];
    }
  }

  list(query: ListTracesQuery = {}) {
    const limit = this.normalizeLimit(query.limit);
    const records = ApiCallTraceService.records
      .filter((record) => this.recordIsInScope(record, query.propertyIds))
      .filter((record) => (query.traceId ? record.trace_id === query.traceId : true))
      .filter((record) => (query.kind ? record.kind === query.kind : true))
      .slice(-limit);

    return query.traceId ? records : records.reverse();
  }

  clear(propertyIds: string[] | null = null) {
    if (propertyIds === null) {
      const clearedCount = ApiCallTraceService.records.length;
      ApiCallTraceService.records.length = 0;
      ApiCallTraceService.sequence = 0;
      return clearedCount;
    }

    let clearedCount = 0;
    for (let index = ApiCallTraceService.records.length - 1; index >= 0; index -= 1) {
      if (!this.recordIsInScope(ApiCallTraceService.records[index], propertyIds)) continue;
      ApiCallTraceService.records.splice(index, 1);
      clearedCount += 1;
    }

    return clearedCount;
  }

  static startZodomusRequest(input: Pick<StartCallInput, 'method' | 'path'>) {
    return ApiCallTraceService.startCall({
      kind: 'ZODOMUS',
      direction: 'OUTBOUND',
      target: 'ZODOMUS_API',
      method: input.method,
      path: redactSensitiveUrl(input.path),
    });
  }

  static currentTraceId() {
    return ApiCallTraceService.storage.getStore()?.requestId ?? null;
  }

  static finishCall(id: string, input: FinishCallInput) {
    const record = ApiCallTraceService.records.find((item) => item.id === id);
    if (!record || record.status !== 'PENDING') {
      return;
    }

    const completedAt = Date.now();
    record.status = input.status;
    record.status_code = input.statusCode ?? null;
    record.error_message = input.errorMessage ? redactSensitiveText(input.errorMessage) : null;
    record.completed_at = new Date(completedAt).toISOString();
    record.duration_ms = Math.max(0, completedAt - Date.parse(record.started_at));
  }

  private static startCall(input: StartCallInput) {
    const now = new Date();
    const sequence = ++ApiCallTraceService.sequence;
    const context = ApiCallTraceService.storage.getStore();
    const traceId = context?.requestId ?? `background-${sequence}`;
    const screenName = input.screenName ?? context?.screenName ?? null;
    const record: ApiCallTraceRecord = {
      id: `api-trace-${sequence}`,
      sequence,
      trace_id: traceId,
      kind: input.kind,
      direction: input.direction,
      target: input.target,
      screen_name: screenName,
      user_id: context?.userId ?? null,
      user_email: context?.userEmail ?? null,
      user_role: context?.userRole ?? null,
      property_id: context?.propertyId ?? null,
      property_ids: context?.propertyIds ?? [],
      method: input.method,
      path: input.path,
      status: 'PENDING',
      status_code: null,
      duration_ms: null,
      error_message: null,
      started_at: now.toISOString(),
      completed_at: null,
    };

    ApiCallTraceService.records.push(record);
    ApiCallTraceService.trimRecords();
    return record.id;
  }

  private static trimRecords() {
    const maxRecords = ApiCallTraceService.readMaxRecords();
    if (ApiCallTraceService.records.length <= maxRecords) {
      return;
    }

    ApiCallTraceService.records.splice(0, ApiCallTraceService.records.length - maxRecords);
  }

  private static readMaxRecords() {
    const parsed = Number(process.env.API_CALL_TRACE_MAX_RECORDS ?? 1000);
    if (!Number.isFinite(parsed) || parsed < 100) {
      return 1000;
    }

    return Math.floor(parsed);
  }

  private normalizeLimit(limit?: number) {
    if (!limit || !Number.isFinite(limit)) {
      return 100;
    }

    return Math.min(Math.max(Math.floor(limit), 1), 500);
  }

  private recordIsInScope(record: ApiCallTraceRecord, propertyIds: string[] | null | undefined) {
    if (propertyIds === null || propertyIds === undefined) {
      return true;
    }

    if (propertyIds.length === 0) {
      return false;
    }

    return (
      (record.property_id !== null && propertyIds.includes(record.property_id)) ||
      record.property_ids.some((propertyId) => propertyIds.includes(propertyId))
    );
  }
}

const sensitiveQueryKey = /(token|secret|password|authorization|api[-_]?key|signature|credential|code)/i;
const sensitiveQueryValue = /([?&][^?&#=\s]*(?:token|secret|password|authorization|api[-_]?key|signature|credential|code)[^?&#=\s]*=)[^&#\s]*/gi;

export function redactSensitiveText(value: string) {
  return value.replace(sensitiveQueryValue, '$1[REDACTED]');
}

export function redactSensitiveUrl(value: string) {
  const fragmentIndex = value.indexOf('#');
  const withoutFragment = fragmentIndex >= 0 ? value.slice(0, fragmentIndex) : value;
  const queryIndex = withoutFragment.indexOf('?');
  if (queryIndex < 0) {
    return withoutFragment;
  }

  const path = withoutFragment.slice(0, queryIndex);
  const params = new URLSearchParams(withoutFragment.slice(queryIndex + 1));
  for (const key of Array.from(params.keys())) {
    if (sensitiveQueryKey.test(key)) {
      params.set(key, '[REDACTED]');
    }
  }

  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
