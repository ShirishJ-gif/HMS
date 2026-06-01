import { useMemo, useState } from 'react';
import { api } from '../api/client';
import { NotificationFeedResponse, NotificationTone } from '../api/types';
import { useAsync } from '../hooks/useAsync';
import { ErrorMsg, LoadingMsg, PageHeader, StatusBadge } from './ui';

const toneClasses: Record<NotificationTone, string> = {
  arrival: 'bg-sky-50 text-sky-700 border-sky-100',
  reservation: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  housekeeping: 'bg-amber-50 text-amber-700 border-amber-100',
  payment: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  sync: 'bg-teal-50 text-teal-700 border-teal-100',
  maintenance: 'bg-rose-50 text-rose-700 border-rose-100',
};

export function NotificationsPage() {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const { data, error, loading } = useAsync(
    async () => (await api.get<NotificationFeedResponse>('/notifications', { params: { limit: 60 } })).data,
    [],
  );
  const notifications = data?.data ?? [];
  const unreadCount = data?.meta.unread ?? 0;
  const visibleNotifications = useMemo(
    () => notifications.filter((item) => filter === 'all' || item.status === 'Unread'),
    [filter, notifications],
  );

  return (
    <section className="max-w-[1120px] space-y-6">
      <PageHeader
        eyebrow="Activity"
        title="Notifications"
        subtitle="Reservation arrivals, housekeeping updates, payment events, sync results, and room alerts."
      >
        <div className="flex rounded-lg bg-slate-100 p-1">
          {[
            { id: 'all', label: 'All' },
            { id: 'unread', label: `Unread ${unreadCount}` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id as 'all' | 'unread')}
              className={[
                'rounded-md px-3 py-1.5 text-[12px] font-semibold transition',
                filter === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </PageHeader>

      {loading && <LoadingMsg>Loading notifications...</LoadingMsg>}
      {error && <ErrorMsg>{error}</ErrorMsg>}

      {!loading && !error && (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <SummaryCard label="Unread" value={String(unreadCount)} />
            <SummaryCard label="Feed items" value={String(notifications.length)} />
            <SummaryCard label="Needs attention" value={String(notifications.filter((item) => item.status === 'Unread').length)} />
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-100 bg-white">
            {visibleNotifications.length > 0 ? (
              visibleNotifications.map((item, index) => (
                <article
                  key={item.id}
                  className={[
                    'flex gap-3 px-4 py-4 transition hover:bg-slate-50',
                    index > 0 ? 'border-t border-slate-100' : '',
                    item.status === 'Unread' ? 'bg-white' : 'bg-slate-50/40',
                  ].join(' ')}
                >
                  <span className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border ${toneClasses[item.tone]}`}>
                    <NotificationIcon tone={item.tone} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900">{item.title}</h3>
                      <StatusBadge label={item.status} tone={item.status === 'Unread' ? 'blue' : 'default'} />
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">{item.message}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-slate-400">
                      <span>{item.source}</span>
                      <span>{formatExactTime(item.created_at)}</span>
                    </div>
                  </div>
                </article>
              ))
            ) : (
              <div className="px-4 py-10 text-center">
                <p className="text-sm font-semibold text-slate-700">No notifications found</p>
                <p className="mt-1 text-sm text-slate-400">
                  {filter === 'unread' ? 'There are no unread operational alerts.' : 'New reservation, payment, housekeeping, and sync events will appear here.'}
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      <strong className="mt-2 block text-2xl font-bold leading-none text-slate-900">{value}</strong>
    </div>
  );
}

function NotificationIcon({ tone }: { tone: NotificationTone }) {
  const p = {
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.8,
    viewBox: '0 0 24 24',
    className: 'h-4 w-4',
  };

  switch (tone) {
    case 'arrival':
      return <svg {...p}><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>;
    case 'reservation':
      return <svg {...p}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M4 9h16" /></svg>;
    case 'housekeeping':
      return <svg {...p}><path d="m12 3 1.2 3.3L16.5 7.5l-3.3 1.2L12 12l-1.2-3.3L7.5 7.5l3.3-1.2Z" /><path d="m5 14 .7 1.8L7.5 17l-1.8.7L5 19.5l-.7-1.8L2.5 17l1.8-.7Z" /></svg>;
    case 'payment':
      return <svg {...p}><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M15 12h6M17 10v4" /></svg>;
    case 'sync':
      return <svg {...p}><path d="M20 11a8 8 0 0 0-14.8-4" /><path d="M4 5v4h4" /><path d="M4 13a8 8 0 0 0 14.8 4" /><path d="M20 19v-4h-4" /></svg>;
    case 'maintenance':
      return <svg {...p}><path d="m14.7 6.3 3 3" /><path d="M5 19l6.6-6.6" /><path d="m13 5 6 6-7 7H6v-6Z" /></svg>;
    default:
      return null;
  }
}

function formatExactTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
