import { useMemo, useState } from 'react';
import {
  ArrowDownToLine, Bell, BellRing, CalendarDays, CheckCheck, CreditCard,
  Inbox, Info, RefreshCw, Search, Sparkles, Wrench, X,
} from 'lucide-react';
import { api } from '../api/client';
import { NotificationFeedItem, NotificationFeedResponse, NotificationTone } from '../api/types';
import { workspaceAction, workspacePanel } from '../components/WorkspaceUI';
import { useAsync } from '../hooks/useAsync';
import { searchInputCls } from './ui';

const categories = {
  arrival: { label: 'Arrivals', icon: ArrowDownToLine, color: 'bg-sky-50 text-sky-600 ring-sky-100' },
  reservation: { label: 'Reservations', icon: CalendarDays, color: 'bg-emerald-50 text-emerald-600 ring-emerald-100' },
  housekeeping: { label: 'Housekeeping', icon: Sparkles, color: 'bg-amber-50 text-amber-600 ring-amber-100' },
  payment: { label: 'Payments', icon: CreditCard, color: 'bg-indigo-50 text-indigo-600 ring-indigo-100' },
  sync: { label: 'Sync updates', icon: RefreshCw, color: 'bg-teal-50 text-teal-600 ring-teal-100' },
  maintenance: { label: 'Maintenance', icon: Wrench, color: 'bg-rose-50 text-rose-600 ring-rose-100' },
} satisfies Record<NotificationTone, { label: string; icon: typeof Bell; color: string }>;
const emptyFeed: NotificationFeedItem[] = [];
const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500';

