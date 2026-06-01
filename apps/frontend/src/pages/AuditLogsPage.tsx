import { useEffect, useDeferredValue, useState } from 'react';
import { getApiErrorMessage } from '../api/client';
import { fetchAllPages } from '../api/pagination';
import { AuditLog } from '../api/types';
import { CustomSelect } from '../components/CustomSelect';
import { ErrorMsg, LoadingMsg } from './ui';

type ActorFilter = 'ALL' | 'USER' | 'SYSTEM';

type AuditLogsState = {
  data: AuditLog[] | null;
  error: string | null;
  loading: boolean;
};

const OTHER_ACTION_OPTIONS: { value: string; label: string }[] = [
  { value: 'ALL',             label: 'All actions' },
  { value: 'CREATE',          label: 'Records · Create' },
  { value: 'UPDATE',          label: 'Records · Update' },
  { value: 'DELETE',          label: 'Records · Delete' },
  { value: 'CHANNEL_SYNC',    label: 'Channels · Sync' },
];

const QUICK_ACTION_CHIPS: { value: string; label: string }[] = [
  { value: 'CHECK_IN',        label: 'Check-in' },
  { value: 'CHECK_OUT',       label: 'Check-out' },
  { value: 'PAYMENT_COLLECT', label: 'Payment' },
  { value: 'PAYMENT_REFUND',  label: 'Refund' },
];

const ACTION_ACCENT: Record<string, string> = {
  DELETE:          'bg-rose-500',
  PAYMENT_COLLECT: 'bg-emerald-500',
  PAYMENT_REFUND:  'bg-amber-500',
  CHECK_IN:        'bg-emerald-500',
  CHECK_OUT:       'bg-sky-500',
  CHANNEL_SYNC:    'bg-violet-400',
  CREATE:          'bg-indigo-400',
  UPDATE:          'bg-slate-400',
};

const ACTION_BADGE: Record<string, string> = {
  DELETE:          'bg-rose-50 text-rose-700',
  PAYMENT_COLLECT: 'bg-emerald-50 text-emerald-700',
  PAYMENT_REFUND:  'bg-amber-50 text-amber-700',
  CHECK_IN:        'bg-emerald-50 text-emerald-700',
  CHECK_OUT:       'bg-sky-50 text-sky-700',
  CHANNEL_SYNC:    'bg-violet-50 text-violet-700',
  CREATE:          'bg-indigo-50 text-indigo-700',
  UPDATE:          'bg-slate-100 text-slate-600',
};

let auditLogsCache: AuditLog[] | null = null;
let auditLogsCacheUpdatedAt = 0;
const auditLogsCacheTtlMs = 60_000;

const LOGS_PER_PAGE = 15;

