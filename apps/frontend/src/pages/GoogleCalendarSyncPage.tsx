import { FormEvent, useMemo, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { ActionBtn, ErrorMsg, Panel, SectionHeading, StatCard, inputCls } from './ui';

type GoogleCalendarFeed = {
  id: string;
  name: string;
  icalUrl: string;
  lastSyncedAt: string | null;
  lastStatus: 'NEVER_SYNCED' | 'SUCCEEDED' | 'FAILED';
  lastError: string | null;
  eventCount: number;
  content: string;
};

type FetchICalCalendarResponse = {
  url: string;
  content: string;
};

type GoogleCalendarEvent = {
  uid: string;
  title: string;
  start: Date;
  end: Date | null;
  allDay: boolean;
  location: string;
  description: string;
  calendarName: string;
};

const GOOGLE_CALENDAR_STATE_KEY = 'hms_google_calendar_sync_feeds';
const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function GoogleCalendarSyncPage() {
  const restoredFeeds = useMemo(() => readPersistedFeeds(), []);
  const [feeds, setFeeds] = useState<GoogleCalendarFeed[]>(restoredFeeds);
  const [name, setName] = useState('');
  const [icalUrl, setIcalUrl] = useState('');
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));

  const syncedFeeds = feeds.filter((feed) => feed.lastStatus === 'SUCCEEDED').length;
  const totalEvents = feeds.reduce((sum, feed) => sum + feed.eventCount, 0);
  const failedFeeds = feeds.filter((feed) => feed.lastStatus === 'FAILED').length;
  const events = useMemo(
    () => feeds.flatMap((feed) => parseICalEvents(feed.content, feed.name)),
    [feeds],
  );
  const sortedEvents = useMemo(() => [...events].sort((a, b) => a.start.getTime() - b.start.getTime()), [events]);
  const visibleEvents = useMemo(
    () => sortedEvents.filter((event) => eventCoversDate(event, selectedDate)),
    [selectedDate, sortedEvents],
  );
  const upcomingEvents = useMemo(() => {
    const today = startOfDay(new Date()).getTime();
    return sortedEvents.filter((event) => event.start.getTime() >= today).slice(0, 8);
  }, [sortedEvents]);
  const monthCells = useMemo(() => buildMonthCells(monthCursor), [monthCursor]);
  const eventsByDate = useMemo(() => {
    const grouped = new Map<string, GoogleCalendarEvent[]>();
    for (const event of sortedEvents) {
      for (const key of eventDateKeys(event)) {
        grouped.set(key, [...(grouped.get(key) ?? []), event]);
      }
    }
    return grouped;
  }, [sortedEvents]);

  async function addCalendar(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const trimmedUrl = icalUrl.trim();
    if (!trimmedUrl) {
      setError('Enter a Google Calendar iCal URL.');
      return;
    }

    const feed: GoogleCalendarFeed = {
      id: createFeedId(),
      name: name.trim() || inferCalendarName(trimmedUrl),
      icalUrl: trimmedUrl,
      lastSyncedAt: null,
      lastStatus: 'NEVER_SYNCED',
      lastError: null,
      eventCount: 0,
      content: '',
    };

    const existingIndex = feeds.findIndex((item) => item.icalUrl === trimmedUrl);
    const nextFeeds = existingIndex >= 0
      ? feeds.map((item, index) => (index === existingIndex ? { ...feed, id: item.id } : item))
      : [...feeds, feed];

    updateFeeds(nextFeeds);
    setName('');
    setIcalUrl('');
    await syncCalendar(existingIndex >= 0 ? nextFeeds[existingIndex] : feed, nextFeeds);
  }

  async function syncCalendar(feed: GoogleCalendarFeed, sourceFeeds = feeds) {
    setError(null);
    setSyncingId(feed.id);
    try {
      const response = await api.post<FetchICalCalendarResponse>('/ical-calendar/fetch', { url: feed.icalUrl });
      const eventCount = countICalEvents(response.data.content);
      updateFeeds(sourceFeeds.map((item) => (
        item.id === feed.id
          ? {
              ...item,
              icalUrl: response.data.url,
              lastSyncedAt: new Date().toISOString(),
              lastStatus: 'SUCCEEDED',
              lastError: null,
              eventCount,
              content: response.data.content,
            }
          : item
      )));
    } catch (syncError) {
      const message = getApiErrorMessage(syncError);
      updateFeeds(sourceFeeds.map((item) => (
        item.id === feed.id
          ? { ...item, lastSyncedAt: new Date().toISOString(), lastStatus: 'FAILED', lastError: message }
          : item
      )));
      setError(message);
    } finally {
      setSyncingId(null);
    }
  }

  function removeCalendar(feedId: string) {
    updateFeeds(feeds.filter((feed) => feed.id !== feedId));
  }

  function updateFeeds(nextFeeds: GoogleCalendarFeed[]) {
    setFeeds(nextFeeds);
    localStorage.setItem(GOOGLE_CALENDAR_STATE_KEY, JSON.stringify(nextFeeds));
  }

  return (
    <div className="-mx-5 lg:-mx-8 -my-6 lg:-my-8 flex min-h-screen flex-col">
      <div className="flex items-start justify-between gap-4 px-5 lg:px-8 pt-6 lg:pt-8 pb-4">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Calendar</p>
          <h1 className="text-[22px] font-black text-slate-900 tracking-tight leading-none">Google Calendar Sync</h1>
          <p className="text-[12px] text-slate-400 mt-1">Import Google Calendar iCal feeds and monitor sync status.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[22rem_minmax(0,1fr)] gap-4 px-5 lg:px-8 pb-6 lg:pb-8">
        <div className="space-y-4">
          <Panel className="p-4">
            <SectionHeading title="Add Google calendar" eyebrow="Source" />
            <form className="space-y-2.5" onSubmit={addCalendar}>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">Calendar name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Front desk calendar"
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">Google iCal URL</span>
                <input
                  value={icalUrl}
                  onChange={(event) => setIcalUrl(event.target.value)}
                  placeholder="https://calendar.google.com/calendar/ical/..."
                  className={inputCls}
                />
              </label>
              <ActionBtn type="submit" variant="primary" disabled={syncingId != null}>
                {syncingId ? 'Syncing...' : 'Add & sync'}
              </ActionBtn>
            </form>
          </Panel>

          {error && <ErrorMsg>{error}</ErrorMsg>}

          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Calendars" value={feeds.length} />
            <StatCard label="Synced" value={syncedFeeds} />
            <StatCard label="Failed" value={failedFeeds} />
          </div>
        </div>

        <div className="space-y-4 min-w-0">
          <Panel className="p-4">
            <SectionHeading title="Connected calendars" eyebrow={`${totalEvents} imported events`} />
            {feeds.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 px-4 py-10 text-center text-sm font-medium text-slate-400">
                Add a Google Calendar iCal URL to start syncing.
              </p>
            ) : (
              <div className="space-y-3">
                {feeds.map((feed) => (
                  <div key={feed.id} className="rounded-lg border border-slate-100 bg-slate-50/60 p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-900">{feed.name}</h3>
                          <StatusPill status={feed.lastStatus} />
                        </div>
                        <p className="mt-2 truncate text-xs font-medium text-slate-500">{feed.icalUrl}</p>
                        <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                          <Detail label="Events" value={String(feed.eventCount)} />
                          <Detail label="Last synced" value={feed.lastSyncedAt ? new Date(feed.lastSyncedAt).toLocaleString() : 'Not synced yet'} />
                          <Detail label="Mode" value="Google to HMS" />
                        </div>
                        {feed.lastError && (
                          <p className="mt-3 rounded-md border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                            {feed.lastError}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-shrink-0 gap-2">
                        <ActionBtn size="sm" onClick={() => syncCalendar(feed)} disabled={syncingId === feed.id}>
                          {syncingId === feed.id ? 'Syncing' : 'Sync now'}
                        </ActionBtn>
                        <ActionBtn size="sm" variant="danger" onClick={() => removeCalendar(feed.id)}>Remove</ActionBtn>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel className="p-4">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <SectionHeading title={formatMonth(monthCursor)} eyebrow="Calendar preview" />
              <div className="flex gap-2">
                <ActionBtn size="sm" onClick={() => setMonthCursor(addMonths(monthCursor, -1))}>Previous</ActionBtn>
                <ActionBtn size="sm" onClick={() => setMonthCursor(startOfMonth(new Date()))}>Today</ActionBtn>
                <ActionBtn size="sm" onClick={() => setMonthCursor(addMonths(monthCursor, 1))}>Next</ActionBtn>
              </div>
            </div>

            <div className="grid grid-cols-7 border-y border-slate-100 bg-slate-50">
              {weekdayLabels.map((label) => (
                <div key={label} className="px-2 py-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {label}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 border-l border-slate-100">
              {monthCells.map((cell) => {
                const key = dateKey(cell.date);
                const dayEvents = eventsByDate.get(key) ?? [];
                const active = key === selectedDate;
                const isCurrentMonth = cell.date.getMonth() === monthCursor.getMonth();
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedDate(key)}
                    className={[
                      'relative min-h-[5.75rem] border-b border-r border-slate-100 p-0 text-left transition',
                      active ? 'bg-sky-50 ring-1 ring-inset ring-sky-200' : 'bg-white hover:bg-slate-50',
                      isCurrentMonth ? 'text-slate-800' : 'text-slate-300',
                    ].join(' ')}
                  >
                    <span className="absolute left-3 top-3 text-xs font-bold leading-none">{cell.date.getDate()}</span>
                    {dayEvents[0] && (
                      <span className="absolute right-2 top-2 inline-flex max-w-[68%] truncate rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-bold leading-tight text-white">
                        Event
                      </span>
                    )}
                    <div className="absolute left-3 right-3 top-10 space-y-1">
                      {dayEvents.slice(0, 3).map((event) => (
                        <span key={event.uid} className="block truncate rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide leading-tight text-slate-600 shadow-sm">
                          {event.calendarName}
                        </span>
                      ))}
                      {dayEvents.length > 3 && (
                        <span className="block text-[10px] font-semibold text-slate-400">+{dayEvents.length - 3} more</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </Panel>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <EventList title={`Events on ${formatDateLabel(selectedDate)}`} events={visibleEvents} empty="No Google events on this date." />
            <EventList title="Upcoming events" events={upcomingEvents} empty="No upcoming Google events loaded." />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: GoogleCalendarFeed['lastStatus'] }) {
  const styles = {
    NEVER_SYNCED: 'bg-slate-100 text-slate-600',
    SUCCEEDED: 'bg-emerald-50 text-emerald-700',
    FAILED: 'bg-rose-50 text-rose-700',
  };
  const label = status === 'NEVER_SYNCED' ? 'Not synced' : status.toLowerCase();
  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${styles[status]}`}>{label}</span>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-slate-100 bg-white px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 truncate text-xs font-semibold text-slate-700">{value}</p>
    </div>
  );
}

function EventList({ title, events, empty }: { title: string; events: GoogleCalendarEvent[]; empty: string }) {
  return (
    <Panel className="min-h-[16rem] p-4">
      <SectionHeading title={title} />
      {events.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm font-medium text-slate-400">{empty}</p>
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <div key={event.uid} className="rounded-lg border border-slate-100 bg-slate-50/60 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <span className="mb-3 inline-flex rounded-md border border-[#4285f4]/20 bg-[#4285f4] px-2.5 py-1 text-[11px] font-bold text-white">
                    {event.calendarName}
                  </span>
                  <p className="truncate text-[15px] font-bold text-slate-900">{event.title}</p>
                  <p className="mt-2 text-sm font-semibold text-slate-500">{formatEventTime(event)}</p>
                </div>
                <span className="flex-shrink-0 rounded-lg bg-cyan-50 px-3 py-1.5 text-[12px] font-bold text-cyan-700 ring-1 ring-cyan-200">
                  Days: {getEventDayCount(event)}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                <Detail label="Start" value={formatDateTime(event.start, event.allDay)} />
                <Detail label="End" value={event.end ? formatDateTime(event.end, event.allDay) : 'Not provided'} />
              </div>
              {event.location && (
                <div className="mt-3">
                  <Detail label="Location" value={event.location} />
                </div>
              )}
              {event.description && (
                <div className="mt-3 rounded-md border border-slate-100 bg-white px-3 py-2.5">
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Description</p>
                  <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-600">{event.description}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function countICalEvents(content: string) {
  return content.match(/BEGIN:VEVENT/g)?.length ?? 0;
}

function parseICalEvents(input: string, calendarName: string): GoogleCalendarEvent[] {
  if (!input.trim()) return [];
  const lines = unfoldICalLines(input);
  const events: GoogleCalendarEvent[] = [];
  let current: Record<string, string> | null = null;
  let index = 0;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current) {
        const parsed = eventFromFields(current, index, calendarName);
        if (parsed) events.push(parsed);
        index += 1;
      }
      current = null;
      continue;
    }
    if (!current) continue;
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const rawKey = line.slice(0, separator);
    const value = line.slice(separator + 1);
    const key = rawKey.split(';')[0].toUpperCase();
    current[key] = value;
    current[`${key}__RAW`] = rawKey;
  }

  return events;
}

function unfoldICalLines(input: string) {
  const rawLines = input.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const lines: string[] = [];
  for (const rawLine of rawLines) {
    if ((rawLine.startsWith(' ') || rawLine.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += rawLine.slice(1);
    } else {
      lines.push(rawLine.trimEnd());
    }
  }
  return lines;
}

function eventFromFields(fields: Record<string, string>, index: number, calendarName: string): GoogleCalendarEvent | null {
  const start = parseICalDate(fields.DTSTART, fields.DTSTART__RAW);
  if (!start) return null;
  const end = parseICalDate(fields.DTEND, fields.DTEND__RAW);
  return {
    uid: unescapeICalText(fields.UID) || `google-event-${index}-${start.date.getTime()}`,
    title: unescapeICalText(fields.SUMMARY) || 'Untitled event',
    start: start.date,
    end: end?.date ?? null,
    allDay: start.allDay,
    location: unescapeICalText(fields.LOCATION),
    description: unescapeICalText(fields.DESCRIPTION),
    calendarName,
  };
}

function parseICalDate(value?: string, rawKey?: string) {
  if (!value) return null;
  const allDay = rawKey?.toUpperCase().includes('VALUE=DATE') || /^\d{8}$/.test(value);
  if (allDay) {
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6)) - 1;
    const day = Number(value.slice(6, 8));
    return { date: new Date(year, month, day), allDay: true };
  }

  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, utc] = match;
  const args = [Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)] as const;
  return {
    date: utc ? new Date(Date.UTC(...args)) : new Date(...args),
    allDay: false,
  };
}

function unescapeICalText(value?: string) {
  return (value ?? '')
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

function readPersistedFeeds(): GoogleCalendarFeed[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(GOOGLE_CALENDAR_STATE_KEY) ?? '[]') as Array<Partial<GoogleCalendarFeed>>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((feed) => feed.id && feed.name && feed.icalUrl)
      .map((feed) => ({
        id: String(feed.id),
        name: String(feed.name),
        icalUrl: String(feed.icalUrl),
        lastSyncedAt: feed.lastSyncedAt ? String(feed.lastSyncedAt) : null,
        lastStatus: feed.lastStatus === 'SUCCEEDED' || feed.lastStatus === 'FAILED' ? feed.lastStatus : 'NEVER_SYNCED',
        lastError: feed.lastError ? String(feed.lastError) : null,
        eventCount: typeof feed.eventCount === 'number' ? feed.eventCount : 0,
        content: feed.content ? String(feed.content) : '',
      }));
  } catch {
    return [];
  }
}

function createFeedId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `google_calendar_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function inferCalendarName(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes('google') ? 'Google Calendar' : parsed.hostname;
  } catch {
    return 'Google Calendar';
  }
}

function buildMonthCells(month: Date) {
  const first = startOfMonth(month);
  const gridStart = addDays(first, -first.getDay());
  return Array.from({ length: 42 }, (_, index) => ({ date: addDays(gridStart, index) }));
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function eventCoversDate(event: GoogleCalendarEvent, key: string) {
  return eventDateKeys(event).includes(key);
}

function eventDateKeys(event: GoogleCalendarEvent) {
  const start = startOfDay(event.start);
  const end = getInclusiveEventEndDate(event);
  const keys: string[] = [];
  let cursor = start;

  while (cursor.getTime() <= end.getTime()) {
    keys.push(dateKey(cursor));
    cursor = addDays(cursor, 1);
  }

  return keys;
}

function getInclusiveEventEndDate(event: GoogleCalendarEvent) {
  if (!event.end) return startOfDay(event.start);
  const endDay = startOfDay(event.end);

  if (event.allDay) {
    const exclusiveEnd = event.end.getTime() > event.start.getTime() ? addDays(endDay, -1) : endDay;
    return exclusiveEnd.getTime() < startOfDay(event.start).getTime() ? startOfDay(event.start) : exclusiveEnd;
  }

  const endsAtStartOfDay = event.end.getTime() === endDay.getTime();
  if (endsAtStartOfDay && endDay.getTime() > startOfDay(event.start).getTime()) {
    return addDays(endDay, -1);
  }

  return endDay;
}

function getEventDayCount(event: GoogleCalendarEvent) {
  if (!event.end) return 1;
  const days = Math.round((startOfDay(event.end).getTime() - startOfDay(event.start).getTime()) / 86_400_000);
  return Math.max(1, event.allDay ? days : days || 1);
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatMonth(date: Date) {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function formatDateLabel(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatEventTime(event: GoogleCalendarEvent) {
  if (event.allDay && event.end) return `${formatDateLabel(dateKey(event.start))} - ${formatDateLabel(dateKey(event.end))}`;
  if (event.allDay) return formatDateLabel(dateKey(event.start));
  const time = event.start.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  if (!event.end) return time;
  return `${time} - ${event.end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

function formatDateTime(date: Date, allDay: boolean) {
  if (allDay) return formatDateLabel(dateKey(date));
  return date.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