export function NotificationsPage() {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [category, setCategory] = useState<NotificationTone | 'all'>('all');
  const [search, setSearch] = useState('');
  const [refresh, setRefresh] = useState(0);
  const { data, error, loading } = useAsync(async () => {
    const response = await api.get<NotificationFeedResponse>('/notifications', { params: { limit: 60 } });
    return { ...response.data, updatedAt: new Date() };
  }, [refresh]);
  const notifications = data?.data ?? emptyFeed;
  const now = data?.updatedAt ?? new Date();
  const unreadCount = notifications.filter((item) => item.status === 'Unread').length;
  const todayCount = notifications.filter((item) => dayKey(item.created_at) === dayKey(now)).length;
  const query = search.trim().toLocaleLowerCase();
  const hasFilters = filter !== 'all' || category !== 'all' || search.length > 0;
  const matchingSearch = useMemo(() => notifications.filter((item) =>
    `${item.title} ${item.message} ${item.source} ${categories[item.tone].label}`.toLocaleLowerCase().includes(query),
  ), [notifications, query]);
  const matchingCategory = matchingSearch.filter((item) => category === 'all' || item.tone === category);
  const visibleNotifications = matchingCategory
    .filter((item) => filter === 'all' || item.status === 'Unread')
    .sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));
  const groups = new Map<string, NotificationFeedItem[]>();
  for (const item of visibleNotifications) {
    const label = dateGroup(item.created_at, now);
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }
  const categoryCounts = matchingSearch.filter((item) => filter === 'all' || item.status === 'Unread');
  const resetFilters = () => { setFilter('all'); setCategory('all'); setSearch(''); };

  return (
    <section className="space-y-5 pb-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">Activity center</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Notifications</h1>
          <p className="mt-1.5 text-sm text-slate-500">Stay on top of arrivals, room updates, and everything in between.</p>
        </div>
        <button type="button" className={`${workspaceAction} !border-slate-800 !bg-slate-800 !text-white`} disabled={loading} onClick={() => setRefresh((value) => value + 1)}>
          <RefreshCw size={14} className={loading ? 'motion-safe:animate-spin' : ''} aria-hidden="true" />
          {loading && data ? 'Refreshing…' : 'Refresh'}
        </button>
      </header>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="min-w-0 flex-1 break-words">
            <p className="font-semibold">{data ? 'Could not refresh notifications. Showing the last loaded activity.' : 'Could not load notifications.'}</p>
            <p className="mt-1 text-xs">{error}</p>
          </div>
          <button type="button" className={workspaceAction} disabled={loading} onClick={() => setRefresh((value) => value + 1)}>Try again</button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {[
          { label: 'Recent activity', value: notifications.length, detail: 'Notifications in this feed', icon: Inbox, color: 'bg-slate-100 text-slate-600' },
          { label: 'Unread', value: unreadCount, detail: 'Operational updates needing attention', icon: BellRing, color: 'bg-indigo-50 text-indigo-600' },
          { label: 'Today', value: todayCount, detail: 'Updates in this feed from today', icon: CalendarDays, color: 'bg-emerald-50 text-emerald-600' },
        ].map(({ label, value, detail, icon: Icon, color }) => (
          <div key={label} className={`${workspacePanel} flex items-start justify-between gap-3 p-3 sm:p-4 lg:p-5`}>
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500 sm:text-[11px] sm:tracking-wider">{label}</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-slate-900 sm:text-3xl">{data ? value : '—'}</p>
              <p className="mt-1.5 hidden text-xs leading-5 text-slate-500 sm:block">{detail}</p>
            </div>
            <span className={`hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:flex ${color}`}><Icon size={19} aria-hidden="true" /></span>
          </div>
        ))}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className={`${workspacePanel} p-3`} aria-label="Notification categories">
          <p className="px-2 pb-3 pt-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Categories</p>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 lg:grid-cols-1" role="group" aria-label="Filter by category">
            {([{ id: 'all' as const, label: 'All activity', icon: Inbox }, ...Object.entries(categories).map(([id, value]) => ({ id: id as NotificationTone, ...value }))]).map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" aria-pressed={category === id} onClick={() => setCategory(id)} className={`flex min-h-10 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition ${focusRing} ${category === id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                <Icon size={16} className="shrink-0" aria-hidden="true" />
                <span className="flex-1">{label}</span>
                <span className={`text-[11px] tabular-nums ${category === id ? 'text-indigo-600' : 'text-slate-400'}`}>{data ? categoryCounts.filter((item) => id === 'all' || item.tone === id).length : '—'}</span>
              </button>
            ))}
          </div>
          <div className="mt-4 hidden border-t border-slate-100 px-2 pb-1 pt-4 lg:block">
            <Info size={15} className="mb-2 text-slate-400" aria-hidden="true" />
            <p className="text-xs leading-5 text-slate-500">Unread alerts reflect work that needs attention. Their status updates as the work is completed.</p>
          </div>
        </aside>

        <div className={`${workspacePanel} min-w-0 overflow-hidden`} aria-busy={loading}>
          <div className="space-y-4 border-b border-slate-100 p-4 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <h2 className="text-sm font-semibold text-slate-900">{category === 'all' ? 'Your activity' : categories[category].label}</h2>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-500">{data ? visibleNotifications.length : '—'}</span>
              </div>
              <span role="status" className="text-[11px] text-slate-400">
                {loading ? (data ? 'Refreshing activity…' : 'Loading activity…') : data ? `${error ? 'Last updated' : 'Updated'} ${data.updatedAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : 'Activity unavailable'}
              </span>
            </div>
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex w-fit shrink-0 gap-1 rounded-lg bg-slate-100 p-1" role="group" aria-label="Filter by status">
                {(['all', 'unread'] as const).map((value) => (
                  <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`flex min-h-8 items-center gap-2 rounded-md px-3 text-xs font-semibold transition ${focusRing} ${filter === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                    {value === 'all' ? 'All' : 'Unread'}
                    <span className={`rounded px-1.5 py-0.5 text-[10px] tabular-nums ${filter === value ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400'}`}>
                      {data ? matchingCategory.filter((item) => value === 'all' || item.status === 'Unread').length : '—'}
                    </span>
                  </button>
                ))}
              </div>
              <div className="relative w-full xl:max-w-xs">
                <Search size={15} className="pointer-events-none absolute left-3 top-3 text-slate-400" aria-hidden="true" />
                <input type="search" aria-label="Search notifications" placeholder="Search guest, room, or update…" value={search} onChange={(event) => setSearch(event.target.value)} className={`${searchInputCls} pl-9 pr-10 [&::-webkit-search-cancel-button]:appearance-none`} />
                {search && <button type="button" aria-label="Clear search" onClick={() => setSearch('')} className={`absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:text-slate-700 ${focusRing}`}><X size={14} /></button>}
              </div>
            </div>
            {hasFilters && <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span role="status">{visibleNotifications.length} matching notification{visibleNotifications.length === 1 ? '' : 's'}</span><button type="button" onClick={resetFilters} className={`rounded font-semibold text-indigo-600 hover:text-indigo-800 ${focusRing}`}>Clear filters</button></div>}
          </div>

          {!data && loading ? (
            <div role="status" className="space-y-6 p-5">
              <span className="sr-only">Loading notifications</span>
              {[0, 1, 2, 3].map((row) => <div key={row} aria-hidden="true" className="flex gap-4 motion-safe:animate-pulse"><div className="h-10 w-10 shrink-0 rounded-xl bg-slate-100" /><div className="flex-1 space-y-3 py-1"><div className="h-3 w-1/3 rounded bg-slate-100" /><div className="h-3 w-5/6 rounded bg-slate-100" /><div className="h-2 w-1/4 rounded bg-slate-100" /></div></div>)}
            </div>
          ) : data && visibleNotifications.length > 0 ? (
            <div>
              {Array.from(groups, ([label, items]) => (
                <section key={label} aria-label={label}>
                  <div className="flex items-center gap-2 border-y border-slate-100 bg-slate-50/80 px-5 py-2.5 first:border-t-0">
                    <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</h3>
                    <span className="text-[10px] tabular-nums text-slate-400">{items.length}</span>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {items.map((item) => <NotificationRow key={item.id} item={item} />)}
                  </ul>
                </section>
              ))}
            </div>
          ) : data ? (
            <div className="flex flex-col items-center px-5 py-16 text-center">
              <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 text-slate-400">{query || category !== 'all' ? <Search size={24} /> : filter === 'unread' ? <CheckCheck size={24} /> : <Bell size={24} />}</span>
              <h3 className="text-sm font-semibold text-slate-800">{query || category !== 'all' ? 'No matching notifications' : filter === 'unread' ? 'You’re all caught up' : 'No activity yet'}</h3>
              <p className="mt-2 max-w-xs text-xs leading-5 text-slate-500">{hasFilters ? 'Try another category or clear your filters to see all recent activity.' : 'Reservation, payment, and room updates will appear here as they happen.'}</p>
              {hasFilters && <button type="button" className={`${workspaceAction} mt-5`} onClick={resetFilters}>Clear filters</button>}
            </div>
          ) : null}

          {data && <div className="flex flex-wrap justify-between gap-2 border-t border-slate-100 px-5 py-3 text-[11px] text-slate-400"><span>Showing {visibleNotifications.length} of {notifications.length} recent notifications</span><span>Latest {data.meta.limit} updates · Newest first</span></div>}
        </div>
      </div>
    </section>
  );
}

