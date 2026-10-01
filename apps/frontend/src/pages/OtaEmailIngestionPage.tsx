import { Mail, ArrowRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { ActionBtn, ErrorMsg, Panel, SectionHeading, StatCard, StatusBadge, inputCls, searchInputCls } from './ui';

type Props = { activePropertyId?: string };

type EmailConnection = {
  id: string;
  provider: string;
  status: string;
  email_address: string;
  last_sync_at: string | null;
  last_error_message?: string | null;
  trusted_from_email: string | null;
  trusted_subject: string | null;
};

type EmailSummary = {
  connected: boolean;
  connection: { email_address: string; provider: string; status: string; last_sync_at: string | null } | null;
  today: {
    emails_processed: number;
    reservations_created: number;
    reservations_updated: number;
    cancellations_processed: number;
    enquiries_created: number;
    needs_review: number;
    ignored: number;
  };
};

type EmailActivity = {
  id: string;
  from_email: string;
  from_name: string | null;
  subject: string;
  received_at: string;
  status: string;
  detected_source: string | null;
  detected_category: string | null;
  parser_version: string | null;
  automation_decision: string | null;
  classification_confidence?: number | null;
  processing_attempts?: number;
  last_error_code?: string | null;
  last_error_message?: string | null;
  plain_text?: string | null;
  extraction: {
    source?: string | null;
    category?: string | null;
    external_reservation_id: string | null;
    guest_name: string | null;
    guest_email: string | null;
    check_in: string | null;
    check_out: string | null;
    adults?: number | null;
    children?: number | null;
    external_room_name?: string | null;
    currency: string | null;
    total_amount: number | null;
    payment_breakdown?: {
      room_fee: number | null;
      guest_service_fee: number | null;
      occupancy_taxes: number | null;
      guest_paid_total: number | null;
      host_service_fee: number | null;
      host_payout: number | null;
      payout_amount: number | null;
      payout_sent_date: string | null;
      payout_arrival_date: string | null;
      bank_account: string | null;
      airbnb_account_id: string | null;
      tax_withholding: number | null;
    } | null;
  } | null;
};

type ActivityResponse = { data: EmailActivity[]; meta: { total: number } };
type SyncResult = { fetched: number; new_emails: number; processed: number; duplicates: number; backfill_hours?: number | null; reason?: string; failed?: number; needs_review?: number; ignored?: number };

const emptySummary: EmailSummary = {
  connected: false,
  connection: null,
  today: {
    emails_processed: 0,
    reservations_created: 0,
    reservations_updated: 0,
    cancellations_processed: 0,
    enquiries_created: 0,
    needs_review: 0,
    ignored: 0,
  },
};

export function OtaEmailIngestionPage({ activePropertyId = '' }: Props) {
  const requestVersion = useRef(0);
  const [connectionChecked, setConnectionChecked] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [connections, setConnections] = useState<EmailConnection[]>([]);
  const [summary, setSummary] = useState<EmailSummary>(emptySummary);
  const [activity, setActivity] = useState<EmailActivity[]>([]);
  const [activityQuery, setActivityQuery] = useState({ subject: '', fromEmail: '', status: 'ALL', receivedAfter: '', page: 1 });
  const { subject, fromEmail, status: filter, receivedAfter, page } = activityQuery;
  const [activityTotal, setActivityTotal] = useState(0);
  const activityPageSize = 25;
  const setSubject = (value: string) => setActivityQuery(current => ({ ...current, subject: value, page: 1 }));
  const setFromEmail = (value: string) => setActivityQuery(current => ({ ...current, fromEmail: value, page: 1 }));
  const setFilter = (value: string) => setActivityQuery(current => ({ ...current, status: value, page: 1 }));
  const [syncSubject, setSyncSubject] = useState('');
  const [syncFromEmail, setSyncFromEmail] = useState('');
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [backfillHours, setBackfillHours] = useState(24);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const activeConnection = connections.find((connection) => connection.status === 'CONNECTED') ?? connections.find(connection => connection.status !== 'DISCONNECTED') ?? connections[0] ?? null;
  const mailboxAvailable = Boolean(activeConnection && ['CONNECTED', 'RECONNECTING', 'ERROR'].includes(activeConnection.status));

  useEffect(() => {
    if (activePropertyId) void refresh();
    return () => { requestVersion.current += 1; };
  }, [activePropertyId, activityQuery]);

  useEffect(() => {
    setSyncFromEmail(activeConnection?.trusted_from_email ?? '');
    setSyncSubject(activeConnection?.trusted_subject ?? '');
  }, [activeConnection?.id, activeConnection?.trusted_from_email, activeConnection?.trusted_subject]);

  async function refresh() {
    const version = ++requestVersion.current;
    setRefreshing(true);
    setError(null);
    const params = new URLSearchParams();
    if (filter !== 'ALL') params.set('status', filter);
    if (subject.trim()) params.set('subject', subject.trim());
    if (fromEmail.trim()) params.set('from_email', fromEmail.trim());
    if (receivedAfter) params.set('received_after', receivedAfter);
    params.set('page', String(page));
    params.set('limit', String(activityPageSize));
    const query = params.toString() ? `?${params.toString()}` : '';
    try {
      const connectionsRes = await api.get<EmailConnection[]>(`/properties/${activePropertyId}/email-connections`);
      if (version !== requestVersion.current) return;
      setConnections(connectionsRes.data);
      setConnectionChecked(true);
      if (!connectionsRes.data.some(connection => ['CONNECTED', 'RECONNECTING', 'ERROR'].includes(connection.status))) {
        setSummary(emptySummary);
        setActivity([]);
        setActivityTotal(0);
        setSelectedEmailId(null);
        setSyncResult(null);
        return;
      }
      const [summaryRes, activityRes] = await Promise.all([
        api.get<EmailSummary>(`/properties/${activePropertyId}/email-automation/summary`),
        api.get<ActivityResponse>(`/properties/${activePropertyId}/email-automation/activity${query}`),
      ]);
      if (version !== requestVersion.current) return;
      setSummary(summaryRes.data);
      setActivity(activityRes.data.data);
      setActivityTotal(activityRes.data.meta.total);
      setSelectedEmailId(current => activityRes.data.data.some(email => email.id === current) ? current : activityRes.data.data[0]?.id ?? null);
    } catch (err) {
      if (version === requestVersion.current) setError(getApiErrorMessage(err));
    } finally {
      if (version === requestVersion.current) setRefreshing(false);
    }
  }

  function selectEmail(emailId: string) {
    setSelectedEmailId(emailId);
  }

  async function reviewEmail(emailId: string, action: string) {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      await api.post(`/properties/${activePropertyId}/email-automation/emails/${emailId}/review`, { action });
      await refresh();
      await selectEmail(emailId);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function reprocessEmail(emailId: string) {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      await api.post(`/properties/${activePropertyId}/email-automation/emails/${emailId}/reprocess`);
      await refresh();
      selectEmail(emailId);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function applyPayoutPayment(emailId: string) {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const response = await api.post<{ already_applied?: boolean; guest_name?: string | null; allocated_total?: number; amount?: number }>(
        `/properties/${activePropertyId}/email-automation/emails/${emailId}/apply-payout-payment`,
      );
      await refresh();
      selectEmail(emailId);
      const guest = response.data.guest_name ?? 'reservation';
      const amount = response.data.allocated_total ?? response.data.amount ?? 0;
      setNotice(response.data.already_applied ? `Payment was already updated for ${guest}.` : `Payment updated for ${guest}: ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function startProvider(provider: 'google' | 'microsoft') {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await api.post<{ auth_url?: string }>(`/properties/${activePropertyId}/email-connections/${provider}/start`);
      if (res.data.auth_url) {
        window.location.href = res.data.auth_url;
        return;
      }
      setError(`${provider} OAuth is not configured.`);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function syncNow() {
    if (!activeConnection) return;
    setLoading(true);
    setError(null);
    setSyncResult(null);
    const syncedAfter = new Date(Date.now() - backfillHours * 60 * 60_000).toISOString();
    try {
      const res = await api.post<SyncResult>(`/properties/${activePropertyId}/email-connections/${activeConnection.id}/sync`, {
        backfill_hours: backfillHours,
        from_email: syncFromEmail.trim(),
        subject: syncSubject.trim(),
      });
      setSyncResult(res.data);
      // A new query also refreshes when the same sync filters are used again.
      setActivity([]);
      setActivityTotal(0);
      setActivityQuery({ subject: syncSubject.trim(), fromEmail: syncFromEmail.trim(), status: 'ALL', receivedAfter: syncedAfter, page: 1 });
    } catch (err) {
      await refresh();
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function disconnectMailbox() {
    if (!activeConnection) return;
    setLoading(true);
    setError(null);
    try {
      await api.delete(`/properties/${activePropertyId}/email-connections/${activeConnection.id}`);
      setConnections([]);
      setSummary(emptySummary);
      setActivity([]);
      setSelectedEmailId(null);
      setSyncFromEmail('');
      setSyncSubject('');
      await refresh();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function saveSyncFilters() {
    if (!activeConnection) return;
    setLoading(true);
    setError(null);
    try {
      const response = await api.put<EmailConnection[]>(`/properties/${activePropertyId}/email-connections/${activeConnection.id}/filters`, {
        trusted_from_email: syncFromEmail.trim(),
        trusted_subject: syncSubject.trim(),
      });
      setConnections(response.data);
      await refresh();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (!activePropertyId) {
    return (
      <div className="px-5 lg:px-8 py-6">
        <Panel className="p-5">
          <SectionHeading title="Email Automation" eyebrow="Commercial" />
          <p className="text-sm font-medium text-slate-500">Select a property before connecting a mailbox.</p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="-mx-5 lg:-mx-8 -my-6 lg:-my-8 flex min-h-screen flex-col">
      <div className="flex flex-wrap items-start justify-between gap-4 px-5 lg:px-8 pt-6 lg:pt-8 pb-4">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Commercial</p>
          <h1 className="text-[22px] font-black text-slate-900 tracking-tight leading-none">Email Automation</h1>
          <p className="text-[12px] text-slate-400 mt-1">Connect a booking mailbox, ingest emails, and route confirmed data to review or enquiries.</p>
        </div>
        {connectionChecked && mailboxAvailable && <ActionBtn onClick={refresh} disabled={loading || refreshing}>Refresh</ActionBtn>}
      </div>

      {error && <div className="px-5 lg:px-8 pb-3"><ErrorMsg>{error}</ErrorMsg></div>}
      {notice && <div className="px-5 lg:px-8 pb-3"><p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">{notice}</p></div>}

      {!connectionChecked ? (
        <div className="px-5 pb-6 lg:px-8 lg:pb-8">
          <Panel className="max-w-xl p-6">
            {error ? <><p className="mb-4 text-sm text-slate-600">We couldn’t check your Gmail connection. Please try again.</p><ActionBtn onClick={refresh} disabled={refreshing}>Try again</ActionBtn></> : <div role="status" className="flex items-center gap-3 text-sm text-slate-500"><span aria-hidden="true" className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-emerald-600" />Checking Gmail connection…</div>}
          </Panel>
        </div>
      ) : !mailboxAvailable ? (
        <div className="px-5 pb-6 lg:px-8 lg:pb-8">
          <Panel className="max-w-xl p-6 sm:p-8">
            <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><Mail size={24} aria-hidden="true" /></div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900">{activeConnection ? 'Reconnect your Gmail' : 'Connect your booking Gmail'}</h2>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-500">{activeConnection ? 'Reconnect your mailbox to load booking emails and continue managing email activity.' : 'Connect the Gmail account that receives your OTA booking emails. Once connected, you can load emails, review bookings, and track activity here.'}</p>
            {activeConnection && <p className="mt-3 break-all text-xs font-medium text-slate-600">{activeConnection.email_address}</p>}
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <ActionBtn variant="primary" icon={<ArrowRight size={15} />} onClick={() => startProvider('google')} disabled={loading || refreshing}>{loading ? 'Connecting…' : activeConnection ? 'Reconnect Gmail' : 'Connect Gmail'}</ActionBtn>
              <ActionBtn onClick={refresh} disabled={loading || refreshing}>{refreshing ? 'Checking…' : 'Check connection'}</ActionBtn>
            </div>
          </Panel>
        </div>
      ) : (
      <div className="grid grid-cols-1 xl:grid-cols-[24rem_minmax(0,1fr)] gap-4 px-5 lg:px-8 pb-6 lg:pb-8">
        <div className="space-y-4">
          <Panel className="p-4">
            <SectionHeading title={activeConnection ? 'Connected mailbox' : 'Connect mailbox'} eyebrow="Connection" />
            {activeConnection ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-800">{activeConnection.email_address}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{activeConnection.provider} · last sync {formatDateTime(activeConnection.last_sync_at)}</p>
                  </div>
                  <StatusBadge label={activeConnection.status} />
                </div>
                {activeConnection.status === 'ERROR' && <p role="status" className="text-xs text-amber-700">The last sync failed. Try Sync now again.{activeConnection.last_error_message ? ` ${activeConnection.last_error_message}` : ''}</p>}
                {activeConnection.status === 'RECONNECTING' && <p role="status" className="text-xs text-slate-500">Mailbox sync is in progress.</p>}
                <div className="grid grid-cols-2 gap-2">
                  <ActionBtn onClick={syncNow} disabled={loading}>Sync now</ActionBtn>
                  <ActionBtn onClick={disconnectMailbox} disabled={loading} variant="danger">Disconnect</ActionBtn>
                </div>
              </div>
            ) : (
              <div className="flex">
                <ActionBtn onClick={() => startProvider('google')} disabled={loading}>Connect Gmail</ActionBtn>
              </div>
            )}
          </Panel>

          <Panel className="p-4">
            <SectionHeading title="Load emails" eyebrow="Mailbox filters" />
            <p className="mb-3 text-xs leading-relaxed text-slate-500">Sync uses the filters below. Leave them blank to load all emails in the selected period. Save filters to use them for automatic sync too.</p>
            <div className="space-y-3">
              <input value={syncFromEmail} onChange={(event) => setSyncFromEmail(event.target.value)} className={inputCls} type="email" placeholder="Only from email" />
              <input value={syncSubject} onChange={(event) => setSyncSubject(event.target.value)} className={inputCls} placeholder="Only subject contains" />
              <select
                value={backfillHours}
                onChange={(event) => setBackfillHours(Number(event.target.value))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
              >
                <option value={24}>Last 24 hours</option>
                <option value={72}>Last 3 days</option>
                <option value={168}>Last 7 days</option>
                <option value={720}>Last 30 days</option>
              </select>
              <div className="flex flex-wrap gap-2">
                <ActionBtn onClick={saveSyncFilters} disabled={loading || !activeConnection}>Save filters</ActionBtn>
                <ActionBtn onClick={syncNow} disabled={loading || !activeConnection}>Sync mailbox</ActionBtn>
              </div>
              {syncResult && (
                <p className="rounded-md bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">
                  Fetched {syncResult.fetched}, new {syncResult.new_emails}, processed {syncResult.processed}, duplicates {syncResult.duplicates}
                  {` · Needs review ${syncResult.needs_review ?? 0} · Ignored ${syncResult.ignored ?? 0} · Failed ${syncResult.failed ?? 0}`}
                  {syncResult.fetched === 0 ? ' · No emails matched these filters and dates.' : ''}
                  {syncResult.reason ? ` · ${syncResult.reason}` : ''}
                </p>
              )}
            </div>
          </Panel>

          <Panel className="p-4">
            <SectionHeading title="Find loaded emails" eyebrow="Activity filters" />
            <p className="mb-3 text-xs leading-relaxed text-slate-500">Search sender and subject separately. Both must match when filled.</p>
            {receivedAfter && <p className="mb-3 text-xs text-slate-500">Showing emails received since {formatDateTime(receivedAfter)}. Clear filters to see all loaded emails.</p>}
            <div className="space-y-3">
              <input value={fromEmail} onChange={(event) => setFromEmail(event.target.value)} className={`${searchInputCls} px-3`} type="email" placeholder="From email" />
              <input value={subject} onChange={(event) => setSubject(event.target.value)} className={`${searchInputCls} px-3`} placeholder="Subject contains" />
              <div className="flex flex-wrap gap-2">
                <ActionBtn onClick={() => setActivityQuery({ subject: '', fromEmail: '', status: 'ALL', receivedAfter: '', page: 1 })} disabled={loading || (!fromEmail && !subject && !receivedAfter && filter === 'ALL')}>Clear filters</ActionBtn>
              </div>
            </div>
          </Panel>
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-4">
          <div className="space-y-4 min-w-0">
          <Panel className="p-4">
            <SectionHeading title="Today" eyebrow="Automation metrics" />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Created" value={summary.today.reservations_created} />
              <StatCard label="Updated" value={summary.today.reservations_updated} />
              <StatCard label="Cancelled" value={summary.today.cancellations_processed} />
              <StatCard label="Enquiries" value={summary.today.enquiries_created} />
            </div>
          </Panel>

          <Panel className="p-4">
            <SectionHeading title="Recent activity" eyebrow={`${activityTotal} matching emails`}>
              <select value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 outline-none">
                <option value="ALL">All</option>
                <option value="NEEDS_REVIEW">Needs review</option>
                <option value="PROCESSED">Processed</option>
                <option value="IGNORED">Ignored</option>
                <option value="FAILED">Failed</option>
              </select>
            </SectionHeading>
            {activity.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm font-medium text-slate-400">{refreshing ? 'Loading email activity…' : 'No emails match the current filters.'}</p>
            ) : (
              <div className="space-y-3">
                {activity.map((email) => (
                  <EmailActivityRow
                    key={email.id}
                    email={email}
                    selected={email.id === selectedEmailId}
                    onSelect={() => selectEmail(email.id)}
                    onReview={reviewEmail}
                    onReprocess={reprocessEmail}
                    onApplyPayoutPayment={applyPayoutPayment}
                    loading={loading}
                  />
                ))}
              </div>
            )}
            {activityTotal > activityPageSize && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-xs text-slate-500">
              <span>Page {page} of {Math.ceil(activityTotal / activityPageSize)} · {activityTotal} emails</span>
              <div className="flex gap-2">
                <ActionBtn disabled={loading || refreshing || page <= 1} onClick={() => setActivityQuery(current => ({ ...current, page: current.page - 1 }))}>Previous</ActionBtn>
                <ActionBtn disabled={loading || refreshing || page * activityPageSize >= activityTotal} onClick={() => setActivityQuery(current => ({ ...current, page: current.page + 1 }))}>Next</ActionBtn>
              </div>
            </div>}
          </Panel>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

function EmailActivityRow({
  email,
  selected,
  onSelect,
  onReview,
  onReprocess,
  onApplyPayoutPayment,
  loading,
}: {
  email: EmailActivity;
  selected: boolean;
  onSelect: () => void;
  onReview: (id: string, action: string) => void;
  onReprocess: (id: string) => void;
  onApplyPayoutPayment: (id: string) => void;
  loading: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onSelect();
      }}
      className={`block w-full cursor-pointer rounded-lg border p-4 text-left transition ${selected ? 'border-emerald-200 bg-emerald-50/70' : 'border-slate-100 bg-slate-50/60 hover:bg-slate-50'}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <StatusBadge label={email.status} />
            {email.automation_decision && <StatusBadge label={email.automation_decision.replace(/_/g, ' ')} tone={email.status === 'NEEDS_REVIEW' ? 'attention' : 'default'} />}
          </div>
          <h3 className="truncate text-sm font-bold text-slate-900">{email.subject}</h3>
          <p className="mt-1 truncate text-xs font-semibold text-slate-500">{email.from_name || email.from_email} · {formatDateTime(email.received_at)}</p>
        </div>
        <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
          {email.status === 'NEEDS_REVIEW' && (
            <>
            {!isPaymentNotificationEmail(email) && (
              <>
                <ActionBtn size="sm" variant="primary" onClick={() => onReview(email.id, 'CREATE_RESERVATION')} disabled={loading}>Create reservation</ActionBtn>
                <ActionBtn size="sm" onClick={() => onReview(email.id, 'CREATE_ENQUIRY')} disabled={loading}>Enquiry</ActionBtn>
              </>
            )}
            <ActionBtn size="sm" onClick={() => onReview(email.id, 'IGNORE')} disabled={loading}>Ignore</ActionBtn>
            </>
          )}
          {isPaymentNotificationEmail(email) && (
            <ActionBtn size="sm" variant="primary" onClick={() => onApplyPayoutPayment(email.id)} disabled={loading}>Update payment</ActionBtn>
          )}
          <ActionBtn size="sm" onClick={() => onReprocess(email.id)} disabled={loading}>Reprocess</ActionBtn>
        </div>
      </div>
      {isPaymentNotificationEmail(email) ? (
        <div className="mt-4 grid grid-cols-1 gap-2 text-xs sm:grid-cols-4">
          <Detail label="Source" value={email.detected_source?.replace(/_/g, ' ') || 'Unknown'} />
          <Detail label="Category" value="Payment notification" />
          <Detail label="Airbnb payout" value={formatEmailMoney(email, email.extraction?.payment_breakdown?.host_payout)} />
          <Detail label="Tax withholding" value={formatEmailMoney(email, email.extraction?.payment_breakdown?.tax_withholding)} />
          <Detail label="Final profit" value={formatEmailMoney(email, email.extraction?.total_amount)} />
          <Detail label="Sent date" value={email.extraction?.payment_breakdown?.payout_sent_date || 'Not detected'} />
          <Detail label="Expected by" value={email.extraction?.payment_breakdown?.payout_arrival_date || 'Not detected'} />
          <Detail label="Guest" value={email.extraction?.guest_name || 'Not detected'} />
          <Detail label="Reservation" value={email.extraction?.external_reservation_id || 'Not detected'} />
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-2 text-xs sm:grid-cols-4">
          <Detail label="Source" value={email.detected_source?.replace(/_/g, ' ') || 'Unknown'} />
          <Detail label="Category" value={email.detected_category?.replace(/_/g, ' ') || 'Unknown'} />
          <Detail label="Guest" value={email.extraction?.guest_name || email.extraction?.guest_email || 'Not detected'} />
          <Detail label="Reservation" value={email.extraction?.external_reservation_id || 'Not detected'} />
          <Detail label="Check-in" value={email.extraction?.check_in || 'Not detected'} />
          <Detail label="Check-out" value={email.extraction?.check_out || 'Not detected'} />
          <Detail label="Guests" value={formatGuestCount(email)} />
          <Detail label="Guest paid" value={formatEmailMoney(email, email.extraction?.payment_breakdown?.guest_paid_total ?? email.extraction?.total_amount)} />
          <Detail label="Room fee" value={formatEmailMoney(email, email.extraction?.payment_breakdown?.room_fee)} />
          <Detail label="Taxes" value={formatEmailMoney(email, email.extraction?.payment_breakdown?.occupancy_taxes)} />
          <Detail label="Host fee" value={formatEmailMoney(email, email.extraction?.payment_breakdown?.host_service_fee)} />
          <Detail label="You earn" value={formatEmailMoney(email, email.extraction?.payment_breakdown?.host_payout)} />
        </div>
      )}
    </div>
  );
}

function formatGuestCount(email: EmailActivity) {
  const adults = email.extraction?.adults ?? 0;
  const children = email.extraction?.children ?? 0;
  const parts = [];
  if (adults > 0) parts.push(`${adults} adult${adults === 1 ? '' : 's'}`);
  if (children > 0) parts.push(`${children} child${children === 1 ? '' : 'ren'}`);
  return parts.length ? parts.join(', ') : 'Not detected';
}

function isPaymentNotificationEmail(email: EmailActivity) {
  return (
    email.detected_category === 'PAYMENT_NOTIFICATION' ||
    email.extraction?.category === 'PAYMENT_NOTIFICATION' ||
    /\b(payout|money was sent|total paid|bank account|earnings)\b/i.test(`${email.subject}\n${email.plain_text ?? ''}`)
  );
}

function formatStayRange(email: EmailActivity) {
  if (!email.extraction?.check_in && !email.extraction?.check_out) return 'Not detected';
  return `${email.extraction.check_in ?? '?'} - ${email.extraction.check_out ?? '?'}`;
}

function formatEmailMoney(email: EmailActivity, value?: number | null) {
  if (value == null) return 'Not detected';
  return `${email.extraction?.currency ?? ''} ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-slate-100 bg-white px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 truncate text-xs font-semibold text-slate-700">{value}</p>
    </div>
  );
}

function formatDateTime(value: string | null) {
  if (!value) return 'never';
  return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
