import { FormEvent, useMemo, useState } from 'react';
import { ActionBtn, ErrorMsg, Panel, SectionHeading, StatCard, inputCls } from './ui';

type EmailReservation = {
  id: string;
  provider: string;
  reservationId: string;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  checkIn: string | null;
  checkOut: string | null;
  nights: number | null;
  amount: string | null;
  status: string;
  parsedAt: string;
};

const EMAIL_INGESTION_STATE_KEY = 'hms_ota_email_ingestion_reservations';
const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function OtaEmailIngestionPage() {
  const restored = useMemo(() => readPersistedReservations(), []);
  const [reservations, setReservations] = useState<EmailReservation[]>(restored);
  const [emailText, setEmailText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(new Date()));

  const parsedPreview = useMemo(() => parseReservationEmail(emailText), [emailText]);
  const calendarReservations = useMemo(
    () => reservations.filter((reservation) => reservation.checkIn && reservation.checkOut),
    [reservations],
  );
  const reservationsByDate = useMemo(() => {
    const grouped = new Map<string, EmailReservation[]>();
    for (const reservation of calendarReservations) {
      for (const key of reservationDateKeys(reservation)) {
        grouped.set(key, [...(grouped.get(key) ?? []), reservation]);
      }
    }
    return grouped;
  }, [calendarReservations]);
  const selectedReservations = reservationsByDate.get(selectedDate) ?? [];
  const monthCells = useMemo(() => buildMonthCells(monthCursor), [monthCursor]);

  function ingestEmail(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!emailText.trim()) {
      setError('Paste an OTA reservation email first.');
      return;
    }

    const parsed = parseReservationEmail(emailText);
    if (!parsed.reservationId && !parsed.checkIn && !parsed.checkOut && !parsed.guestName) {
      setError('Could not detect reservation details in this email. Try pasting the full email body.');
      return;
    }

    const nextReservation: EmailReservation = {
      id: createReservationId(),
      provider: parsed.provider,
      reservationId: parsed.reservationId || `EMAIL-${Date.now()}`,
      guestName: parsed.guestName,
      guestEmail: parsed.guestEmail,
      guestPhone: parsed.guestPhone,
      checkIn: parsed.checkIn,
      checkOut: parsed.checkOut,
      nights: parsed.nights,
      amount: parsed.amount,
      status: parsed.status,
      parsedAt: new Date().toISOString(),
    };

    const nextReservations = [
      nextReservation,
      ...reservations.filter((reservation) => reservation.reservationId !== nextReservation.reservationId),
    ];
    updateReservations(nextReservations);
    if (nextReservation.checkIn) {
      setSelectedDate(nextReservation.checkIn);
      setMonthCursor(startOfMonth(dateFromKey(nextReservation.checkIn)));
    }
    setEmailText('');
  }

  function removeReservation(id: string) {
    updateReservations(reservations.filter((reservation) => reservation.id !== id));
  }

  function clearReservations() {
    updateReservations([]);
  }

  function updateReservations(nextReservations: EmailReservation[]) {
    setReservations(nextReservations);
    localStorage.setItem(EMAIL_INGESTION_STATE_KEY, JSON.stringify(nextReservations));
  }

  return (
    <div className="-mx-5 lg:-mx-8 -my-6 lg:-my-8 flex min-h-screen flex-col">
      <div className="flex items-start justify-between gap-4 px-5 lg:px-8 pt-6 lg:pt-8 pb-4">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Commercial</p>
          <h1 className="text-[22px] font-black text-slate-900 tracking-tight leading-none">OTA Email Ingestion</h1>
          <p className="text-[12px] text-slate-400 mt-1">Paste OTA reservation emails, parse guest details, and review email-derived stays.</p>
        </div>
        <ActionBtn onClick={clearReservations} disabled={reservations.length === 0}>Clear all</ActionBtn>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[24rem_minmax(0,1fr)] gap-4 px-5 lg:px-8 pb-6 lg:pb-8">
        <div className="space-y-4">
          <Panel className="p-4">
            <SectionHeading title="Paste reservation email" eyebrow="Inbox parser" />
            <form className="space-y-3" onSubmit={ingestEmail}>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-600">Email body</span>
                <textarea
                  value={emailText}
                  onChange={(event) => setEmailText(event.target.value)}
                  rows={12}
                  placeholder="Paste Booking.com, Airbnb, MakeMyTrip, or other OTA reservation email content..."
                  className={`${inputCls} resize-y text-xs leading-relaxed`}
                />
              </label>
              <ActionBtn type="submit" variant="primary">Parse & save</ActionBtn>
            </form>
          </Panel>

          {error && <ErrorMsg>{error}</ErrorMsg>}

          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Parsed" value={reservations.length} />
            <StatCard label="With guest" value={reservations.filter((reservation) => reservation.guestName).length} />
            <StatCard label="With phone" value={reservations.filter((reservation) => reservation.guestPhone).length} />
          </div>

          <Panel className="p-4">
            <SectionHeading title="Detected preview" eyebrow="Current paste" />
            <div className="space-y-2">
              <Detail label="Provider" value={parsedPreview.provider} />
              <Detail label="Reservation" value={parsedPreview.reservationId || 'Not detected'} />
              <Detail label="Guest" value={parsedPreview.guestName || 'Not detected'} />
              <Detail label="Email" value={parsedPreview.guestEmail || 'Not detected'} />
              <Detail label="Phone" value={parsedPreview.guestPhone || 'Not detected'} />
              <Detail label="Dates" value={parsedPreview.checkIn && parsedPreview.checkOut ? `${parsedPreview.checkIn} to ${parsedPreview.checkOut}` : 'Not detected'} />
              <Detail label="Amount" value={parsedPreview.amount || 'Not detected'} />
            </div>
          </Panel>
        </div>

        <div className="space-y-4 min-w-0">
          <Panel className="p-4">
            <SectionHeading title="Email reservation calendar" eyebrow="Parsed stays" />
            <div className="mb-3 flex justify-end gap-2">
              <ActionBtn size="sm" onClick={() => setMonthCursor(addMonths(monthCursor, -1))}>Previous</ActionBtn>
              <ActionBtn size="sm" onClick={() => setMonthCursor(startOfMonth(new Date()))}>Today</ActionBtn>
              <ActionBtn size="sm" onClick={() => setMonthCursor(addMonths(monthCursor, 1))}>Next</ActionBtn>
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
                const dayReservations = reservationsByDate.get(key) ?? [];
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
                    {dayReservations[0] && (
                      <span className="absolute right-2 top-2 inline-flex max-w-[68%] truncate rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold leading-tight text-white">
                        Email
                      </span>
                    )}
                    <div className="absolute left-3 right-3 top-10 space-y-1">
                      {dayReservations.slice(0, 3).map((reservation) => (
                        <span key={reservation.id} className={`block truncate rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide leading-tight text-white ${providerPillClass(reservation.provider)}`}>
                          {reservation.provider}
                        </span>
                      ))}
                      {dayReservations.length > 3 && (
                        <span className="block text-[10px] font-semibold text-slate-400">+{dayReservations.length - 3} more</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel className="p-4">
            <SectionHeading title={`Reservations on ${formatDateLabel(selectedDate)}`} eyebrow="Email details" />
            {selectedReservations.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm font-medium text-slate-400">No parsed email reservations on this date.</p>
            ) : (
              <div className="space-y-3">
                {selectedReservations.map((reservation) => (
                  <ReservationCard key={reservation.id} reservation={reservation} onRemove={() => removeReservation(reservation.id)} />
                ))}
              </div>
            )}
          </Panel>

          <Panel className="p-4">
            <SectionHeading title="Parsed reservations" eyebrow={`${reservations.length} saved`} />
            {reservations.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-sm font-medium text-slate-400">No email reservations parsed yet.</p>
            ) : (
              <div className="space-y-3">
                {reservations.slice(0, 12).map((reservation) => (
                  <ReservationCard key={reservation.id} reservation={reservation} onRemove={() => removeReservation(reservation.id)} />
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function ReservationCard({ reservation, onRemove }: { reservation: EmailReservation; onRemove: () => void }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white ${providerPillClass(reservation.provider)}`}>
              {reservation.provider}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">
              {reservation.status}
            </span>
          </div>
          <h3 className="mt-3 text-sm font-bold text-slate-900">{reservation.guestName || 'Guest not detected'}</h3>
          <p className="mt-1 text-xs font-semibold text-slate-500">{reservation.reservationId}</p>
        </div>
        <ActionBtn size="sm" variant="danger" onClick={onRemove}>Remove</ActionBtn>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
        <Detail label="Check-in" value={reservation.checkIn || 'Not detected'} />
        <Detail label="Check-out" value={reservation.checkOut || 'Not detected'} />
        <Detail label="Nights" value={reservation.nights != null ? String(reservation.nights) : 'Not detected'} />
        <Detail label="Email" value={reservation.guestEmail || 'Not detected'} />
        <Detail label="Phone" value={reservation.guestPhone || 'Not detected'} />
        <Detail label="Amount" value={reservation.amount || 'Not detected'} />
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-slate-100 bg-white px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 truncate text-xs font-semibold text-slate-700">{value}</p>
    </div>
  );
}

function parseReservationEmail(text: string) {
  const normalized = text.replace(/\r/g, '');
  const provider = inferProvider(normalized);
  const guestEmail = normalized.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null;
  const guestPhone = extractPhone(normalized);
  const checkIn = extractDate(normalized, ['check-in', 'check in', 'arrival', 'arrives']);
  const checkOut = extractDate(normalized, ['check-out', 'check out', 'departure', 'departs']);
  const nights = checkIn && checkOut ? diffNights(checkIn, checkOut) : extractNights(normalized);

  return {
    provider,
    reservationId: extractReservationId(normalized),
    guestName: extractGuestName(normalized),
    guestEmail,
    guestPhone,
    checkIn,
    checkOut,
    nights,
    amount: extractAmount(normalized),
    status: inferStatus(normalized),
  };
}

function inferProvider(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes('airbnb')) return 'Airbnb';
  if (lower.includes('booking.com')) return 'Booking.com';
  if (lower.includes('makemytrip') || lower.includes('make my trip') || lower.includes('mmt')) return 'MakeMyTrip';
  if (lower.includes('goibibo')) return 'Goibibo';
  if (lower.includes('vrbo')) return 'Vrbo';
  return 'OTA Email';
}

function extractReservationId(text: string) {
  const patterns = [
    /(?:reservation|booking|confirmation)\s*(?:number|no\.?|id|code|reference)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{4,})/i,
    /(?:booking id|reservation id|confirmation code)\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{4,})/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return '';
}

function extractGuestName(text: string) {
  const patterns = [
    /(?:guest name|guest|primary guest|booked by|customer name)\s*[:#-]\s*([^\n]+)/i,
    /(?:name)\s*[:#-]\s*([A-Z][^\n]+)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return cleanLine(match[1]);
  }
  return null;
}

function extractPhone(text: string) {
  const labelled = text.match(/(?:phone|mobile|tel|contact)\s*[:#-]\s*([+()\d][+()\d\s.-]{7,})/i)?.[1];
  const fallback = text.match(/(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,5}\)?[\s.-]?)?\d{6,10}/)?.[0];
  return labelled ? cleanLine(labelled) : fallback ? cleanLine(fallback) : null;
}

function extractDate(text: string, labels: string[]) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = text.match(new RegExp(`${escaped}\\s*[:#-]?\\s*([^\\n]+)`, 'i'));
    const parsed = match?.[1] ? parseLooseDate(match[1]) : null;
    if (parsed) return parsed;
  }
  return null;
}

function parseLooseDate(value: string) {
  const cleaned = value.replace(/\bat\b.*$/i, '').replace(/\(.+?\)/g, '').trim();
  const iso = cleaned.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (iso) return iso;
  const slash = cleaned.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]);
    const year = Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3]);
    return toDateKey(year, month, day);
  }
  const parsed = new Date(cleaned);
  if (!Number.isNaN(parsed.getTime())) return dateKey(parsed);
  return null;
}

function extractNights(text: string) {
  const match = text.match(/(\d+)\s*night/i);
  return match?.[1] ? Number(match[1]) : null;
}

function extractAmount(text: string) {
  const match = text.match(/(?:total|amount|price|payout|payment)\s*[:#-]?\s*([A-Z]{3}\s*)?[₹$€£]?\s?[\d,]+(?:\.\d{2})?/i);
  return match?.[0] ? cleanLine(match[0]) : null;
}

function inferStatus(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes('cancelled') || lower.includes('canceled')) return 'CANCELLED';
  if (lower.includes('modified') || lower.includes('updated')) return 'MODIFIED';
  return 'BOOKED';
}

function cleanLine(value: string) {
  return value.replace(/\s+/g, ' ').trim().replace(/[|,;]+$/, '');
}

function providerPillClass(provider: string) {
  const normalized = provider.toLowerCase();
  if (normalized.includes('airbnb')) return 'bg-[#ff5a5f]';
  if (normalized.includes('booking')) return 'bg-[#003b95]';
  if (normalized.includes('makemytrip') || normalized.includes('goibibo')) return 'bg-[#e31e24]';
  if (normalized.includes('vrbo')) return 'bg-[#245abc]';
  return 'bg-slate-600';
}

function createReservationId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `email_reservation_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function readPersistedReservations(): EmailReservation[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(EMAIL_INGESTION_STATE_KEY) ?? '[]') as Array<Partial<EmailReservation>>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((reservation) => reservation.id && reservation.provider && reservation.reservationId)
      .map((reservation) => ({
        id: String(reservation.id),
        provider: String(reservation.provider),
        reservationId: String(reservation.reservationId),
        guestName: reservation.guestName ? String(reservation.guestName) : null,
        guestEmail: reservation.guestEmail ? String(reservation.guestEmail) : null,
        guestPhone: reservation.guestPhone ? String(reservation.guestPhone) : null,
        checkIn: reservation.checkIn ? String(reservation.checkIn) : null,
        checkOut: reservation.checkOut ? String(reservation.checkOut) : null,
        nights: typeof reservation.nights === 'number' ? reservation.nights : null,
        amount: reservation.amount ? String(reservation.amount) : null,
        status: reservation.status ? String(reservation.status) : 'BOOKED',
        parsedAt: reservation.parsedAt ? String(reservation.parsedAt) : new Date().toISOString(),
      }));
  } catch {
    return [];
  }
}

function buildMonthCells(month: Date) {
  const first = startOfMonth(month);
  const gridStart = addDays(first, -first.getDay());
  return Array.from({ length: 42 }, (_, index) => ({ date: addDays(gridStart, index) }));
}

function reservationDateKeys(reservation: EmailReservation) {
  if (!reservation.checkIn || !reservation.checkOut) return [];
  const start = dateFromKey(reservation.checkIn);
  const end = addDays(dateFromKey(reservation.checkOut), -1);
  const keys: string[] = [];
  let cursor = start;
  while (cursor.getTime() <= end.getTime()) {
    keys.push(dateKey(cursor));
    cursor = addDays(cursor, 1);
  }
  return keys;
}

function diffNights(checkIn: string, checkOut: string) {
  return Math.max(1, Math.round((dateFromKey(checkOut).getTime() - dateFromKey(checkIn).getTime()) / 86_400_000));
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

function dateFromKey(key: string) {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function dateKey(date: Date) {
  return toDateKey(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function toDateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatDateLabel(key: string) {
  return dateFromKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
