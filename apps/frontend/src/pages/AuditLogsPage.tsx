import { useEffect, useState } from 'react';
import { getApiErrorMessage } from '../api/client';
import { fetchAllPages } from '../api/pagination';
import { AuditLog } from '../api/types';
import { CustomSelect } from '../components/CustomSelect';
import { FilterBar } from '../components/FilterBar';
import { MetricCard, StatusBadge, inputCls, labelCls } from './ui';

type ActorFilter = 'ALL' | 'USER' | 'SYSTEM';
type AuditLogsState = {
  data: AuditLog[] | null;
  error: string | null;
  loading: boolean;
};

const actionOptions = [
  { label: 'All actions', value: 'ALL' },
  { label: 'Create', value: 'CREATE' },
  { label: 'Update', value: 'UPDATE' },
  { label: 'Delete', value: 'DELETE' },
  { label: 'Check-in', value: 'CHECK_IN' },
  { label: 'Check-out', value: 'CHECK_OUT' },
  { label: 'Payment collect', value: 'PAYMENT_COLLECT' },
  { label: 'Payment refund', value: 'PAYMENT_REFUND' },
  { label: 'Channel sync', value: 'CHANNEL_SYNC' },
];

const actorOptions = [
  { label: 'All actors', value: 'ALL' },
  { label: 'User actions', value: 'USER' },
  { label: 'System actions', value: 'SYSTEM' },
];

let auditLogsCache: AuditLog[] | null = null;
let auditLogsCacheUpdatedAt = 0;
const auditLogsCacheTtlMs = 60_000;

