import { useEffect, useMemo, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { ErrorMsg, LoadingMsg, StatCard } from './ui';

type TraceKind = 'ALL' | 'SYSTEM' | 'ZODOMUS';

type ApiCallTraceRecord = {
  id: string;
  sequence: number;
  trace_id: string;
  kind: 'SYSTEM' | 'ZODOMUS';
  direction: 'INBOUND' | 'OUTBOUND';
  target: string;
  screen_name: string | null;
  method: string;
  path: string;
  status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
  status_code: number | null;
  duration_ms: number | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
};

type TraceResponse = {
  data: ApiCallTraceRecord[];
};

const kindOptions: TraceKind[] = ['ALL', 'SYSTEM', 'ZODOMUS'];

export function ApiTestingPage() {
  const [records, setRecords] = useState<ApiCallTraceRecord[]>([]);
  const [kind, setKind] = useState<TraceKind>('ZODOMUS');
  const [traceId, setTraceId] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortedRecords = useMemo(
    () => [...records].sort((a, b) => b.sequence - a.sequence),
    [records],
  );

  const stats = useMemo(() => {
    const zodomus = sortedRecords.filter((record) => record.kind === 'ZODOMUS');
    const failed = sortedRecords.filter((record) => record.status === 'FAILED');
    const system = sortedRecords.filter((record) => record.kind === 'SYSTEM');

    return {
      total: sortedRecords.length,
      system: system.length,
      zodomus: zodomus.length,
      failed: failed.length,
    };
  }, [sortedRecords]);

  useEffect(() => {
    void loadTraces();
  }, [kind]);

  useEffect(() => {
    if (!autoRefresh) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      void loadTraces({ silent: true });
    }, 3000);

    return () => window.clearInterval(timer);
  }, [autoRefresh, kind, traceId]);

  async function loadTraces(options: { silent?: boolean; traceIdOverride?: string } = {}) {
    if (!options.silent) {
      setLoading(true);
    }
    setError(null);

    try {
      const params: Record<string, string | number> = { limit: 200 };
      if (kind !== 'ALL') {
        params.kind = kind;
      }
      const activeTraceId = options.traceIdOverride ?? traceId;
      if (activeTraceId.trim()) {
        params.trace_id = activeTraceId.trim();
      }

      const response = await api.get<TraceResponse>('/api-call-traces', { params });
      setRecords(response.data.data);
    } catch (fetchError) {
      setError(getApiErrorMessage(fetchError));
    } finally {
      if (!options.silent) {
        setLoading(false);
      }
    }
  }

  async function clearTraces() {
    setClearing(true);
    setError(null);

    try {
      await api.delete('/api-call-traces');
      setRecords([]);
    } catch (clearError) {
      setError(getApiErrorMessage(clearError));
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[9.5px] font-bold uppercase tracking-[0.15em] text-slate-400">Admin</span>
            <span className="text-slate-300">.</span>
            <span className="text-[9.5px] font-bold uppercase tracking-[0.15em] text-slate-400">API Testing</span>
          </div>
          <h1 className="text-[24px] font-bold text-slate-900 tracking-tight leading-none">API Testing Trace</h1>
          <p className="text-[13px] text-slate-500 mt-1.5 max-w-3xl">
            Clear the trace, perform one action, then refresh this screen to see the exact HMS and Zodomus API order.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAutoRefresh((value) => !value)}
            className={`h-10 rounded-lg border px-3 text-[11.5px] font-semibold transition-colors ${
              autoRefresh
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            Auto refresh
          </button>
          <button
            type="button"
            onClick={() => void loadTraces()}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-[11.5px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            Refresh
          </button>
          <button
            type="button"
            disabled={clearing}
            onClick={() => void clearTraces()}
            className="h-10 rounded-lg border border-rose-200 bg-white px-3 text-[11.5px] font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
          >
            {clearing ? 'Clearing...' : 'Clear trace'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Total calls', value: stats.total },
          { label: 'HMS system calls', value: stats.system },
          { label: 'Zodomus calls', value: stats.zodomus },
          { label: 'Failed calls', value: stats.failed },
        ].map((item) => (
          <StatCard
            key={item.label}
            label={item.label}
            value={item.value}
            className="py-5"
            valueClassName="text-[1.5rem] text-slate-900"
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-black/[0.06] bg-white p-3">
        <div className="flex rounded-lg bg-slate-100 p-1">
          {kindOptions.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setKind(option)}
              className={`h-8 rounded-md px-3 text-[11.5px] font-semibold transition ${
                kind === option ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {option === 'ALL' ? 'All' : option === 'SYSTEM' ? 'HMS' : 'Zodomus'}
            </button>
          ))}
        </div>

        <input
          value={traceId}
          onChange={(event) => setTraceId(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              void loadTraces();
            }
          }}
          placeholder="Filter by trace_id"
          className="h-10 min-w-[18rem] flex-1 rounded-lg border border-slate-200 bg-white px-3 text-[12px] text-slate-800 outline-none placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/15"
        />
        <button
          type="button"
          onClick={() => void loadTraces()}
          className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-[11.5px] font-semibold text-slate-700 hover:bg-slate-50"
        >
          Apply
        </button>
        {traceId.trim() && (
          <button
            type="button"
            onClick={() => {
              setTraceId('');
              void loadTraces({ traceIdOverride: '' });
            }}
            className="h-10 rounded-lg px-3 text-[11.5px] font-semibold text-slate-500 hover:bg-slate-100"
          >
            Reset
          </button>
        )}
        <span className="text-[11px] font-medium text-slate-400">
          Filtered views renumber by visible call order; newest has the highest number.
        </span>
      </div>

      {loading && <LoadingMsg>Loading API call trace...</LoadingMsg>}
      {error && <ErrorMsg>{error}</ErrorMsg>}

      <div className="overflow-hidden rounded-xl border border-black/[0.06] bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/70">
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Call No.</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Type</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Screen</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Method</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Path</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Duration</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Trace ID</th>
                <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">Time</th>
              </tr>
            </thead>
            <tbody>
              {sortedRecords.length === 0 && !loading && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-[13px] font-semibold text-slate-500">
                    No API calls recorded. Clear the trace, perform one action, then refresh.
                  </td>
                </tr>
              )}

              {sortedRecords.map((record, index) => (
                <tr key={record.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-slate-100 px-2 text-[11px] font-bold text-slate-700" title={`Original trace sequence ${record.sequence}`}>
                      {kind === 'ALL' ? record.sequence : sortedRecords.length - index}
                    </span>
                    {kind !== 'ALL' && (
                      <p className="mt-1 text-[10px] font-semibold text-slate-400">global {record.sequence}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-md px-2 py-0.5 text-[10.5px] font-bold ${
                      record.kind === 'ZODOMUS'
                        ? 'bg-violet-50 text-violet-700'
                        : 'bg-sky-50 text-sky-700'
                    }`}>
                      {record.kind === 'ZODOMUS' ? 'Zodomus' : 'HMS'}
                    </span>
                  </td>
                  <td className="max-w-[12rem] px-4 py-3">
                    <p className="truncate text-[12px] font-semibold text-slate-600" title={record.screen_name ?? undefined}>
                      {record.screen_name ?? '-'}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-[12px] font-bold text-slate-700">{record.method}</td>
                  <td className="max-w-[22rem] px-4 py-3">
                    <p className="truncate font-mono text-[11.5px] text-slate-700" title={record.path}>{record.path}</p>
                    {record.error_message && (
                      <p className="mt-1 truncate text-[11px] text-rose-600" title={record.error_message}>{record.error_message}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-md px-2 py-0.5 text-[10.5px] font-bold ${
                      record.status === 'SUCCEEDED'
                        ? 'bg-emerald-50 text-emerald-700'
                        : record.status === 'FAILED'
                          ? 'bg-rose-50 text-rose-700'
                          : 'bg-amber-50 text-amber-700'
                    }`}>
                      {record.status_code ? `${record.status} ${record.status_code}` : record.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[12px] font-semibold text-slate-600">
                    {record.duration_ms == null ? '-' : `${record.duration_ms} ms`}
                  </td>
                  <td className="max-w-[14rem] px-4 py-3">
                    <button
                      type="button"
                      onClick={() => {
                        setTraceId(record.trace_id);
                        void loadTraces({ traceIdOverride: record.trace_id });
                      }}
                      className="block max-w-full truncate font-mono text-[11.5px] font-semibold text-indigo-600 hover:text-indigo-800"
                      title={record.trace_id}
                    >
                      {record.trace_id}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-[11.5px] font-semibold text-slate-500">
                    {new Date(record.started_at).toLocaleTimeString(undefined, {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
