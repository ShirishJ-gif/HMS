import { FormEvent, useMemo, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { ActionBtn, ErrorMsg, Panel, SectionHeading, StatCard, inputCls } from './ui';

type CalendarFeed = {
  id: string;
  name: string;
  url: string;
  text: string;
  color: FeedColor;
  importedAt: string;
  availabilityWindowDays: number | null;
};

type ICalEvent = {
  uid: string;
  title: string;
  start: Date;
  end: Date | null;
  allDay: boolean;
  location: string;
  description: string;
  feedId: string;
  feedName: string;
  color: FeedColor;
  availabilityWindowClosed: boolean;
};

type FetchICalCalendarResponse = {
  url: string;
  content: string;
};

type FeedColor = 'emerald' | 'sky' | 'amber' | 'rose' | 'indigo' | 'slate';

const ICAL_STATE_KEY = 'hms_ical_calendar_feeds';
const legacyStateKey = 'hms_ical_calendar_state';
const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const feedColors: FeedColor[] = ['emerald', 'sky', 'amber', 'rose', 'indigo', 'slate'];
const feedSwatches: Record<FeedColor, string> = {
  emerald: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  sky: 'bg-sky-100 text-sky-800 border-sky-200',
  amber: 'bg-amber-100 text-amber-800 border-amber-200',
  rose: 'bg-rose-100 text-rose-800 border-rose-200',
  indigo: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  slate: 'bg-slate-100 text-slate-700 border-slate-200',
};

export function ICalCalendarPage() {
  const restoredFeeds = useMemo(() => readPersistedFeeds(), []);
  const [feeds, setFeeds] = useState<CalendarFeed[]>(restoredFeeds);
  const [feedName, setFeedName] = useState('');
  const [icalUrl, setIcalUrl] = useState('');
  const [icalText, setIcalText] = useState('');
  const [availabilityWindowDays, setAvailabilityWindowDays] = useState('90');
  const [manualPasteOpen, setManualPasteOpen] = useState(false);
  const [showWindowClosedBlocks, setShowWindowClosedBlocks] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshingFeedId, setRefreshingFeedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));

  const events = useMemo(
    () => feeds.flatMap((feed) => parseICalEvents(feed.text, feed)),
    [feeds],
  );
  const displayEvents = useMemo(
    () => showWindowClosedBlocks ? events : events.filter((event) => !event.availabilityWindowClosed),
    [events, showWindowClosedBlocks],
  );
  const hiddenWindowClosedCount = events.length - displayEvents.length;
  const sortedEvents = useMemo(() => [...displayEvents].sort((a, b) => a.start.getTime() - b.start.getTime()), [displayEvents]);
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
    const grouped = new Map<string, ICalEvent[]>();
    for (const event of sortedEvents) {
      for (const key of eventDateKeys(event)) {
        grouped.set(key, [...(grouped.get(key) ?? []), event]);
      }
    }
    return grouped;
  }, [sortedEvents]);

  async function addFeedFromUrl(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!icalUrl.trim()) {
      setError('Enter an iCal URL first.');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post<FetchICalCalendarResponse>('/ical-calendar/fetch', { url: icalUrl.trim() });
      addOrReplaceFeed({
        name: feedName.trim() || inferFeedName(response.data.url),
        url: response.data.url,
        text: response.data.content,
        availabilityWindowDays: parseAvailabilityWindowDays(availabilityWindowDays),
      });
      setFeedName('');
      setIcalUrl('');
    } catch (loadError) {
      setError(`${getApiErrorMessage(loadError)} You can still paste the raw .ics content below.`);
    } finally {
      setLoading(false);
    }
  }

  function addPastedFeed() {
    setError(null);
    if (!icalText.trim()) {
      setError('Paste iCal content first.');
      return;
    }
    addOrReplaceFeed({
      name: feedName.trim() || 'Pasted iCal feed',
      url: icalUrl.trim(),
      text: icalText,
      availabilityWindowDays: parseAvailabilityWindowDays(availabilityWindowDays),
    });
    setFeedName('');
    setIcalText('');
    setManualPasteOpen(false);
  }

  async function refreshFeed(feed: CalendarFeed) {
    if (!feed.url) {
      setError('This feed was pasted without a URL, so it cannot be refreshed.');
      return;
    }

    setError(null);
    setRefreshingFeedId(feed.id);
    try {
      const response = await api.post<FetchICalCalendarResponse>('/ical-calendar/fetch', { url: feed.url });
      updateFeeds(feeds.map((item) => (
        item.id === feed.id
          ? { ...item, url: response.data.url, text: response.data.content, importedAt: new Date().toISOString() }
          : item
      )));
    } catch (loadError) {
      setError(getApiErrorMessage(loadError));
    } finally {
      setRefreshingFeedId(null);
    }
  }

  function addOrReplaceFeed(input: { name: string; url: string; text: string; availabilityWindowDays: number | null }) {
    const parsed = parseICalEvents(input.text, {
      id: 'preview',
      name: input.name,
      color: feedColors[feeds.length % feedColors.length],
      availabilityWindowDays: input.availabilityWindowDays,
    });
    if (parsed.length === 0) {
      setError('No events were found in that iCal content.');
      return;
    }

    const existingIndex = input.url ? feeds.findIndex((feed) => feed.url === input.url) : -1;
    const nextFeed: CalendarFeed = {
      id: existingIndex >= 0 ? feeds[existingIndex].id : createFeedId(),
      name: input.name,
      url: input.url,
      text: input.text,
      color: existingIndex >= 0 ? feeds[existingIndex].color : feedColors[feeds.length % feedColors.length],
      importedAt: new Date().toISOString(),
      availabilityWindowDays: input.availabilityWindowDays,
    };
    const nextFeeds = existingIndex >= 0
      ? feeds.map((feed, index) => (index === existingIndex ? nextFeed : feed))
      : [...feeds, nextFeed];

    updateFeeds(nextFeeds);
    const firstUpcoming = parsed.find((event) => event.start >= startOfDay(new Date())) ?? parsed[0];
    if (firstUpcoming) {
      setSelectedDate(dateKey(firstUpcoming.start));
      setMonthCursor(startOfMonth(firstUpcoming.start));
    }
  }

  function removeFeed(feedId: string) {
    updateFeeds(feeds.filter((feed) => feed.id !== feedId));
  }

  function updateFeedAvailabilityWindow(feedId: string, value: string) {
    updateFeeds(feeds.map((feed) => (
      feed.id === feedId
        ? { ...feed, availabilityWindowDays: parseAvailabilityWindowDays(value) }
        : feed
    )));
  }

  function clearCalendar() {
    setFeedName('');
    setIcalUrl('');
    setIcalText('');
    setAvailabilityWindowDays('90');
    setManualPasteOpen(false);
    setError(null);
    updateFeeds([]);
  }

  function updateFeeds(nextFeeds: CalendarFeed[]) {
    setFeeds(nextFeeds);
    persistFeeds(nextFeeds);
  }

  return (
    <div className="-mx-5 lg:-mx-8 -my-6 lg:-my-8 flex min-h-screen flex-col">
      <div className="flex items-start justify-between gap-4 px-5 lg:px-8 pt-6 lg:pt-8 pb-4">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Calendar</p>
          <h1 className="text-[22px] font-black text-slate-900 tracking-tight leading-none">iCal Calendar</h1>
          <p className="text-[12px] text-slate-400 mt-1">
            Add Booking.com, Airbnb, or other OTA iCal feeds and view all imported blocks on one merged calendar.
          </p>
        </div>
        <ActionBtn onClick={clearCalendar} disabled={feeds.length === 0 && !icalUrl && !icalText}>Clear all</ActionBtn>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[22rem_minmax(0,1fr)] gap-4 px-5 lg:px-8 pb-6 lg:pb-8">
        <div className="space-y-4">
          <Panel className="p-4">
            <SectionHeading title="Add iCal feed" eyebrow="Source" />
            <form className="space-y-2.5" onSubmit={addFeedFromUrl}>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">Feed name</span>
                <input
                  value={feedName}
                  onChange={(event) => setFeedName(event.target.value)}
                  placeholder="Booking.com, Airbnb, Vrbo..."
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">iCal link</span>
                <input
                  value={icalUrl}
                  onChange={(event) => setIcalUrl(event.target.value)}
                  placeholder="https://example.com/calendar.ics"
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">Open availability window</span>
                <select
                  value={availabilityWindowDays}
                  onChange={(event) => setAvailabilityWindowDays(event.target.value)}
                  className={inputCls}
                >
                  <option value="">No limit</option>
                  <option value="30">30 days</option>
                  <option value="60">60 days</option>
                  <option value="90">90 days</option>
                  <option value="180">180 days</option>
                </select>
              </label>
              <ActionBtn type="submit" variant="primary" disabled={loading}>
                {loading ? 'Loading...' : 'Add feed'}
              </ActionBtn>
            </form>

            <div className="my-3 h-px bg-slate-100" />

            <button
              type="button"
              onClick={() => setManualPasteOpen((open) => !open)}
              className="text-xs font-bold text-slate-500 transition hover:text-slate-800"
            >
              {manualPasteOpen ? 'Hide manual .ics paste' : 'Paste .ics manually'}
            </button>

            {manualPasteOpen && (
              <div className="mt-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-600">Paste .ics content</span>
                  <textarea
                    value={icalText}
                    onChange={(event) => setIcalText(event.target.value)}
                    rows={5}
                    placeholder="BEGIN:VCALENDAR..."
                    className={`${inputCls} resize-y font-mono text-xs leading-relaxed`}
                  />
                </label>
                <div className="mt-3 flex flex-wrap gap-2">
                  <ActionBtn onClick={addPastedFeed}>Add pasted feed</ActionBtn>
                </div>
              </div>
            )}
          </Panel>

          {error && <ErrorMsg>{error}</ErrorMsg>}

          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Feeds" value={feeds.length} />
            <StatCard label="Visible events" value={displayEvents.length} sub={hiddenWindowClosedCount > 0 ? `${hiddenWindowClosedCount} window-closed hidden` : undefined} />
          </div>

          <Panel className="p-4">
            <SectionHeading title="Display" eyebrow="Calendar" />
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5">
              <span>
                <span className="block text-sm font-bold text-slate-800">Show closed-window dates</span>
                <span className="block text-xs font-medium text-slate-500">
                  Keep off to avoid filling future months after the feed availability window.
                </span>
              </span>
              <input
                type="checkbox"
                checked={showWindowClosedBlocks}
                onChange={(event) => setShowWindowClosedBlocks(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
            </label>
          </Panel>

          <Panel className="p-4">
            <SectionHeading title="Merged feeds" eyebrow="OTA calendars" />
            {feeds.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm font-medium text-slate-400">
                Add Booking.com or another OTA iCal link to start.
              </p>
            ) : (
              <div className="space-y-2">
                {feeds.map((feed) => {
                  const feedEventCount = parseICalEvents(feed.text, feed).length;
                  return (
                    <div key={feed.id} className="rounded-lg border border-slate-100 bg-slate-50/60 p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold ${feedSwatches[feed.color]}`}>
                            {feed.name}
                          </span>
                          <p className="mt-1.5 truncate text-xs font-medium text-slate-500">{feed.url || 'Pasted feed'}</p>
                          <p className="mt-0.5 text-[11px] font-semibold text-slate-400">
                            {feedEventCount} events · {formatAvailabilityWindow(feed.availabilityWindowDays)} · Imported {new Date(feed.importedAt).toLocaleString()}
                          </p>
                          <label className="mt-2 block max-w-[11rem]">
                            <span className="sr-only">Availability window</span>
                            <select
                              value={feed.availabilityWindowDays ?? ''}
                              onChange={(event) => updateFeedAvailabilityWindow(feed.id, event.target.value)}
                              className="h-7 w-full rounded-md border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-600 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/15"
                            >
                              <option value="">No limit</option>
                              <option value="30">30 days</option>
                              <option value="60">60 days</option>
                              <option value="90">90 days</option>
                              <option value="180">180 days</option>
                            </select>
                          </label>
                        </div>
                        <div className="flex flex-shrink-0 flex-col gap-1 sm:flex-row xl:flex-col">
                          <ActionBtn size="sm" onClick={() => refreshFeed(feed)} disabled={!feed.url || refreshingFeedId === feed.id}>
                            {refreshingFeedId === feed.id ? 'Refreshing' : 'Refresh'}
                          </ActionBtn>
                          <ActionBtn size="sm" variant="danger" onClick={() => removeFeed(feed.id)}>Remove</ActionBtn>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

         
        </div>

        <div className="space-y-4 min-w-0">
          <Panel className="p-4">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <SectionHeading title={formatMonth(monthCursor)} eyebrow="Merged month view" />
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
                      active ? 'bg-emerald-50 ring-1 ring-inset ring-emerald-200' : 'bg-white hover:bg-slate-50',
                      isCurrentMonth ? 'text-slate-800' : 'text-slate-300',
                    ].join(' ')}
                  >
                    <span className="absolute left-3 top-3 text-xs font-bold leading-none">{cell.date.getDate()}</span>
                    {dayEvents[0] && (
                      <span className={[
                        'absolute right-2 top-2 inline-flex max-w-[68%] truncate rounded-full px-2 py-0.5 text-[10px] font-bold leading-tight text-white',
                        dayEvents[0].availabilityWindowClosed ? 'bg-amber-500' : 'bg-emerald-600',
                      ].join(' ')}>
                        {dayEvents[0].availabilityWindowClosed ? 'Availability closed' : 'Booked'}
                      </span>
                    )}
                    <div className="absolute left-3 right-3 top-10 space-y-1">
                      {dayEvents.slice(0, 3).map((event) => (
                        <span
                          key={`${event.feedId}-${event.uid}`}
                          className="block"
                        >
                          <span className={`inline-flex max-w-full truncate rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide leading-tight shadow-sm ${getProviderPillClass(event.feedName)}`}>
                            {event.feedName}
                          </span>
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
            <EventList title={`Events on ${formatDateLabel(selectedDate)}`} events={visibleEvents} empty="No events on this date." />
            <EventList title="Upcoming events" events={upcomingEvents} empty="No upcoming events loaded." />
          </div>
        </div>
      </div>
    </div>
  );
}

function EventList({ title, events, empty }: { title: string; events: ICalEvent[]; empty: string }) {
  return (
    <Panel className="min-h-[16rem] p-4">
      <SectionHeading title={title} />
      {events.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm font-medium text-slate-400">{empty}</p>
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <div key={`${event.feedId}-${event.uid}`} className="rounded-lg border border-slate-100 bg-slate-50/60 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className={`inline-flex rounded-md border px-2.5 py-1 text-[11px] font-bold ${feedSwatches[event.color]}`}>
                      {event.feedName}
                    </span>
                  </div>
                  {shouldShowEventTitle(event) && (
                    <p className="truncate text-[15px] font-bold text-slate-900">{getEventTitle(event)}</p>
                  )}
                  {event.availabilityWindowClosed && (
                    <p className="text-sm font-bold text-amber-700">Availability window closed</p>
                  )}
                  <p className="mt-2 text-sm font-semibold text-slate-500">{formatEventTime(event)}</p>
                </div>
                <span className="flex-shrink-0 rounded-lg bg-cyan-50 px-3 py-1.5 text-[12px] font-bold text-cyan-700 ring-1 ring-cyan-200">
                  Nights: {getEventNightCount(event)}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                <EventDetail label="Start" value={formatDateTime(event.start, event.allDay)} />
                <EventDetail label="End" value={event.end ? formatDateTime(event.end, event.allDay) : 'Not provided'} />
              </div>
              {event.location && (
                <div className="mt-3">
                  <EventDetail label="Location" value={event.location} />
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

function EventDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-slate-100 bg-white px-3.5 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-2 break-words text-sm font-semibold text-slate-700">{value}</p>
    </div>
  );
}

function parseICalEvents(input: string, feed: Pick<CalendarFeed, 'id' | 'name' | 'color' | 'availabilityWindowDays'>): ICalEvent[] {
  if (!input.trim()) return [];
  const lines = unfoldICalLines(input);
  const events: ICalEvent[] = [];
  let current: Record<string, string> | null = null;
  let index = 0;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current) {
        const parsed = eventFromFields(current, index, feed);
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

function eventFromFields(fields: Record<string, string>, index: number, feed: Pick<CalendarFeed, 'id' | 'name' | 'color' | 'availabilityWindowDays'>): ICalEvent | null {
  const start = parseICalDate(fields.DTSTART, fields.DTSTART__RAW);
  if (!start) return null;
  const end = parseICalDate(fields.DTEND, fields.DTEND__RAW);
  const title = unescapeICalText(fields.SUMMARY) || 'Untitled event';
  return {
    uid: unescapeICalText(fields.UID) || `ical-event-${index}-${start.date.getTime()}`,
    title,
    start: start.date,
    end: end?.date ?? null,
    allDay: start.allDay,
    location: unescapeICalText(fields.LOCATION),
    description: unescapeICalText(fields.DESCRIPTION),
    feedId: feed.id,
    feedName: feed.name,
    color: feed.color,
    availabilityWindowClosed: isAvailabilityWindowClosedEvent(title, unescapeICalText(fields.DESCRIPTION), start.date, feed.availabilityWindowDays),
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

function isAvailabilityWindowClosedEvent(title: string, description: string, start: Date, availabilityWindowDays: number | null) {
  if (availabilityWindowDays == null) return false;
  if (!isGenericUnavailableTitle(title, description)) return false;

  const cutoff = addDays(startOfDay(new Date()), availabilityWindowDays);
  return startOfDay(start).getTime() >= cutoff.getTime();
}

function isGenericUnavailableTitle(title: string, description: string) {
  const normalizedTitle = normalizeEventText(title);
  const normalizedDescription = normalizeEventText(description);
  const genericUnavailableTitles = new Set([
    'not available',
    'unavailable',
    'blocked',
    'closed',
    'calendar blocked',
  ]);

  if (genericUnavailableTitles.has(normalizedTitle)) return true;
  return (
    normalizedTitle.includes('not available') &&
    !normalizedTitle.includes('reservation') &&
    !normalizedDescription.includes('reservation')
  );
}

function normalizeEventText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function readPersistedFeeds(): CalendarFeed[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(ICAL_STATE_KEY) ?? '[]') as Array<Partial<CalendarFeed>>;
    if (Array.isArray(parsed)) {
      return parsed
        .filter((feed) => Boolean(
          feed.id &&
          feed.name &&
          feed.text &&
          feed.importedAt &&
          feed.color &&
          feedColors.includes(feed.color),
        ))
        .map((feed) => ({
          id: String(feed.id),
          name: String(feed.name),
          url: feed.url ? String(feed.url) : '',
          text: String(feed.text),
          color: feed.color as FeedColor,
          importedAt: String(feed.importedAt),
          availabilityWindowDays: typeof feed.availabilityWindowDays === 'number' ? feed.availabilityWindowDays : null,
        }));
    }
  } catch {
    // Fall through to legacy state migration.
  }

  try {
    const legacy = JSON.parse(localStorage.getItem(legacyStateKey) ?? '{}') as { url?: string; text?: string };
    if (legacy.text) {
      return [{
        id: createFeedId(),
        name: legacy.url ? inferFeedName(legacy.url) : 'Imported iCal feed',
        url: legacy.url ?? '',
        text: legacy.text,
        color: 'emerald' as FeedColor,
        importedAt: new Date().toISOString(),
        availabilityWindowDays: 90,
      }];
    }
  } catch {
    return [];
  }

  return [];
}

function persistFeeds(feeds: CalendarFeed[]) {
  localStorage.setItem(ICAL_STATE_KEY, JSON.stringify(feeds));
}

function createFeedId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `feed_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function inferFeedName(url: string) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    if (hostname.includes('booking')) return 'Booking.com';
    if (hostname.includes('airbnb')) return 'Airbnb';
    if (hostname.includes('vrbo')) return 'Vrbo';
    return hostname;
  } catch {
    return 'iCal feed';
  }
}

function parseAvailabilityWindowDays(value: string) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatAvailabilityWindow(days: number | null) {
  return days == null ? 'No window limit' : `${days}-day window`;
}

function getEventTitle(event: ICalEvent) {
  if (event.availabilityWindowClosed) return 'Availability closed';
  if (isGenericUnavailableTitle(event.title, event.description)) return 'Not available';
  return event.title;
}

function getProviderPillClass(feedName: string) {
  const normalized = feedName.toLowerCase();
  if (normalized.includes('airbnb')) return 'border-[#ff5a5f]/25 bg-[#ff5a5f] text-white';
  if (normalized.includes('booking')) return 'border-[#003b95]/20 bg-[#003b95] text-white';
  if (normalized.includes('vrbo')) return 'border-[#245abc]/20 bg-[#245abc] text-white';
  if (normalized.includes('makemytrip') || normalized.includes('make my trip') || normalized.includes('mmt') || normalized.includes('goibibo')) {
    return 'border-[#e31e24]/25 bg-[#e31e24] text-white';
  }
  return 'border-slate-200 bg-white text-slate-600';
}

function shouldShowEventTitle(event: ICalEvent) {
  return !isGenericUnavailableTitle(event.title, event.description);
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

function eventCoversDate(event: ICalEvent, key: string) {
  return eventDateKeys(event).includes(key);
}

function eventDateKeys(event: ICalEvent) {
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

function getInclusiveEventEndDate(event: ICalEvent) {
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

function getEventNightCount(event: ICalEvent) {
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

function formatEventTime(event: ICalEvent) {
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
