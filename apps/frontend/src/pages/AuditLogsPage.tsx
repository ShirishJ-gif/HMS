import { useState } from 'react';
import { api } from '../api/client';
import { PaginatedResponse, unwrapList } from '../api/pagination';
import { AuditLog } from '../api/types';
import { FilterBar } from '../components/FilterBar';
import { useAsync } from '../hooks/useAsync';

export function AuditLogsPage() {
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('ALL');
  const [actorFilter, setActorFilter] = useState<'ALL' | 'USER' | 'SYSTEM'>('ALL');
  const logsState = useAsync(
    async () => (await api.get<PaginatedResponse<AuditLog>>('/audit-logs', { params: { search: search || undefined } })).data,
    [search],
  );
  const logs = (logsState.data?.data ?? []).filter((log) => {
    if (actionFilter !== 'ALL' && log.action !== actionFilter) {
      return false;
    }

    if (actorFilter === 'USER' && !log.user) {
      return false;
    }

    if (actorFilter === 'SYSTEM' && log.user) {
      return false;
    }

    return true;
  });
  const actionCounts = logs.reduce<Record<string, number>>((counts, log) => {
    counts[log.action] = (counts[log.action] ?? 0) + 1;
    return counts;
  }, {});
  const systemCount = logs.filter((log) => !log.user).length;

  return (
    <section>
      <div className="page-header">
        <div>
          <p className="eyebrow">Governance</p>
          <h2>Audit Logs</h2>
          <p className="page-subtitle">Review sensitive operational actions across rooms, bookings, payments, and channels.</p>
        </div>
      </div>

      <FilterBar title="Audit filters">
        <label>
          Search audit logs
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Summary, entity, or record ID"
            value={search}
          />
        </label>
        <label>
          Action
          <select onChange={(event) => setActionFilter(event.target.value)} value={actionFilter}>
            <option value="ALL">All actions</option>
            <option value="CREATE">Create</option>
            <option value="UPDATE">Update</option>
            <option value="DELETE">Delete</option>
            <option value="CHECK_IN">Check-in</option>
            <option value="CHECK_OUT">Check-out</option>
            <option value="PAYMENT_COLLECT">Payment collect</option>
            <option value="PAYMENT_REFUND">Payment refund</option>
            <option value="CHANNEL_SYNC">Channel sync</option>
          </select>
        </label>
        <label>
          Actor
          <select onChange={(event) => setActorFilter(event.target.value as 'ALL' | 'USER' | 'SYSTEM')} value={actorFilter}>
            <option value="ALL">All actors</option>
            <option value="USER">User actions</option>
            <option value="SYSTEM">System actions</option>
          </select>
        </label>
      </FilterBar>

      {logsState.loading && <p className="muted">Loading audit logs...</p>}
      {logsState.error && <p className="error">{logsState.error}</p>}

      <div className="channel-summary-grid">
        <SummaryTile label="Visible events" value={logs.length.toString()} detail="Filtered stream" />
        <SummaryTile label="System events" value={systemCount.toString()} detail="Automated actions" />
        <SummaryTile label="Top action" value={topActionLabel(actionCounts)} detail="Current filter window" />
      </div>

      <div className="audit-stream">
        {logs.map((log) => (
          <article className="audit-event-card" key={log.id}>
            <div className="audit-event-main">
              <div className="audit-event-header">
                <span className={`status-pill ${auditActionTone(log.action)}`}>{formatAuditAction(log.action)}</span>
                <time>{new Date(log.created_at).toLocaleString()}</time>
              </div>
              <h3>{log.summary}</h3>
              <div className="audit-meta-row">
                <span>{log.entity_type}</span>
                <span>{log.entity_id ?? 'No entity id'}</span>
              </div>
            </div>
            <dl className="detail-list audit-event-side">
              <div>
                <dt>Actor</dt>
                <dd>{log.user?.name ?? 'System'}</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>{log.user?.role ?? 'AUTOMATION'}</dd>
              </div>
              <div>
                <dt>Property scope</dt>
                <dd>{log.property_id ?? 'Global'}</dd>
              </div>
            </dl>
          </article>
        ))}
        {logs.length === 0 && <div className="empty-state-card">No audit logs match the current filters.</div>}
      </div>
    </section>
  );
}

function SummaryTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="channel-summary-card">
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  );
}

function formatAuditAction(action: AuditLog['action']) {
  return action.replace(/_/g, ' ');
}

function auditActionTone(action: AuditLog['action']) {
  switch (action) {
    case 'DELETE':
      return 'failed';
    case 'CHECK_IN':
    case 'CHECK_OUT':
    case 'PAYMENT_COLLECT':
      return 'available';
    case 'CHANNEL_SYNC':
      return 'queued';
    default:
      return '';
  }
}

function topActionLabel(actionCounts: Record<string, number>) {
  const topEntry = Object.entries(actionCounts).sort((left, right) => right[1] - left[1])[0];
  return topEntry ? topEntry[0].replace(/_/g, ' ') : 'None';
}