export function AuditLogsPage() {
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [actorFilter, setActorFilter] = useState<ActorFilter>('ALL');
  const [logsPage, setLogsPage] = useState(1);
  const [logsState, setLogsState] = useState<AuditLogsState>(() => ({
    data: auditLogsCache,
    error: null,
    loading: !auditLogsCache,
  }));

  useEffect(() => {
    let active = true;
    const hasFreshCache = auditLogsCache && Date.now() - auditLogsCacheUpdatedAt < auditLogsCacheTtlMs;
    if (hasFreshCache) { setLogsState({ data: auditLogsCache, error: null, loading: false }); return () => { active = false; }; }
    setLogsState((c) => ({ ...c, error: null, loading: !c.data }));
    fetchAllPages<AuditLog>('/audit-logs')
      .then((loadedLogs) => {
        if (!active) return;
        auditLogsCache = loadedLogs; auditLogsCacheUpdatedAt = Date.now();
        setLogsState({ data: loadedLogs, error: null, loading: false });
      })
      .catch((err: unknown) => { if (!active) return; setLogsState((c) => ({ ...c, error: getApiErrorMessage(err), loading: false })); });
    return () => { active = false; };
  }, []);

  const logs = (logsState.data ?? []).filter((log) => {
    if (actionFilter !== 'ALL' && log.action !== actionFilter) return false;
    if (actorFilter === 'USER'   && !log.user) return false;
    if (actorFilter === 'SYSTEM' &&  log.user) return false;
    if (deferredSearch.trim()) {
      const q = deferredSearch.trim().toLowerCase();
      if (![log.summary, log.entity_type, log.entity_id, log.action, log.user?.name, log.user?.role, log.property_id].some(v => v?.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const totalLogPages = Math.max(1, Math.ceil(logs.length / LOGS_PER_PAGE));
  const pagedLogs = logs.slice((logsPage - 1) * LOGS_PER_PAGE, logsPage * LOGS_PER_PAGE);
  const systemCount = (logsState.data ?? []).filter((l) => !l.user).length;
  const userCount   = (logsState.data ?? []).filter((l) =>  l.user).length;
  const topEntry    = Object.entries(
    (logsState.data ?? []).reduce<Record<string, number>>((acc, l) => { acc[l.action] = (acc[l.action] ?? 0) + 1; return acc; }, {})
  ).sort((a, b) => b[1] - a[1])[0];

  useEffect(() => { setLogsPage(1); }, [deferredSearch, actionFilter, actorFilter]);
  useEffect(() => { if (logsPage > totalLogPages) setLogsPage(totalLogPages); }, [logsPage, totalLogPages]);

  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[9.5px] font-bold uppercase tracking-[0.15em] text-slate-400">Admin</span>
            <span className="text-slate-300">·</span>
            <span className="text-[9.5px] font-bold uppercase tracking-[0.15em] text-slate-400">Audit Logs</span>
          </div>
          <h1 className="text-[24px] font-bold text-slate-900 tracking-tight leading-none">Audit Logs</h1>
          <p className="text-[13px] text-slate-500 mt-1.5">Review operational actions across rooms, reservations, payments, and channel sync.</p>
        </div>

        {/* Search + filters */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"/>
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search summary, entity, actor…"
              className="h-10 pl-9 pr-3 w-64 rounded-lg bg-white border border-black/[0.07] text-[12px] text-slate-800 placeholder-slate-400 outline-none"
            />
          </div>
          <div className="w-[220px]">
            <CustomSelect
              value={actorFilter}
              onChange={value => setActorFilter(value as ActorFilter)}
              options={[
                { label: 'All actors', value: 'ALL' },
                { label: 'Actor · User', value: 'USER' },
                { label: 'Actor · System', value: 'SYSTEM' },
              ]}
            />
          </div>
          <div className="w-[240px]">
            <CustomSelect
              value={OTHER_ACTION_OPTIONS.some(option => option.value === actionFilter) ? actionFilter : 'ALL'}
              onChange={setActionFilter}
              options={OTHER_ACTION_OPTIONS}
            />
          </div>
          <div className="flex items-center gap-2">
            {QUICK_ACTION_CHIPS.map(chip => (
              <button
                key={chip.value}
                type="button"
                onClick={() => setActionFilter(actionFilter === chip.value ? 'ALL' : chip.value)}
                className={`h-10 rounded-lg border px-3 text-[11.5px] font-semibold transition-colors ${
                  actionFilter === chip.value
                    ? 'border-slate-800 bg-slate-800 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Visible events', value: logs.length },
          { label: 'User actions',   value: userCount },
          { label: 'System actions', value: systemCount },
          { label: 'Top action',     value: topEntry ? topEntry[0].replace(/_/g, ' ') : 'None', small: true },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-black/[0.06] px-4 py-5">
            <p className="text-[9.5px] font-semibold uppercase tracking-wide text-slate-400 mb-1">{k.label}</p>
            <p className={`font-bold text-slate-900 tracking-tight leading-none ${'small' in k && k.small ? 'text-[1rem] mt-1' : 'text-[1.5rem]'}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {logsState.loading && <LoadingMsg>Loading audit logs…</LoadingMsg>}
      {logsState.error && <ErrorMsg>{logsState.error}</ErrorMsg>}

      {/* <div className="-mt-2 flex justify-end">
        <span className="text-[11px] text-slate-400">{logs.length} event{logs.length !== 1 ? 's' : ''}</span>
      </div> */}

      {/* ── Audit log feed ── */}
      <div className="space-y-2">
        {pagedLogs.length === 0 && !logsState.loading && (
          <div className="bg-white border border-black/[0.06] rounded-xl py-12 text-center">
            <p className="text-[13px] font-semibold text-slate-500">No audit events match the current filters.</p>
          </div>
        )}

        {pagedLogs.map((log) => {
          const accent = ACTION_ACCENT[log.action] ?? 'bg-slate-300';
          const badge  = ACTION_BADGE[log.action]  ?? 'bg-slate-100 text-slate-600';
          const ts = new Date(log.created_at);
          return (
            <div key={log.id} className="bg-white border border-black/[0.06] rounded-xl flex overflow-hidden hover:shadow-sm transition-shadow">
              {/* Left accent bar */}
              {/* <div className={`w-1 flex-shrink-0 ${accent}`} /> */}

              <div className="flex-1 px-5 py-4 grid grid-cols-1 xl:grid-cols-[1fr_auto_15rem] gap-4 xl:gap-6 items-start">
                {/* Main info */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10.5px] font-bold ${badge}`}>
                      {log.action.replace(/_/g, ' ')}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-500 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">{log.entity_type}</span>
                    {/* {log.entity_id && (
                      <span className="text-[10.5px] font-mono text-slate-400">{log.entity_id.slice(0, 16)}…</span>
                    )} */}
                  </div>
                  <p className="text-[13px] font-semibold text-slate-800 leading-snug">{log.summary}</p>
                </div>

                {/* Timestamp */}
                <div className="xl:text-right flex-shrink-0">
                  <p className="text-[12px] font-semibold text-slate-700">{ts.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{ts.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</p>
                </div>

                {/* Actor detail */}
                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 xl:border-l xl:border-slate-100 xl:pl-6">
                  {[
                    { label: 'Actor',    value: log.user?.name ?? 'System' },
                    { label: 'Role',     value: log.user?.role ?? 'Automation' },
                    { label: 'Property', value: log.property_id ? log.property_id.slice(0, 8) + '…' : 'Global' },
                  ].map(row => (
                    <div key={row.label} className="contents">
                      <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400 self-center">{row.label}</dt>
                      <dd className="text-[12px] font-semibold text-slate-700 text-right truncate">{row.value}</dd>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Pagination ── */}
      {totalLogPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-400">Page {logsPage} of {totalLogPages} · {logs.length} events</span>
          <div className="flex items-center gap-1.5">
            <button type="button" disabled={logsPage === 1} onClick={() => setLogsPage(1)}
              className="h-8 px-2.5 rounded-lg text-[11px] font-semibold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors">«</button>
            <button type="button" disabled={logsPage === 1} onClick={() => setLogsPage(p => Math.max(1, p - 1))}
              className="h-8 px-3 rounded-lg text-[11.5px] font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors">Prev</button>
            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalLogPages) }, (_, i) => {
                const start = Math.max(1, Math.min(logsPage - 2, totalLogPages - 4));
                const page  = start + i;
                return (
                  <button key={page} type="button" onClick={() => setLogsPage(page)}
                    className={`h-8 w-8 rounded-lg text-[11.5px] font-semibold transition-colors ${page === logsPage ? 'bg-slate-800 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                    {page}
                  </button>
                );
              })}
            </div>
            <button type="button" disabled={logsPage === totalLogPages} onClick={() => setLogsPage(p => Math.min(totalLogPages, p + 1))}
              className="h-8 px-3 rounded-lg text-[11.5px] font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors">Next</button>
            <button type="button" disabled={logsPage === totalLogPages} onClick={() => setLogsPage(totalLogPages)}
              className="h-8 px-2.5 rounded-lg text-[11px] font-semibold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors">»</button>
          </div>
        </div>
      )}
    </div>
  );
}