export function AuditLogsPage() {
  const logsPerPage = 12;
  const [search, setSearch] = useState('');
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

    if (hasFreshCache) {
      setLogsState({ data: auditLogsCache, error: null, loading: false });
      return () => {
        active = false;
      };
    }

    setLogsState((current) => ({
      ...current,
      error: null,
      loading: !current.data,
    }));

    fetchAllPages<AuditLog>('/audit-logs')
      .then((loadedLogs) => {
        if (!active) return;
        auditLogsCache = loadedLogs;
        auditLogsCacheUpdatedAt = Date.now();
        setLogsState({ data: loadedLogs, error: null, loading: false });
      })
      .catch((err: unknown) => {
        if (!active) return;
        setLogsState((current) => ({
          data: current.data,
          error: getApiErrorMessage(err),
          loading: false,
        }));
      });

    return () => {
      active = false;
    };
  }, []);

  const normalizedSearch = search.trim().toLowerCase();
  const logs = (logsState.data ?? []).filter((log) => {
    if (normalizedSearch && !matchesAuditSearch(log, normalizedSearch)) return false;
    if (actionFilter !== 'ALL' && log.action !== actionFilter) return false;
    if (actorFilter === 'USER' && !log.user) return false;
    if (actorFilter === 'SYSTEM' && log.user) return false;
    return true;
  });
  const totalLogPages = Math.max(1, Math.ceil(logs.length / logsPerPage));
  const pagedLogs = logs.slice((logsPage - 1) * logsPerPage, logsPage * logsPerPage);
  const actionCounts = logs.reduce<Record<string, number>>((counts, log) => {
    counts[log.action] = (counts[log.action] ?? 0) + 1;
    return counts;
  }, {});
  const systemCount = logs.filter((log) => !log.user).length;

  useEffect(() => { setLogsPage(1); }, [search, actionFilter, actorFilter]);
  useEffect(() => { if (logsPage > totalLogPages) setLogsPage(totalLogPages); }, [logsPage, totalLogPages]);

  return (
    <section className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-amber-500 mb-1">Admin</p>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Audit Logs</h2>
          <p className="text-sm text-slate-500 mt-1 leading-relaxed max-w-2xl">
            Review sensitive operational actions across rooms, reservations, payments, mappings, and channel sync workflows.
          </p>
        </div>
      </div>

      <div className="flex gap-3 items-start bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm">
        <strong className="text-slate-800 flex-shrink-0">Audit purpose</strong>
        <span className="text-slate-500 leading-relaxed">Use this stream to trace who changed operational state, when it happened, and whether the action came from a user or the system itself.</span>
      </div>

      <FilterBar title="Audit filters">
        <label className={labelCls}>
          <span>Search audit logs</span>
          <input className={inputCls} onChange={(e) => setSearch(e.target.value)} placeholder="Summary, entity, or record ID" value={search} />
        </label>
        <label className={`${labelCls} min-w-[10rem] lg:w-[11.5rem]`}>
          <span>Action</span>
          <CustomSelect
            onChange={setActionFilter}
            options={actionOptions}
            value={actionFilter}
          />
        </label>
        <label className={`${labelCls} min-w-[10rem] lg:w-[11.5rem]`}>
          <span>Actor</span>
          <CustomSelect
            onChange={(value) => setActorFilter(value as ActorFilter)}
            options={actorOptions}
            value={actorFilter}
          />
        </label>
      </FilterBar>

      {logsState.loading && <p className="text-sm text-slate-400">Loading audit logs…</p>}
      {logsState.error && <p className="text-sm font-semibold text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-4 py-3">{logsState.error}</p>}

      <div className="grid grid-cols-3 gap-4">
        <MetricCard label="Visible events" value={logs.length.toString()} tone="blue" />
        <MetricCard label="System events" value={systemCount.toString()} tone="gold" />
        <MetricCard label="Top action" value={topActionLabel(actionCounts)} tone="green" />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-slate-400">Page {logsPage}/{totalLogPages}</span>
          <div className="flex items-center gap-2">
            <button className="inline-flex items-center gap-2 bg-white border border-slate-200 text-slate-700 font-semibold px-3 py-1.5 rounded-lg shadow-sm text-xs hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition" disabled={logsPage === 1} onClick={() => setLogsPage((page) => Math.max(1, page - 1))} type="button">Prev</button>
            <button className="inline-flex items-center gap-2 bg-white border border-slate-200 text-slate-700 font-semibold px-3 py-1.5 rounded-lg shadow-sm text-xs hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition" disabled={logsPage === totalLogPages} onClick={() => setLogsPage((page) => Math.min(totalLogPages, page + 1))} type="button">Next</button>
          </div>
        </div>
        {pagedLogs.map((log) => (
          <div key={log.id} className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_11rem_minmax(22rem,24rem)] gap-5 xl:gap-6 items-start">
            <div className="space-y-2.5">
              <div className="flex items-center gap-3 flex-wrap">
                <StatusBadge label={log.action.replace(/_/g, ' ')} tone={auditActionTone(log.action)} />
              </div>
              <h3 className="text-sm font-bold text-slate-900 leading-snug">{log.summary}</h3>
              <div className="flex items-center gap-4 flex-wrap">
                <span className="text-xs text-slate-500 font-medium">{log.entity_type}</span>
                <span className="text-xs text-slate-400 font-mono">{log.entity_id ?? 'No entity id'}</span>
              </div>
            </div>
            <time className="text-xs text-slate-400 xl:text-right whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</time>
            <dl className="grid gap-2 w-full">
              {[
                { label: 'Actor', value: log.user?.name ?? 'System' },
                { label: 'Role', value: log.user?.role ?? 'AUTOMATION' },
                { label: 'Property scope', value: log.property_id ?? 'Global' },
              ].map(({ label, value }) => (
                <div key={label} className="grid grid-cols-[9.5rem_minmax(0,1fr)] gap-3 border-t border-slate-50 pt-2 first:border-0 first:pt-0">
                  <dt className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</dt>
                  <dd className="text-xs font-bold text-slate-800 text-right break-words">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
        {logs.length === 0 && !logsState.loading && (
          <div className="text-center py-10 text-sm text-slate-400 font-semibold bg-white border border-slate-200 rounded-xl">No audit logs match the current filters.</div>
        )}
      </div>
    </section>
  );
}

function auditActionTone(action: AuditLog['action']): 'green' | 'rose' | 'gold' | 'default' {
  switch (action) {
    case 'DELETE': return 'rose';
    case 'CHECK_IN': case 'CHECK_OUT': case 'PAYMENT_COLLECT': return 'green';
    case 'CHANNEL_SYNC': return 'gold';
    default: return 'default';
  }
}

function topActionLabel(actionCounts: Record<string, number>) {
  const top = Object.entries(actionCounts).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0].replace(/_/g, ' ') : 'None';
}

function matchesAuditSearch(log: AuditLog, search: string) {
  return [
    log.summary,
    log.entity_type,
    log.entity_id,
    log.action,
    log.user?.name,
    log.user?.role,
    log.property_id,
  ].some((value) => value?.toLowerCase().includes(search));
}