function NotificationRow({ item }: { item: NotificationFeedItem }) {
  const { icon: Icon, color, label } = categories[item.tone];
  const unread = item.status === 'Unread';
  const date = new Date(item.created_at);
  const validDate = !Number.isNaN(date.getTime());
  return (
    <li>
      <article className={`relative flex gap-3 px-4 py-5 transition hover:bg-slate-50 sm:gap-4 sm:px-5 ${unread ? 'bg-indigo-50/30' : 'bg-white'}`}>
        {unread && <span aria-hidden="true" className="absolute inset-y-5 left-0 w-0.5 rounded-r bg-indigo-400" />}
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${color}`}><Icon size={18} aria-hidden="true" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
            <h4 className={`break-words text-[13px] leading-5 ${unread ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'}`}>{item.title}</h4>
            <time dateTime={validDate ? item.created_at : undefined} title={validDate ? date.toLocaleString() : item.created_at} className="shrink-0 text-[11px] leading-5 text-slate-400">{validDate ? date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : 'Time unavailable'}</time>
          </div>
          <p className="mt-1.5 break-words text-xs leading-6 text-slate-500">{item.message}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[10px] font-medium">
            <span className="rounded-md bg-slate-100 px-2 py-1 text-slate-500">{label}</span>
            <span className="text-slate-400">{item.source}</span>
            {unread && <span className="inline-flex items-center gap-1.5 text-indigo-600"><span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />Unread</span>}
          </div>
        </div>
      </article>
    </li>
  );
}

function dayKey(value: string | Date) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dateGroup(value: string, now: Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Earlier activity';
  if (dayKey(date) === dayKey(now)) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dayKey(date) === dayKey(yesterday)) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}
