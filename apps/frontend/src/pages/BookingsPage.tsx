import { type Dispatch, type FormEvent, Fragment, type SetStateAction, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { api, getApiErrorMessage } from '../api/client';
import { fetchAllPages, PaginatedResponse } from '../api/pagination';
import { AvailabilitySummary, BookingStatus, PaymentProvider, Property, RatePlan, ReservationGroup, Room, RoomCategory } from '../api/types';
import { CalendarDatePickerField, InlineCalendarDatePicker } from '../components/CalendarDatePicker';
import { CustomSelect } from '../components/CustomSelect';
import { Spinner } from '../components/Spinner';
import { TimePolicyPicker } from '../components/TimePolicyPicker';
import { useAsync } from '../hooks/useAsync';
import { capitalizeFirstLetter, formatCurrency } from '../utils/format';
import {
  ErrorMsg,
  FloatingSuccessToast,
  LoadingMsg,
  StatusBadge,
  StatCard,
  TableCard,
  Th,
  Td,
  inputCls,
  labelCls,
  linkBtn,
  primaryBtn,
  secondaryBtn,
} from './ui';
import { createPreviewData, isPreviewId } from './previewData';

/* ─── Local types ─────────────────────────────────────── */
type DisplayGroup = ReservationGroup & { duplicate_reservation_ids?: string[]; duplicate_count?: number };
type DirectReservationFormState = {
  property_id: string;
  room_category_id: string;
  rate_plan_id: string;
  check_in_date: string;
  check_out_date: string;
  check_in_time: string;
  check_out_time: string;
  room_count: string;
  adults: string;
  children: string;
  guest_name: string;
  guest_phone: string;
  guest_email: string;
  guest_id_proof_type: string;
  guest_id_proof_number: string;
  guest_address: string;
  advance_amount: string;
  advance_payment_provider: PaymentProvider;
  advance_payment_reference: string;
  remarks: string;
};
type DirectReservationFieldErrors = Partial<Record<keyof DirectReservationFormState, string>>;

/* ─── Tape-chart helpers ─────────────────────────────── */
function getTodayDate() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function createDirectReservationForm(today = getTodayDate(), property?: Pick<Property, 'id' | 'default_check_in_time' | 'default_check_out_time'> | null): DirectReservationFormState {
  return {
    property_id: property?.id ?? '',
    room_category_id: '',
    rate_plan_id: '',
    check_in_date: today,
    check_out_date: addDays(today, 1),
    check_in_time: property?.default_check_in_time ?? '12:00',
    check_out_time: property?.default_check_out_time ?? '11:00',
    room_count: '1',
    adults: '1',
    children: '0',
    guest_name: '',
    guest_phone: '',
    guest_email: '',
    guest_id_proof_type: '',
    guest_id_proof_number: '',
    guest_address: '',
    advance_amount: '',
    advance_payment_provider: 'CASH',
    advance_payment_reference: '',
    remarks: '',
  };
}
function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function diffDays(a: string, b: string) {
  return Math.max(0, Math.round((new Date(`${b}T00:00:00.000Z`).getTime() - new Date(`${a}T00:00:00.000Z`).getTime()) / 86400000));
}
function fmtShort(d: string) {
  return new Date(`${d}T00:00:00.000Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function fmtLong(d: string) {
  return new Date(`${d}T00:00:00.000Z`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
function dayNum(d: string) { return new Date(`${d}T00:00:00.000Z`).getUTCDate(); }
function dayOfWeek(d: string) { return new Date(`${d}T00:00:00.000Z`).toLocaleDateString(undefined, { weekday: 'short' }); }
function isWeekend(d: string) { const w = new Date(`${d}T00:00:00.000Z`).getUTCDay(); return w === 0 || w === 6; }
function calculateNights(a: string, b: string) {
  if (!a || !b) return 0;
  const d = diffDays(a, b);
  return d > 0 ? d : 0;
}
function formatDateTime(v: string) { return new Date(v).toLocaleString(); }
function formatProviderStatus(s: string | null | undefined) {
  const n = s?.trim().toLowerCase();
  if (!n) return 'Provider status unavailable';
  if (n === '1' || n === 'booked' || n === 'confirmed') return 'Booked';
  if (n === '2' || n === 'modified' || n === 'updated') return 'Modified';
  if (n === '3' || n === 'cancelled' || n === 'canceled') return 'Cancelled';
  return s ?? 'Provider status unavailable';
}
function isValidGuestEmail(value: string) {
  if (!value) return true;
  const normalized = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalized)) return false;
  const tld = normalized.split('.').pop();
  if (!tld) return false;
  return !['cpm', 'con', 'comm', 'coom', 'ocm'].includes(tld);
}
function isValidGuestPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15 && /^[+\d][\d\s().-]*$/.test(value);
}
function isValidTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
function clampRoomCountInput(value: string, maxAvailableRooms: number | null) {
  if (!value) return '';
  const normalized = value.replace(/\D/g, '');
  if (!normalized) return '';
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 1) return '';
  if (maxAvailableRooms != null) return String(Math.min(parsed, maxAvailableRooms));
  return String(Math.min(parsed, 20));
}
function formatGuestCount(adults?: number | null, children?: number | null) {
  if (adults == null && children == null) return 'Guest count not set';
  const adultCount = adults ?? 1;
  const childCount = children ?? 0;
  const adultLabel = `${adultCount} adult${adultCount === 1 ? '' : 's'}`;
  if (childCount <= 0) return adultLabel;
  return `${adultLabel} · ${childCount} child${childCount === 1 ? '' : 'ren'}`;
}
function formatIdProof(type: string, number: string) {
  return `${type.trim()}: ${number.trim()}`;
}
const idProofOptions = [
  { label: 'Aadhaar Card', value: 'Aadhaar Card' },
  { label: 'Driver License', value: 'Driver License' },
  { label: 'Passport', value: 'Passport' },
];
const advancePaymentProviderOptions: Array<{ label: string; value: PaymentProvider }> = [
  { label: 'Cash', value: 'CASH' },
  { label: 'Card', value: 'CARD' },
  { label: 'UPI', value: 'UPI' },
];
function firstDirectReservationError(errors: DirectReservationFieldErrors) {
  return Object.values(errors).find(Boolean) ?? 'Fix the highlighted fields and try again.';
}
function getGuestInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'RG';
}
function getGroupStayWindow(group: ReservationGroup) {
  const arrivals = group.rooms.map((room) => room.arrival_date).sort();
  const departures = group.rooms.map((room) => room.departure_date).sort();

  return {
    arrival: group.arrival_date ?? arrivals[0] ?? null,
    departure: group.departure_date ?? departures[departures.length - 1] ?? null,
  };
}
function directReservationFormFromGroup(group: ReservationGroup, fallbackDate = getTodayDate()): DirectReservationFormState {
  const firstRoom = group.rooms[0];
  const idProof = group.primary_guest?.id_proof ?? '';
  const [idProofType = '', ...idProofRest] = idProof.split(':');
  return {
    property_id: group.property_id,
    room_category_id: firstRoom?.room_category.id ?? '',
    rate_plan_id: firstRoom?.rate_plan.id ?? '',
    check_in_date: group.arrival_date ?? firstRoom?.arrival_date ?? fallbackDate,
    check_out_date: group.departure_date ?? firstRoom?.departure_date ?? addDays(fallbackDate, 1),
    check_in_time: '12:00',
    check_out_time: '11:00',
    room_count: String(group.rooms.length || 1),
    adults: String(firstRoom?.adults ?? 1),
    children: String(firstRoom?.children ?? 0),
    guest_name: group.primary_guest?.name ?? firstRoom?.guest_name ?? '',
    guest_phone: group.primary_guest?.phone ?? '',
    guest_email: group.primary_guest?.email ?? '',
    guest_id_proof_type: idProofType.trim(),
    guest_id_proof_number: idProofRest.join(':').trim(),
    guest_address: group.primary_guest?.address ?? '',
    advance_amount: '',
    advance_payment_provider: 'CASH',
    advance_payment_reference: '',
    remarks: group.remarks ?? '',
  };
}

function getTimelineStayWindow(room: ReservationGroup['rooms'][number]) {
  const start = room.arrival_date;
  const end = room.departure_date > start ? room.departure_date : addDays(start, 1);
  return { start, end };
}

/* ─── Status colours ─────────────────────────────────── */
const STATUS_BAR: Record<string, string> = {
  BOOKED:      'bg-cyan-600 text-white',
  CHECKED_IN:  'bg-emerald-600 text-white',
  CHECKED_OUT: 'bg-slate-200 text-slate-400',
  CANCELLED:   'bg-rose-200 text-rose-500',
};
const STATUS_DOT: Record<string, string> = {
  BOOKED: 'bg-cyan-500', CHECKED_IN: 'bg-emerald-500',
  CHECKED_OUT: 'bg-slate-300', CANCELLED: 'bg-rose-400',
};
const STATUS_SURFACE: Record<BookingStatus, { soft: string }> = {
  BOOKED: { soft: 'bg-slate-50/80' },
  CHECKED_IN: { soft: 'bg-slate-50/80' },
  CHECKED_OUT: { soft: 'bg-slate-50/80' },
  CANCELLED: { soft: 'bg-slate-50/80' },
};
const STATUS_LABEL: Record<string, string> = {
  BOOKED: 'Booked', CHECKED_IN: 'Checked in', CHECKED_OUT: 'Checked out', CANCELLED: 'Cancelled',
};

const COL_W = 80;
const ROW_H = 64;
const SIDEBAR_W = 240;
const WINDOW_DAYS = 30;
const TIMELINE_LOADER_DELAY_MS = 350;

/* ─── Calendar rows from physical rooms ── */
type PhysRoomRow = {
  roomKey: string;
  roomNum: string;
  category: string;
  propertyName: string;
  propertyId: string;
};

type TimelineBarInfo = {
  group: ReservationGroup;
  room: ReservationGroup['rooms'][number];
  status: BookingStatus;
};

type UnassignedTimelineRow = {
  rowKey: string;
  propertyId: string;
  propertyName: string;
  category: string;
  laneIndex: number;
  stays: TimelineBarInfo[];
};

function buildRoomRows(rooms: Room[], propertyId: string): PhysRoomRow[] {
  return rooms
    .filter(r => propertyId === 'ALL' || r.property.id === propertyId)
    .map(r => ({
      roomKey: `${r.property.id}::${r.room_number}::${r.room_category.name}`,
      roomNum: r.room_number,
      category: r.room_category.name,
      propertyName: r.property.name,
      propertyId: r.property.id,
    }));
}

function sortRoomRows(rows: PhysRoomRow[]) {
  return rows
    .sort((a, b) => {
      if (a.propertyName !== b.propertyName) return a.propertyName.localeCompare(b.propertyName);
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      return parseInt(a.roomNum, 10) - parseInt(b.roomNum, 10);
    });
}

function buildUnassignedTimelineRows(groups: ReservationGroup[], propertyId: string, days: string[]) {
  const windowStart = days[0];
  const windowEnd = addDays(days[days.length - 1] ?? windowStart, 1);
  const grouped = new Map<string, TimelineBarInfo[]>();

  for (const group of groups) {
    if (propertyId !== 'ALL' && group.property.id !== propertyId) continue;
    for (const room of group.rooms) {
      if (room.room.room_number) continue;
      if (room.reservation_status === 'CANCELLED' || room.reservation_status === 'CHECKED_OUT') continue;
      const stayWindow = getTimelineStayWindow(room);
      if (stayWindow.end <= windowStart || stayWindow.start >= windowEnd) continue;

      const key = `${group.property.id}::${room.room_category.name}`;
      const stay = { group, room, status: room.reservation_status as BookingStatus };
      const current = grouped.get(key) ?? [];
      current.push(stay);
      grouped.set(key, current);
    }
  }

  return Array.from(grouped.entries())
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .flatMap(([key, stays]) => {
      const [propertyIdForGroup, category] = key.split('::');
      const propertyName = stays[0]?.group.property.name ?? '';
      const sortedStays = stays.sort((left, right) => {
        const byArrival = getTimelineStayWindow(left.room).start.localeCompare(getTimelineStayWindow(right.room).start);
        if (byArrival !== 0) return byArrival;
        return (left.room.guest_name ?? left.group.primary_guest?.name ?? '').localeCompare(
          right.room.guest_name ?? right.group.primary_guest?.name ?? '',
        );
      });
      const lanes: TimelineBarInfo[][] = [];

      for (const stay of sortedStays) {
        const laneIndex = lanes.findIndex((lane) => {
          const lastStay = lane[lane.length - 1];
          return !lastStay || getTimelineStayWindow(stay.room).start >= getTimelineStayWindow(lastStay.room).end;
        });

        if (laneIndex === -1) {
          lanes.push([stay]);
          continue;
        }

        lanes[laneIndex].push(stay);
      }

      return lanes.map((lane, laneIndex) => ({
        rowKey: `${propertyIdForGroup}::${category}::unassigned::${laneIndex}`,
        propertyId: propertyIdForGroup,
        propertyName,
        category,
        laneIndex,
        stays: lane,
      }));
    });
}

/* ─── Find reservation bar for a room row / unassigned lane ── */
function getAssignedRoomBar(
  groups: ReservationGroup[],
  row: PhysRoomRow,
  day: string,
  propertyId: string,
): TimelineBarInfo | undefined {
  for (const g of groups) {
    if (propertyId !== 'ALL' && g.property.id !== propertyId) continue;
    for (const r of g.rooms) {
      if (g.property.id !== row.propertyId || r.room_category.name !== row.category) continue;
      if (!r.room.room_number) continue;
      const roomKey = `${g.property.id}::${r.room.room_number}::${r.room_category.name}`;
      if (roomKey !== row.roomKey) continue;
      const stayWindow = getTimelineStayWindow(r);
      if (stayWindow.start <= day && stayWindow.end > day) return { group: g, room: r, status: r.reservation_status as BookingStatus };
    }
  }
  return undefined;
}

function getUnassignedBar(row: UnassignedTimelineRow, day: string) {
  return row.stays.find((stay) => {
    const stayWindow = getTimelineStayWindow(stay.room);
    return stayWindow.start <= day && stayWindow.end > day;
  });
}

function renderTimelineCells({
  days,
  today,
  selectedGroupId,
  onSelectGroup,
  getBarForDay,
}: {
  days: string[];
  today: string;
  selectedGroupId: string | null;
  onSelectGroup: (id: string) => void;
  getBarForDay: (day: string) => TimelineBarInfo | undefined;
}) {
  return days.map((day) => {
    const bar = getBarForDay(day);
    const isToday = day === today;
    const cellClass = isToday
      ? 'bg-indigo-50/40 group-hover:bg-indigo-50/40'
      : isWeekend(day)
        ? 'bg-slate-50/20 group-hover:bg-slate-50/20'
        : 'bg-white group-hover:bg-slate-50/20';

    if (!bar) {
      return (
        <div key={day}
          className={`flex-shrink-0 border-b border-slate-100 ${cellClass}`}
          style={{ width: COL_W, height: ROW_H }} />
      );
    }

    const stayWindow = getTimelineStayWindow(bar.room);
    const visibleStart = stayWindow.start > days[0] ? stayWindow.start : days[0];
    const visibleEnd = stayWindow.end < addDays(days[days.length - 1], 1)
      ? stayWindow.end
      : addDays(days[days.length - 1], 1);
    const isVisibleStart = day === visibleStart;
    const visibleSpanDays = Math.max(1, diffDays(visibleStart, visibleEnd));
    const barCls = STATUS_BAR[bar.status] ?? 'bg-slate-400 text-white';
    const guestName = capitalizeFirstLetter((bar.room.guest_name ?? bar.group.primary_guest?.name ?? '').split(' ')[0]);
    const isActualStart = stayWindow.start >= days[0];
    const isActualEnd = stayWindow.end <= addDays(days[days.length - 1], 1);
    const barShape = isActualStart && isActualEnd
      ? 'polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%)'
      : isActualStart
        ? 'polygon(14px 0, 100% 0, 100% 100%, 0 100%)'
        : isActualEnd
          ? 'polygon(0 0, 100% 0, calc(100% - 14px) 100%, 0 100%)'
          : undefined;

    return (
      <div key={day}
        className={`flex-shrink-0 relative border-b border-slate-100 ${cellClass}`}
        style={{ width: COL_W, height: ROW_H }}>
        {isVisibleStart && (
          <button
            type="button"
            onClick={() => onSelectGroup(bar.group.id)}
            className={`absolute left-[5px] top-[10px] bottom-[10px] ${barCls} transition-shadow z-10 ${selectedGroupId === bar.group.id ? 'ring-2 ring-inset ring-white/60' : ''}`}
            style={{
              width: visibleSpanDays * COL_W - 10,
              ...(barShape ? { clipPath: barShape } : {}),
            }}
          >
            <span className="absolute inset-0 flex items-center justify-center px-2.5 overflow-hidden pointer-events-none text-center">
              <span className="text-[10.5px] font-semibold truncate whitespace-nowrap">{guestName}</span>
            </span>
          </button>
        )}
      </div>
    );
  });
}

/* ─── Cache ────────────────────────────────────────────── */
let _allGroupsCache: ReservationGroup[] | null = null;
let _allGroupsCacheKey = '';
let _allGroupsCacheAt = 0;
const CACHE_TTL = 60_000;

/* ══════════════════════════════════════════════════════════
   BookingsPage
══════════════════════════════════════════════════════════ */
export function BookingsPage({ previewDataEnabled = false }: { previewDataEnabled?: boolean }) {
  const today = getTodayDate();

  /* ── View & filter state ── */
  const [viewMode, setViewMode] = useState<'timeline' | 'ledger'>('timeline');
  const [propertyFilter, setPropertyFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<BookingStatus | 'ALL'>('ALL');
  const [windowStart, setWindowStart] = useState(() => addDays(today, -2));
  const [collapsedRoomTypes, setCollapsedRoomTypes] = useState<Set<string>>(() => new Set());

  /* ── Tape-chart data (all groups) ── */
  const [reloadKey, setReloadKey] = useState(0);
  const [allGroups, setAllGroups] = useState<ReservationGroup[]>(_allGroupsCache ?? []);
  const [allLoading, setAllLoading] = useState(!_allGroupsCache);
  const [showTimelineLoader, setShowTimelineLoader] = useState(false);
  const [allError, setAllError] = useState<string | null>(null);

  /* ── Room inventory (full list, shows all rooms even with no bookings) ── */
  const roomsState = useAsync(async () => fetchAllPages<Room>('/rooms'), []);
  const propertiesState = useAsync(async () => fetchAllPages<Property>('/properties'), []);
  const categoriesState = useAsync(async () => fetchAllPages<RoomCategory>('/room-categories'), []);
  const ratePlansState = useAsync(async () => fetchAllPages<RatePlan>('/rate-plans'), []);
  const previewData = previewDataEnabled ? createPreviewData() : null;
  const displayedGroups = previewData?.reservationGroups ?? allGroups;
  const allRooms = previewData?.rooms ?? roomsState.data ?? [];
  const reservationProperties = propertiesState.data ?? [];
  const reservationCategories = categoriesState.data ?? [];
  const reservationRatePlans = ratePlansState.data ?? [];

  /* ── Detail drawer ── */
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [timelineDrawerGroup, setTimelineDrawerGroup] = useState<ReservationGroup | null>(null);
  const [timelineDrawerOpen, setTimelineDrawerOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [reminderPendingId, setReminderPendingId] = useState<string | null>(null);
  const [showDirectReservationModal, setShowDirectReservationModal] = useState(false);
  const [editingDirectReservationId, setEditingDirectReservationId] = useState<string | null>(null);
  const [directReservationSubmitting, setDirectReservationSubmitting] = useState(false);
  const [directReservationError, setDirectReservationError] = useState<string | null>(null);
  const [directReservationFieldErrors, setDirectReservationFieldErrors] = useState<DirectReservationFieldErrors>({});
  const [directReservationForm, setDirectReservationForm] = useState(() => createDirectReservationForm(today));
  const [openDirectReservationDatePicker, setOpenDirectReservationDatePicker] = useState<'checkin' | 'checkout' | null>(null);
  const [directReservationAvailability, setDirectReservationAvailability] = useState<AvailabilitySummary | null>(null);
  const [directReservationAvailabilityLoading, setDirectReservationAvailabilityLoading] = useState(false);
  const [directReservationAvailabilityError, setDirectReservationAvailabilityError] = useState<string | null>(null);
  const [openTimelineDatePicker, setOpenTimelineDatePicker] = useState(false);

  function toggleRoomType(category: string) {
    setCollapsedRoomTypes((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  /* ── Ledger feed (paginated) ── */
  const [feedPage, setFeedPage] = useState(1);
  const feedState = useAsync(
    async () => (await api.get<PaginatedResponse<ReservationGroup>>('/bookings/feed', { params: { page: feedPage, limit: 10 } })).data,
    [reloadKey, feedPage]
  );
  const selectedGroup = selectedGroupId ? (displayedGroups.find(g => g.id === selectedGroupId) ?? feedState.data?.data.find(g => g.id === selectedGroupId) ?? null) : null;
  const timelineDateTo = addDays(windowStart, WINDOW_DAYS - 1);
  const timelineGroupsParams = {
    date_from: windowStart,
    date_to: timelineDateTo,
    property_id: propertyFilter !== 'ALL' ? propertyFilter : undefined,
    status: statusFilter !== 'ALL' ? statusFilter : undefined,
  };
  const timelineGroupsCacheKey = JSON.stringify(timelineGroupsParams);

  useEffect(() => {
    let active = true;
    let loaderTimer: number | undefined;
    const controller = new AbortController();
    const fresh = _allGroupsCache && _allGroupsCacheKey === timelineGroupsCacheKey && reloadKey === 0 && Date.now() - _allGroupsCacheAt < CACHE_TTL;
    if (fresh) { setAllGroups(_allGroupsCache!); setAllLoading(false); setShowTimelineLoader(false); return; }
    setAllLoading(true);
    setShowTimelineLoader(false);
    loaderTimer = window.setTimeout(() => {
      if (active) setShowTimelineLoader(true);
    }, TIMELINE_LOADER_DELAY_MS);
    setAllError(null);
    const finishLoading = () => {
      setAllLoading(false);
      setShowTimelineLoader(false);
    };
    fetchAllPages<ReservationGroup>('/bookings/groups', { params: timelineGroupsParams, signal: controller.signal })
      .then(data => { if (!active) return; _allGroupsCache = data; _allGroupsCacheKey = timelineGroupsCacheKey; _allGroupsCacheAt = Date.now(); setAllGroups(data); finishLoading(); })
      .catch((e: unknown) => { if (!active || controller.signal.aborted) return; setAllError(getApiErrorMessage(e)); finishLoading(); });
    return () => {
      active = false;
      controller.abort();
      if (loaderTimer) window.clearTimeout(loaderTimer);
    };
  }, [reloadKey, timelineGroupsCacheKey]);

  useEffect(() => {
    if (!actionStatus) return;
    const timeout = window.setTimeout(() => setActionStatus(null), 3500);
    return () => window.clearTimeout(timeout);
  }, [actionStatus]);

  useEffect(() => {
    if (directReservationForm.property_id || reservationProperties.length !== 1) return;
    setDirectReservationForm((current) => ({
      ...current,
      property_id: reservationProperties[0].id,
      check_in_time: reservationProperties[0].default_check_in_time,
      check_out_time: reservationProperties[0].default_check_out_time,
    }));
  }, [directReservationForm.property_id, reservationProperties]);

  useEffect(() => {
    if (viewMode !== 'timeline' || !selectedGroup) {
      setTimelineDrawerOpen(false);
      const timeout = window.setTimeout(() => setTimelineDrawerGroup(null), 540);
      return () => window.clearTimeout(timeout);
    }

    setTimelineDrawerGroup(selectedGroup);
    setTimelineDrawerOpen(true);
  }, [selectedGroup, viewMode]);

  useEffect(() => {
    if (!timelineDrawerOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedGroupId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [timelineDrawerOpen]);

  useEffect(() => {
    const { property_id, check_in_date, check_out_date } = directReservationForm;
    if (!property_id || !check_in_date || !check_out_date || check_out_date <= check_in_date || previewDataEnabled) {
      setDirectReservationAvailability(null);
      setDirectReservationAvailabilityLoading(false);
      setDirectReservationAvailabilityError(null);
      return;
    }

    let cancelled = false;
    setDirectReservationAvailabilityLoading(true);
    setDirectReservationAvailabilityError(null);
    setDirectReservationAvailability(null);
    api.get<AvailabilitySummary>('/availability', {
      params: { property_id, from: check_in_date, to: check_out_date },
    })
      .then((response) => {
        if (!cancelled) setDirectReservationAvailability(response.data);
      })
      .catch((error) => {
        if (!cancelled) {
          setDirectReservationAvailability(null);
          setDirectReservationAvailabilityError(getApiErrorMessage(error));
        }
      })
      .finally(() => {
        if (!cancelled) setDirectReservationAvailabilityLoading(false);
      });

    return () => { cancelled = true; };
  }, [
    directReservationForm.property_id,
    directReservationForm.check_in_date,
    directReservationForm.check_out_date,
    previewDataEnabled,
  ]);

  /* ── Actions ── */
  async function checkOut(id: string) {
    if (isPreviewId(id)) { setActionError('Sample preview records are read-only. Turn off sample data to work with live records.'); return; }
    setActionError(null); setPendingId(id);
    try { await api.put(`/bookings/groups/rooms/${id}/checkout`); _allGroupsCache = null; setReloadKey(v => v + 1); }
    catch (e) { setActionError(getApiErrorMessage(e)); } finally { setPendingId(null); }
  }
  async function sendReminder(id: string) {
    if (isPreviewId(id)) { setActionStatus(null); setActionError('Sample preview records are read-only. Turn off sample data to work with live records.'); return; }
    setActionError(null);
    setActionStatus(null);
    setReminderPendingId(id);
    try {
      await api.post(`/bookings/groups/rooms/${id}/checkin-reminder`);
      setActionStatus('Reminder sent successfully.');
    }
    catch (e) { setActionError(getApiErrorMessage(e)); } finally { setReminderPendingId(null); }
  }
  function openEditDirectReservation(group: ReservationGroup) {
    if (!group.is_editable) return;
    setActionError(null);
    setDirectReservationError(null);
    setDirectReservationFieldErrors({});
    setEditingDirectReservationId(group.id);
    setDirectReservationForm(directReservationFormFromGroup(group, today));
    setShowDirectReservationModal(true);
  }

  async function saveDirectReservation(event: FormEvent) {
    event.preventDefault();
    if (previewDataEnabled) {
      setDirectReservationError('Sample preview records are read-only. Turn off sample data to create a live reservation.');
      return;
    }

    setActionError(null);
    setActionStatus(null);
    setDirectReservationError(null);
    setDirectReservationFieldErrors({});
    setDirectReservationSubmitting(true);

    try {
      const roomCount = Number(directReservationForm.room_count);
      const adults = Number(directReservationForm.adults);
      const children = Number(directReservationForm.children);
      const guestPhone = directReservationForm.guest_phone.trim();
      const guestEmail = directReservationForm.guest_email.trim();
      const guestIdProofType = directReservationForm.guest_id_proof_type.trim();
      const guestIdProofNumber = directReservationForm.guest_id_proof_number.trim();
      const advanceAmount = directReservationForm.advance_amount.trim();
      const parsedAdvanceAmount = advanceAmount ? Number(advanceAmount) : 0;
      const nextFieldErrors: DirectReservationFieldErrors = {};

      if (!directReservationForm.property_id) {
        nextFieldErrors.property_id = 'Select a property.';
      }
      if (!directReservationForm.room_category_id) {
        nextFieldErrors.room_category_id = 'Select a room category.';
      }
      if (!directReservationForm.rate_plan_id) {
        nextFieldErrors.rate_plan_id = 'Select a rate plan.';
      }
      if (!directReservationForm.check_in_date) {
        nextFieldErrors.check_in_date = 'Select a check-in date.';
      }
      if (!directReservationForm.check_out_date || directReservationForm.check_out_date <= directReservationForm.check_in_date) {
        nextFieldErrors.check_out_date = 'Select a check-out date after check-in.';
      }
      if (!Number.isInteger(roomCount) || roomCount < 1 || roomCount > 20) {
        nextFieldErrors.room_count = 'Select a valid room count.';
      }
      if (!editingDirectReservationId && directReservationMaxRooms != null && roomCount > directReservationMaxRooms) {
        nextFieldErrors.room_count = `Only ${directReservationMaxRooms} room${directReservationMaxRooms === 1 ? '' : 's'} available.`;
      }
      if (!isValidTime(directReservationForm.check_in_time) || !isValidTime(directReservationForm.check_out_time)) {
        if (!isValidTime(directReservationForm.check_in_time)) nextFieldErrors.check_in_time = 'Select a valid check-in time.';
        if (!isValidTime(directReservationForm.check_out_time)) nextFieldErrors.check_out_time = 'Select a valid check-out time.';
      }
      if (!Number.isInteger(adults) || adults < 1 || adults > 20) {
        nextFieldErrors.adults = 'Enter 1 to 20 adults.';
      }
      if (!Number.isInteger(children) || children < 0 || children > 20) {
        nextFieldErrors.children = 'Enter 0 to 20 children.';
      }
      if (!isValidGuestPhone(guestPhone)) {
        nextFieldErrors.guest_phone = 'Enter a valid phone number with 10 to 15 digits.';
      }
      if (!isValidGuestEmail(guestEmail)) {
        nextFieldErrors.guest_email = 'Email is optional, but if entered use name@example.com. Check typos like .cpm.';
      }
      if (!directReservationForm.guest_name.trim()) {
        nextFieldErrors.guest_name = 'Enter guest name.';
      }
      if (!guestIdProofType) {
        nextFieldErrors.guest_id_proof_type = 'Select an ID proof type.';
      }
      if (!guestIdProofNumber) {
        nextFieldErrors.guest_id_proof_number = `Enter the ${guestIdProofType || 'ID proof'} number.`;
      }
      if (!directReservationForm.guest_address.trim()) {
        nextFieldErrors.guest_address = 'Enter guest address.';
      }
      if (advanceAmount && (!Number.isFinite(parsedAdvanceAmount) || parsedAdvanceAmount <= 0)) {
        nextFieldErrors.advance_amount = 'Enter an amount greater than zero.';
      }

      if (Object.keys(nextFieldErrors).length > 0) {
        setDirectReservationFieldErrors(nextFieldErrors);
        setDirectReservationError(firstDirectReservationError(nextFieldErrors));
        return;
      }

      const payload = {
        property_id: directReservationForm.property_id,
        room_category_id: directReservationForm.room_category_id,
        rate_plan_id: directReservationForm.rate_plan_id,
        check_in_date: directReservationForm.check_in_date,
        check_out_date: directReservationForm.check_out_date,
        check_in_time: directReservationForm.check_in_time,
        check_out_time: directReservationForm.check_out_time,
        room_count: Number.isNaN(roomCount) ? 1 : roomCount,
        adults,
        children,
        remarks: directReservationForm.remarks.trim() || undefined,
        source: 'WALK_IN',
        advance_amount: advanceAmount || undefined,
        advance_payment_provider: advanceAmount ? directReservationForm.advance_payment_provider : undefined,
        advance_payment_reference:
          advanceAmount && directReservationForm.advance_payment_provider !== 'CASH'
            ? directReservationForm.advance_payment_reference.trim() || undefined
            : undefined,
        guest: {
          name: directReservationForm.guest_name.trim(),
          phone: guestPhone,
          email: guestEmail || undefined,
          id_proof: formatIdProof(guestIdProofType, guestIdProofNumber),
          address: directReservationForm.guest_address.trim(),
        },
      };
      const { data } = editingDirectReservationId
        ? await api.put<ReservationGroup>(`/reservations/direct/${editingDirectReservationId}`, payload)
        : await api.post<ReservationGroup>('/reservations/direct', payload);

      _allGroupsCache = null;
      setFeedPage(1);
      setViewMode('ledger');
      setSelectedGroupId(data.id);
      setReloadKey((value) => value + 1);
      setShowDirectReservationModal(false);
      setEditingDirectReservationId(null);
      setOpenDirectReservationDatePicker(null);
      setDirectReservationForm(createDirectReservationForm(today, reservationProperties.length === 1 ? reservationProperties[0] : null));
      setActionStatus(editingDirectReservationId ? 'Walk-in reservation updated.' : 'Walk-in reservation created. Inventory sync has been queued for active OTA connections.');
    } catch (e) {
      setDirectReservationError(getApiErrorMessage(e));
    } finally {
      setDirectReservationSubmitting(false);
    }
  }

  /* ── Derived data ── */
  const properties = Array.from(
    new Map(allRooms.map(r => [r.property.id, r.property])).values()
  ).sort((a, b) => a.name.localeCompare(b.name));
  const directReservationCategories = reservationCategories
    .filter((category) =>
      !directReservationForm.property_id || category.property_id === directReservationForm.property_id,
    )
    .sort((left, right) => left.name.localeCompare(right.name));
  const directReservationRatePlans = reservationRatePlans
    .filter((ratePlan) => {
      if (directReservationForm.property_id && ratePlan.property_id !== directReservationForm.property_id) return false;
      if (directReservationForm.room_category_id && ratePlan.room_category_id !== directReservationForm.room_category_id) return false;
      return ratePlan.is_active;
    })
    .sort((left, right) => left.name.localeCompare(right.name));
  const directReservationAvailabilityCategory = directReservationAvailability?.categories.find(
    (category) => category.room_category_id === directReservationForm.room_category_id,
  );
  const previewAvailableRoomCount = previewDataEnabled && directReservationForm.room_category_id
    ? allRooms.filter((room) => room.room_category_id === directReservationForm.room_category_id && room.status === 'AVAILABLE').length
    : null;
  const directReservationMaxRooms =
    directReservationAvailabilityCategory?.available ??
    previewAvailableRoomCount;
  const directReservationLoading =
    propertiesState.loading || categoriesState.loading || ratePlansState.loading;

  useEffect(() => {
    if (editingDirectReservationId || !directReservationForm.room_category_id || directReservationMaxRooms == null) return;
    const currentRoomCount = Number(directReservationForm.room_count);
    if (directReservationMaxRooms <= 0 && directReservationForm.room_count) {
      setDirectReservationForm((current) => ({ ...current, room_count: '' }));
      return;
    }
    if (directReservationMaxRooms > 0 && directReservationForm.room_count && currentRoomCount > directReservationMaxRooms) {
      setDirectReservationForm((current) => ({ ...current, room_count: String(directReservationMaxRooms) }));
    }
  }, [directReservationForm.room_category_id, directReservationForm.room_count, directReservationMaxRooms, editingDirectReservationId]);

  const days = Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(windowStart, i));
  const windowEnd = addDays(windowStart, WINDOW_DAYS);

  const filteredGroups = displayedGroups.filter(g => {
    if (propertyFilter !== 'ALL' && g.property.id !== propertyFilter) return false;
    if (statusFilter !== 'ALL') {
      if (!g.rooms.some(r => r.reservation_status === statusFilter)) return false;
    }
    return true;
  });

  /* Room rows come from real room inventory; unassigned bookings stay in dedicated TBD lanes until check-in assigns a room. */
  const roomRows = sortRoomRows(buildRoomRows(allRooms, propertyFilter));
  const unassignedRows = buildUnassignedTimelineRows(filteredGroups, propertyFilter, days);
  const groupedRooms = Object.entries(
    roomRows.reduce<Record<string, PhysRoomRow[]>>((acc, r) => { (acc[r.category] ??= []).push(r); return acc; }, {})
  );

  /* Occupancy per day */
  const occByDay: Record<string, number> = {};
  for (const day of days) {
    const occ = displayedGroups.filter(g =>
      g.rooms.some((r) => {
        const stayWindow = getTimelineStayWindow(r);
        return stayWindow.start <= day && stayWindow.end > day && r.reservation_status !== 'CHECKED_OUT' && r.reservation_status !== 'CANCELLED';
      })
    ).length;
    occByDay[day] = roomRows.length > 0 ? Math.round((occ / Math.max(roomRows.length, 1)) * 100) : 0;
  }

  /* KPIs */
  const arrivalsToday  = displayedGroups.reduce((s, g) => s + g.rooms.filter(r => r.arrival_date === today && r.reservation_status === 'BOOKED').length, 0);
  const depToday       = displayedGroups.reduce((s, g) => s + g.rooms.filter(r => r.departure_date === today && ['CHECKED_IN','CHECKED_OUT'].includes(r.reservation_status)).length, 0);
  const inHouse        = displayedGroups.reduce((s, g) => s + g.rooms.filter(r => r.reservation_status === 'CHECKED_IN').length, 0);
  const visibleGroups = groupVisibleReservations(displayedGroups);

  /* Ledger display groups */
  const feedGroups = groupVisibleReservations(previewData?.reservationGroups ?? feedState.data?.data ?? []);
  const notCheckedInGroups = visibleGroups.filter(g =>
    g.rooms.some(r => r.reservation_status === 'BOOKED'),
  ).length;

  return (
    <div className="space-y-4 relative">
      <FloatingSuccessToast message={actionStatus} onClose={() => setActionStatus(null)} />

      {/* ── Header row: title + controls ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[9.5px] font-bold uppercase tracking-[0.15em] text-slate-400">Operations</span>
            <span className="text-slate-300">·</span>
            <span className="text-[9.5px] font-bold uppercase tracking-[0.15em] text-slate-400">Reservations</span>
          </div>
          <h1 className="text-[24px] font-bold text-slate-900 tracking-tight leading-none">Reservations</h1>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setDirectReservationError(null);
              setDirectReservationFieldErrors({});
              setEditingDirectReservationId(null);
              setDirectReservationForm(createDirectReservationForm(today, reservationProperties.length === 1 ? reservationProperties[0] : null));
              setShowDirectReservationModal(true);
            }}
            className={`${primaryBtn} !h-9 !px-3.5 !py-0 text-[11.5px]`}
          >
            + Walk-in reservation
          </button>

          {/* Property selector */}
          <div className="flex items-center gap-2">
            {/* <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap select-none">Property</span> */}
            <div className="w-44">
              <CustomSelect
                options={[{ label: 'All properties', value: 'ALL' }, ...properties.map(p => ({ label: p.name, value: p.id }))]}
                value={propertyFilter}
                onChange={setPropertyFilter}
              />
            </div>
          </div>

          {/* Date navigator */}
          <div className="bg-white border border-black/[0.07] rounded-lg flex items-center shadow-sm relative">
            {/* ‹ prev week */}
            <button type="button" onClick={() => setWindowStart(s => addDays(s, -7))}
              className="px-3 py-2.5 hover:bg-slate-50 rounded-l-lg transition-colors text-slate-600 border-r border-slate-100 flex items-center gap-0.5" title="Previous week">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>
              <svg className="w-3 h-3 -ml-1.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            <InlineCalendarDatePicker
              label="Timeline start date"
              value={windowStart}
              onChange={setWindowStart}
              open={openTimelineDatePicker}
              setOpen={setOpenTimelineDatePicker}
              closeOnSelect={false}
              buttonClassName="w-[172px] px-3.5 py-2 flex items-center justify-center gap-2 hover:bg-slate-50 transition-colors group border-r border-slate-100"
              headerClassName="px-4 pt-3 pb-1.5"
              calendarClassName="pricing-calendar--timeline"
              renderTrigger={() => (
                <>
                  <svg className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 flex-shrink-0 transition-colors" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
                  </svg>
                  <span className="text-[12px] font-bold text-slate-800 whitespace-nowrap select-none">
                    {fmtShort(windowStart)} — {fmtShort(addDays(windowEnd, -1))}
                  </span>
                </>
              )}
            />
            {/* › next week */}
            <button type="button" onClick={() => setWindowStart(s => addDays(s, 7))}
              className="px-3 py-2.5 hover:bg-slate-50 rounded-r-lg transition-colors text-slate-600 border-l border-slate-100 flex items-center gap-0.5" title="Next week">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>
              <svg className="w-3 h-3 -ml-1.5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="m9 18 6-6-6-6"/></svg>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setWindowStart(addDays(today, -2))}
            className="h-9 px-3.5 rounded-lg text-[11.5px] font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Today
          </button>

          {/* Timeline / Ledger toggle */}
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
            {(['timeline', 'ledger'] as const).map(v => (
              <button key={v} type="button" onClick={() => setViewMode(v)}
                className={`h-8 px-3 rounded-md text-[11.5px] font-semibold transition-colors capitalize ${viewMode === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {v === 'timeline' ? 'Timeline' : 'Ledger'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── KPI strip ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Arrivals today',    value: arrivalsToday.toString() },
          { label: 'Departures today',  value: depToday.toString() },
          { label: 'In house',          value: inHouse.toString() },
          { label: 'Not checked in groups', value: notCheckedInGroups.toString() },
        ].map(k => (
          <StatCard
            key={k.label}
            label={k.label}
            value={k.value}
            className="px-3.5 py-2.5"
            valueClassName="text-[1.35rem] text-slate-900"
          />
        ))}
      </div>

      {allError && <ErrorMsg>{allError}</ErrorMsg>}
      {actionError && <ErrorMsg>{actionError}</ErrorMsg>}

      {/* ════════════════════════════════════════════════
          TIMELINE VIEW
      ════════════════════════════════════════════════ */}
      {viewMode === 'timeline' && (
        <>
          {/* Status filter chips + count */}
          <div className="flex items-center gap-2 flex-wrap">
            {(['ALL', 'BOOKED', 'CHECKED_IN', 'CHECKED_OUT'] as const).map(s => (
              <button key={s} type="button" onClick={() => setStatusFilter(s)}
                className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-[11px] font-semibold transition-colors ${statusFilter === s ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                {s !== 'ALL' && <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[s]}`} />}
                {s === 'ALL' ? 'All statuses' : STATUS_LABEL[s]}
              </button>
            ))}
            <span className="ml-auto text-[11px] text-slate-400">
              {roomRows.length} rooms · {filteredGroups.reduce((s, g) => s + g.rooms.length, 0)} stays
            </span>
          </div>

          {/* ── Tape chart ── */}
          <div className="relative bg-white rounded-xl border border-black/[0.06] flex flex-col overflow-hidden" style={{ maxHeight: 'calc(100vh - 240px)', minHeight: 720 }}>
            {showTimelineLoader && allLoading && !previewData && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/65 backdrop-blur-[1px]">
                <Spinner size="lg" />
              </div>
            )}

              <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none">
                {roomRows.length === 0 && unassignedRows.length === 0 ? (
                  <div className="py-16 text-center">
                    <p className="text-[13px] font-semibold text-slate-500">No rooms found for the selected filters.</p>
                  </div>
                ) : (
                  <div className="grid" style={{ gridTemplateColumns: `${SIDEBAR_W}px minmax(0, 1fr)` }}>
                    <div className="border-r border-slate-100 bg-white">
                      <div className="bg-slate-50 border-b border-slate-100 flex items-end px-4 pb-2.5" style={{ height: 80 }}>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Room</span>
                      </div>
                      {unassignedRows.length > 0 && (
                        <>
                          <div className="bg-sky-50/80 border-b border-sky-100 flex items-center px-4" style={{ height: 28 }}>
                            <span className="text-[9.5px] font-bold uppercase tracking-wider text-sky-700">Unassigned / TBD</span>
                          </div>
                          {unassignedRows.map((row) => (
                            <div key={row.rowKey} className="border-b border-sky-100 flex items-center gap-2.5 px-4 bg-sky-50/30" style={{ height: ROW_H }}>
                              <span className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center text-[10px] font-extrabold text-sky-700 flex-shrink-0">
                                TBD
                              </span>
                              <div className="min-w-0">
                                <p className="text-[11.5px] font-bold text-slate-800 leading-tight">
                                  {row.category}
                                </p>
                                <p className="text-[9.5px] text-slate-400 truncate">
                                  {properties.length > 1 ? `${row.propertyName} · ` : ''}Awaiting front-desk room assignment
                                </p>
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                      {groupedRooms.map(([category, rooms]) => {
                        const collapsed = collapsedRoomTypes.has(category);
                        return (
                          <Fragment key={category}>
                            <div className="bg-slate-50/95 border-b border-slate-100 flex items-center px-4" style={{ height: 28 }}>
                              <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500">{category}</span>
                              <span className="ml-1.5 text-[9px] font-semibold text-slate-400">· {rooms.length} rooms</span>
                              <button type="button" onClick={() => toggleRoomType(category)}
                                className="ml-2 flex h-5 w-5 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                                aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${category} rooms`}>
                                {collapsed ? <ChevronRight size={13} strokeWidth={2.4} /> : <ChevronDown size={13} strokeWidth={2.4} />}
                              </button>
                            </div>
                            {!collapsed && rooms.map(room => (
                              <div key={room.roomKey} className="border-b border-slate-100 flex items-center gap-2.5 px-4 bg-white" style={{ height: ROW_H }}>
                                <span className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-[11px] font-extrabold text-slate-600 flex-shrink-0">
                                  {room.roomNum ?? '?'}
                                </span>
                                <div className="min-w-0">
                                  <p className="text-[11.5px] font-bold text-slate-800 leading-tight">
                                    Room {room.roomNum}
                                  </p>
                                  {properties.length > 1 && (
                                    <p className="text-[9.5px] text-slate-400 truncate">{room.propertyName.split(' ')[0]}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </Fragment>
                        );
                      })}
                    </div>

                    <div className="overflow-x-auto scrollbar-none overscroll-x-contain">
                      <div className="min-w-max">
                        <div className="flex border-b border-slate-100" style={{ height: 80 }}>
                          {days.map(day => {
                            const isToday = day === today;
                            const occ = occByDay[day] ?? 0;
                            const occColor = occ >= 85 ? 'bg-rose-400' : occ >= 60 ? 'bg-amber-400' : occ >= 30 ? 'bg-emerald-400' : 'bg-slate-200';
                            return (
                              <div key={day} className={`flex-shrink-0 flex flex-col items-center justify-end pb-2 gap-1 ${isToday ? 'bg-indigo-50' : isWeekend(day) ? 'bg-slate-50/60' : 'bg-slate-50/20'}`}
                                style={{ width: COL_W }}>
                                <div className="w-8 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${occColor}`} style={{ width: `${occ}%` }} />
                                </div>
                                <span className={`text-[8.5px] font-bold leading-none ${isToday ? 'text-indigo-500' : 'text-slate-400'}`}>{occ}%</span>
                                <strong className={`text-[12px] font-bold leading-tight ${isToday ? 'text-indigo-700' : 'text-slate-800'}`}>{dayNum(day)}</strong>
                                <span className={`text-[9.5px] font-semibold leading-none ${isToday ? 'text-indigo-500' : 'text-slate-400'}`}>{dayOfWeek(day)}</span>
                              </div>
                            );
                          })}
                        </div>
                        {unassignedRows.length > 0 && (
                          <>
                            <div className="flex bg-sky-50/70 border-b border-sky-100" style={{ height: 28 }}>
                              {days.map((day) => (
                                <div key={day} className={`flex-shrink-0 ${day === today ? 'bg-sky-100/60' : isWeekend(day) ? 'bg-sky-50/50' : ''}`}
                                  style={{ width: COL_W }} />
                              ))}
                            </div>
                            {unassignedRows.map((row) => (
                              <div key={row.rowKey} className="flex border-b border-sky-100 group" style={{ height: ROW_H }}>
                                {renderTimelineCells({
                                  days,
                                  today,
                                  selectedGroupId,
                                  onSelectGroup: (id) => setSelectedGroupId((current) => current === id ? null : id),
                                  getBarForDay: (day) => getUnassignedBar(row, day),
                                })}
                              </div>
                            ))}
                          </>
                        )}

                        {groupedRooms.map(([category, rooms]) => {
                          const collapsed = collapsedRoomTypes.has(category);
                          return (
                            <Fragment key={category}>
                              <div className="flex bg-slate-50/80 border-b border-slate-100" style={{ height: 28 }}>
                                {days.map(day => (
                                  <div key={day} className={`flex-shrink-0 ${day === today ? 'bg-indigo-50/60' : isWeekend(day) ? 'bg-slate-50/50' : ''}`}
                                    style={{ width: COL_W }} />
                                ))}
                              </div>
                              {!collapsed && rooms.map(room => (
                                <div key={room.roomKey} className="flex border-b border-slate-100 group" style={{ height: ROW_H }}>
                                  {renderTimelineCells({
                                    days,
                                    today,
                                    selectedGroupId,
                                    onSelectGroup: (id) => setSelectedGroupId((current) => current === id ? null : id),
                                    getBarForDay: (day) => getAssignedRoomBar(filteredGroups, room, day, propertyFilter),
                                  })}
                                </div>
                              ))}
                            </Fragment>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Legend ── */}
              <div className="flex-shrink-0 border-t border-slate-100 px-4 py-2.5 flex items-center gap-6 bg-white rounded-b-xl">
                {(['BOOKED', 'CHECKED_IN', 'CHECKED_OUT'] as const).map(s => (
                  <span key={s} className="flex items-center gap-1.5 text-[10.5px] font-medium text-slate-500">
                    <span className={`w-4 h-2.5 rounded-sm flex-shrink-0 ${STATUS_BAR[s].split(' ')[0]}`} />
                    {STATUS_LABEL[s]}
                  </span>
                ))}
                <span className="flex items-center gap-1.5 text-[10.5px] font-medium text-slate-400 ml-2">
                  <span className="w-4 h-2.5 rounded-sm bg-indigo-100 flex-shrink-0" />Today
                </span>
                  <span className="ml-auto text-[10.5px] text-slate-400">Click a bar to view reservation details</span>
                </div>
          </div>
        </>
      )}

      {/* ════════════════════════════════════════════════
          LEDGER VIEW
      ════════════════════════════════════════════════ */}
      {viewMode === 'ledger' && (
        <>
          {feedState.error && <ErrorMsg>{feedState.error}</ErrorMsg>}
          {feedState.loading && !feedState.data && !previewData && <LoadingMsg>Loading reservations…</LoadingMsg>}

          <TableCard
            title={`${feedGroups.length} reservation groups`}
            eyebrow="Reservation feed"
            scrollClassName="scrollbar-none"
            actions={
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400">
                  Page {feedPage} of {feedState.data?.meta.total_pages ?? '…'}
                </span>
                <button className={secondaryBtn + ' !text-xs !px-2.5 !py-1.5'} disabled={feedPage <= 1} onClick={() => setFeedPage(p => p - 1)} type="button">← Prev</button>
                <button className={secondaryBtn + ' !text-xs !px-2.5 !py-1.5'} disabled={feedPage >= (feedState.data?.meta.total_pages ?? 1)} onClick={() => setFeedPage(p => p + 1)} type="button">Next →</button>
              </div>
            }
          >
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <Th>Source / reservation</Th><Th>Property</Th><Th>Dates</Th>
                  <Th>Primary guest</Th><Th>Rooms</Th><Th>Total</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {feedGroups.map(group => (
                  <Fragment key={group.id}>
                    <tr
                      className={`cursor-pointer border-b border-slate-50 last:border-0 transition-colors ${selectedGroupId === group.id ? 'bg-slate-50/80' : 'hover:bg-slate-50/60'}`}
                      onClick={() => setSelectedGroupId(id => id === group.id ? null : group.id)}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return;
                        event.preventDefault();
                        setSelectedGroupId(id => id === group.id ? null : group.id);
                      }}
                      role="button"
                      tabIndex={0}
                      aria-expanded={selectedGroupId === group.id}
                    >
                      <Td>
                        <span className="font-bold text-slate-900 block">{group.source ?? 'ZODOMUS'}</span>
                        <span className="text-xs text-slate-400 font-mono">{group.external_reservation_id}</span>
                        {group.import_blocked && <span className="text-[11px] text-rose-500 block">Import blocked</span>}
                      </Td>
                      <Td>{group.property.name}</Td>
                      <Td>
                        <strong className="block text-slate-900">{group.arrival_date ?? '—'}</strong>
                        <span className="text-xs text-slate-400">{group.departure_date ?? '—'}</span>
                      </Td>
                      <Td>
                        <span className="font-medium text-slate-900 block">{capitalizeFirstLetter(group.primary_guest?.name ?? 'Imported guest')}</span>
                        <span className="text-xs text-slate-400">{group.primary_guest?.phone ?? '—'}</span>
                      </Td>
                      <Td>
                        <span className="font-medium text-slate-900 block">{group.rooms.length} room{group.rooms.length === 1 ? '' : 's'}</span>
                        <span className="text-xs text-slate-400">{group.rooms.map(r => r.room_category.name).filter((v, i, a) => a.indexOf(v) === i).join(', ')}</span>
                      </Td>
                      <Td>{group.total_amount == null ? '—' : formatCurrency(group.total_amount)}</Td>
                      <Td>
                        <div className="flex flex-col items-start gap-2">
                          <StatusBadge label={group.import_blocked ? 'IMPORT_BLOCKED' : group.reservation_status} tone={group.import_blocked ? 'rose' : undefined} />
                          {group.is_editable && (
                            <button
                              type="button"
                              className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900"
                              onClick={(event) => {
                                event.stopPropagation();
                                openEditDirectReservation(group);
                              }}
                            >
                              Edit
                            </button>
                          )}
                        </div>
                      </Td>
                    </tr>
                    {selectedGroupId === group.id && (
                      <tr>
                        <td colSpan={7} className="bg-slate-50/80 border-b border-slate-100 px-5 py-5">
                          <ReservationFeedDetails
                            group={group}
                            pendingId={pendingId}
                            reminderPendingId={reminderPendingId}
                            onClose={() => setSelectedGroupId(null)}
                            onCheckOut={checkOut}
                            onSendReminder={sendReminder}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </TableCard>
        </>
      )}

      {/* ════════════════════════════════════════════════
          RESERVATION DETAIL DRAWER (timeline mode)
      ════════════════════════════════════════════════ */}
      {(viewMode === 'timeline' || timelineDrawerGroup) && createPortal(
        <div
          className={`fixed inset-0 z-[60] ${timelineDrawerOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
          aria-hidden={!timelineDrawerOpen}
        >
          <button
            type="button"
            aria-label="Close reservation details"
            className={`absolute inset-0 bg-slate-950/20 transition-opacity duration-[420ms] ease-in-out ${timelineDrawerOpen ? 'opacity-100' : 'opacity-0'}`}
            onClick={() => setSelectedGroupId(null)}
            tabIndex={timelineDrawerOpen ? 0 : -1}
          />
          <aside
            className={`absolute bottom-3 right-3 top-3 flex w-[min(33rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[30px] border border-slate-900/10 bg-[#f6f4ef] shadow-2xl transition-transform duration-[420ms] ease-out transform-gpu will-change-transform [backface-visibility:hidden] [contain:layout_paint_style] ${timelineDrawerOpen ? 'translate-x-0' : 'translate-x-[calc(100%+1rem)]'}`}
            role="dialog"
            aria-modal="true"
            aria-label="Reservation details"
          >
            {timelineDrawerGroup && (
            <div className="flex h-full flex-col">
              <div className="border-b border-slate-900/10 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.28),transparent_38%),linear-gradient(135deg,#0f172a_0%,#1e293b_65%,#334155_100%)] px-5 pb-5 pt-6 text-white">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3.5">
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl border border-white/20 bg-white/10 text-[15px] font-black text-white shadow-inner shadow-white/10">
                      {getGuestInitials(timelineDrawerGroup.primary_guest?.name ?? 'Imported guest')}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-200">Reservation details</p>
                      <h3 className="mt-1 truncate text-[19px] font-black tracking-tight text-white">
                        {capitalizeFirstLetter(timelineDrawerGroup.primary_guest?.name ?? 'Imported guest')}
                      </h3>
                      <p className="mt-1 text-[12px] text-slate-300">
                        {timelineDrawerGroup.property.name} · {timelineDrawerGroup.source ?? 'Direct'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedGroupId(null)}
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-slate-200 transition hover:bg-white/10 hover:text-white"
                    type="button"
                    aria-label="Close reservation details"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
                  </button>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${timelineDrawerGroup.reservation_status === 'CHECKED_IN' ? 'bg-emerald-400/15 text-emerald-100 ring-1 ring-inset ring-emerald-300/25' : timelineDrawerGroup.import_blocked ? 'bg-rose-400/15 text-rose-100 ring-1 ring-inset ring-rose-300/25' : 'bg-white/10 text-slate-100 ring-1 ring-inset ring-white/10'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[timelineDrawerGroup.reservation_status] ?? 'bg-slate-300'}`} />
                    {timelineDrawerGroup.import_blocked ? 'Import blocked' : STATUS_LABEL[timelineDrawerGroup.reservation_status] ?? timelineDrawerGroup.reservation_status}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-1 text-[10.5px] font-semibold text-slate-100 ring-1 ring-inset ring-white/10">
                    {timelineDrawerGroup.rooms.length} room{timelineDrawerGroup.rooms.length === 1 ? '' : 's'}
                  </span>
                  {timelineDrawerGroup.is_editable && (
                    <button
                      type="button"
                      onClick={() => openEditDirectReservation(timelineDrawerGroup)}
                      className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-[10.5px] font-bold text-slate-900"
                    >
                      Edit
                    </button>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2.5">
                  {[
                    [
                      'Stay window',
                      (() => {
                        const stayWindow = getGroupStayWindow(timelineDrawerGroup);
                        if (!stayWindow.arrival || !stayWindow.departure) return 'Dates unavailable';
                        return `${fmtShort(stayWindow.arrival)} - ${fmtShort(stayWindow.departure)}`;
                      })(),
                    ],
                    ['Rooms', `${timelineDrawerGroup.rooms.length} room${timelineDrawerGroup.rooms.length === 1 ? '' : 's'}`],
                    ['Reservation ref', timelineDrawerGroup.external_reservation_id || '—'],
                    ['Grand total', timelineDrawerGroup.total_amount == null ? '—' : formatCurrency(timelineDrawerGroup.total_amount)],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-2xl border border-white/10 bg-white/10 px-3.5 py-3">
                      <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-slate-300">{label}</p>
                      <p className={`mt-1 text-[12px] font-bold text-white ${label === 'Reservation ref' ? 'break-all font-mono text-[11px]' : ''}`}>{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 scrollbar-none">
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-2xl border border-black/5 bg-white p-3.5 shadow-sm shadow-slate-950/5">
                    <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-slate-400">Guest contact</p>
                    <p className="mt-1.5 text-[13px] font-semibold text-slate-800">{timelineDrawerGroup.primary_guest?.phone ?? 'Phone unavailable'}</p>
                    <p className="mt-1 break-all text-[11px] text-slate-500">{timelineDrawerGroup.primary_guest?.email ?? 'Email unavailable'}</p>
                  </div>
                  <div className="rounded-2xl border border-black/5 bg-white p-3.5 shadow-sm shadow-slate-950/5">
                    <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-slate-400">Booking timeline</p>
                    <p className="mt-1.5 text-[12.5px] font-semibold text-slate-800">{timelineDrawerGroup.booked_at ? formatDateTime(timelineDrawerGroup.booked_at) : 'Booked time unavailable'}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{timelineDrawerGroup.modified_at ? `Updated ${formatDateTime(timelineDrawerGroup.modified_at)}` : 'No provider updates recorded'}</p>
                  </div>
                </div>

                {(timelineDrawerGroup.remarks || timelineDrawerGroup.import_error) && (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5">
                    <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-amber-700">Notes</p>
                    {timelineDrawerGroup.remarks && <p className="mt-1.5 text-[11.5px] leading-relaxed text-amber-900">{timelineDrawerGroup.remarks}</p>}
                    {timelineDrawerGroup.import_error && <p className="mt-1.5 text-[11.5px] leading-relaxed text-rose-700">{timelineDrawerGroup.import_error}</p>}
                  </div>
                )}

                <div className="mt-5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-slate-400">Stay breakdown</p>
                      <p className="mt-1 text-[12px] text-slate-500">Each room stay has its own status, dates, and action state.</p>
                    </div>
                    {/* <span className="rounded-full bg-white px-2.5 py-1 text-[10.5px] font-semibold text-slate-500 shadow-sm shadow-slate-950/5 ring-1 ring-black/5">
                      {timelineDrawerGroup.rooms.length} card{timelineDrawerGroup.rooms.length === 1 ? '' : 's'}
                    </span> */}
                  </div>

                  <div className="space-y-3">
                  {timelineDrawerGroup.rooms.map((room) => (
                    <div key={room.id} className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm shadow-slate-950/5">
                      <div className={`flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3.5 ${STATUS_SURFACE[room.reservation_status].soft}`}>
                        <div>
                          <p className="text-[12px] font-black text-slate-800">{room.room.room_number ? `Room ${room.room.room_number}` : 'Room TBD'}</p>
                          <p className="mt-0.5 text-[10.5px] font-medium text-slate-500">{room.room_category.name} · {room.rate_plan.name}</p>
                        </div>
                        <StatusBadge label={room.reservation_status} />
                      </div>

                      <div className="space-y-1 px-4 py-3.5">
                        {[
                          ['Guest', capitalizeFirstLetter(room.guest_name ?? timelineDrawerGroup.primary_guest?.name ?? '—')],
                          ['Nights', `${calculateNights(room.arrival_date, room.departure_date)} night${calculateNights(room.arrival_date, room.departure_date) === 1 ? '' : 's'}`],
                          ['Guests', formatGuestCount(room.adults, room.children)],
                          ['Total', room.total_amount == null ? '—' : formatCurrency(room.total_amount)],
                        ].map(([label, value]) => (
                          <div key={String(label)} className="flex items-start justify-between gap-3 border-b border-slate-100 py-2 last:border-0 last:pb-0">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</span>
                            <span className="text-right text-[11.5px] font-semibold leading-tight text-slate-800">{value}</span>
                          </div>
                        ))}

                        {!timelineDrawerGroup.import_blocked && room.reservation_status === 'BOOKED' && (
                          <div className="pt-3">
                            <button
                              disabled={reminderPendingId === room.id}
                              onClick={() => void sendReminder(room.id)}
                              className="inline-flex h-9 items-center rounded-xl border border-sky-200 bg-sky-50 px-3.5 text-[11.5px] font-bold text-sky-700 transition-colors hover:bg-sky-100 disabled:opacity-50"
                              type="button"
                            >
                              {reminderPendingId === room.id ? 'Sending…' : 'Send reminder'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  </div>
                </div>
              </div>
            </div>
            )}
          </aside>
        </div>,
        document.body,
      )}

      <DirectReservationModal
        open={showDirectReservationModal}
        onClose={() => {
          setShowDirectReservationModal(false);
          setEditingDirectReservationId(null);
          setDirectReservationError(null);
          setDirectReservationFieldErrors({});
          setOpenDirectReservationDatePicker(null);
          setDirectReservationForm(createDirectReservationForm(today, reservationProperties.length === 1 ? reservationProperties[0] : null));
        }}
        onSubmit={saveDirectReservation}
        onChange={(value) => {
          setDirectReservationFieldErrors({});
          setDirectReservationError(null);
          setDirectReservationForm(value);
        }}
        form={directReservationForm}
        properties={reservationProperties}
        categories={directReservationCategories}
        ratePlans={directReservationRatePlans}
        maxAvailableRooms={directReservationMaxRooms}
        availabilityLoading={directReservationAvailabilityLoading}
        availabilityError={directReservationAvailabilityError}
        loading={directReservationLoading}
        submitting={directReservationSubmitting}
        error={directReservationError}
        fieldErrors={directReservationFieldErrors}
        openDatePicker={openDirectReservationDatePicker}
        setOpenDatePicker={setOpenDirectReservationDatePicker}
        editing={Boolean(editingDirectReservationId)}
      />
    </div>
  );
}

function DirectReservationModal({
  open,
  onClose,
  onSubmit,
  onChange,
  form,
  properties,
  categories,
  ratePlans,
  maxAvailableRooms,
  availabilityLoading,
  availabilityError,
  loading,
  submitting,
  error,
  fieldErrors,
  openDatePicker,
  setOpenDatePicker,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent) => Promise<void>;
  onChange: Dispatch<SetStateAction<DirectReservationFormState>>;
  form: DirectReservationFormState;
  properties: Property[];
  categories: RoomCategory[];
  ratePlans: RatePlan[];
  maxAvailableRooms: number | null;
  availabilityLoading: boolean;
  availabilityError: string | null;
  loading: boolean;
  submitting: boolean;
  error: string | null;
  fieldErrors: DirectReservationFieldErrors;
  openDatePicker: 'checkin' | 'checkout' | null;
  setOpenDatePicker: Dispatch<SetStateAction<'checkin' | 'checkout' | null>>;
  editing: boolean;
}) {
  if (!open) return null;
  const selectedProperty = properties.find((property) => property.id === form.property_id) ?? null;
  const roomCountDisabled = !form.room_category_id || availabilityLoading || maxAvailableRooms == null || maxAvailableRooms <= 0;
  const roomCountHint = !form.room_category_id
    ? 'Select a room category to check availability.'
    : availabilityLoading
      ? 'Checking available rooms...'
      : availabilityError
        ? availabilityError
        : maxAvailableRooms === 0
          ? 'No rooms available for selected dates.'
          : maxAvailableRooms == null
            ? 'Select dates to check availability.'
            : `Max available: ${maxAvailableRooms} room${maxAvailableRooms === 1 ? '' : 's'}.`;
  const inputClass = (field: keyof DirectReservationFormState, extra = '') => {
    const fixedHeight = field === 'guest_address' ? '' : 'h-11';
    return `${inputCls} ${fixedHeight} hover:border-slate-300 focus:!border-emerald-400 focus:!ring-emerald-500/15 ${fieldErrors[field] ? '!border-rose-400 ring-2 ring-rose-500/15 focus:!border-rose-500 focus:!ring-rose-500/20' : ''} ${extra}`.trim();
  };
  const fieldError = (field: keyof DirectReservationFormState) =>
    fieldErrors[field] ? <span className="text-[11px] font-medium text-rose-500">{fieldErrors[field]}</span> : null;

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close walk-in reservation form"
        className="fixed inset-0 z-40 bg-slate-950/35"
        onClick={onClose}
      />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-600">Walk-in reservation</p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">{editing ? 'Edit direct booking' : 'Create a direct booking'}</h2>
            <p className="mt-1 text-sm text-slate-500">
              This reserves HMS inventory now and queues OTA availability sync for active channel connections.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form noValidate onSubmit={(event) => void onSubmit(event)} className="flex min-h-0 flex-1 flex-col">
          <div className="scrollbar-none min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
            {error && Object.keys(fieldErrors).length === 0 && <ErrorMsg>{error}</ErrorMsg>}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className={labelCls}>
                <span>Property</span>
                <CustomSelect
                  invalid={Boolean(fieldErrors.property_id)}
                  lockWhenSingleOption
                  disabled={editing}
                  options={properties.map((property) => ({ label: property.name, value: property.id }))}
                  placeholder={loading ? 'Loading properties…' : 'Select property'}
                  value={form.property_id}
                  onChange={(value) =>
                    onChange((current) => ({
                      ...current,
                      property_id: value,
                      room_category_id: '',
                      rate_plan_id: '',
                      room_count: '1',
                      check_in_time: properties.find((property) => property.id === value)?.default_check_in_time ?? current.check_in_time,
                      check_out_time: properties.find((property) => property.id === value)?.default_check_out_time ?? current.check_out_time,
                    }))
                  }
                />
                {fieldError('property_id')}
              </label>

              <label className={labelCls}>
                <span>Room category</span>
                <CustomSelect
                  disabled={!form.property_id || loading}
                  invalid={Boolean(fieldErrors.room_category_id)}
                  options={categories.map((category) => ({ label: category.name, value: category.id }))}
                  placeholder={!form.property_id ? 'Select property first' : 'Select room category'}
                  value={form.room_category_id}
                  onChange={(value) =>
                    onChange((current) => ({
                      ...current,
                      room_category_id: value,
                      rate_plan_id: '',
                      room_count: '',
                    }))
                  }
                />
                {fieldError('room_category_id')}
              </label>

              {form.room_category_id ? (
                <>
                  <label className={labelCls}>
                    <span>Room count</span>
                    <input
                      className={inputClass('room_count', '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none')}
                      disabled={editing || roomCountDisabled}
                      inputMode="numeric"
                      max={maxAvailableRooms ?? 20}
                      min={1}
                      placeholder={maxAvailableRooms != null && maxAvailableRooms > 0 ? `1-${maxAvailableRooms}` : 'Select category first'}
                      type="number"
                      value={form.room_count}
                      onChange={(event) => onChange((current) => ({
                        ...current,
                        room_count: clampRoomCountInput(event.target.value, maxAvailableRooms),
                      }))}
                    />
                    <span className={`text-[11px] font-medium ${availabilityError || maxAvailableRooms === 0 ? 'text-rose-500' : 'text-slate-400'}`}>
                      {fieldErrors.room_count ?? (editing ? 'Room count is fixed after creation.' : roomCountHint)}
                    </span>
                  </label>

                  <label className={labelCls}>
                    <span>Rate plan</span>
                    <CustomSelect
                      disabled={loading}
                      invalid={Boolean(fieldErrors.rate_plan_id)}
                      options={ratePlans.map((ratePlan) => ({
                        label: `${ratePlan.name} · ${formatCurrency(ratePlan.base_rate)} ${ratePlan.currency}`,
                        value: ratePlan.id,
                      }))}
                      placeholder="Select rate plan"
                      value={form.rate_plan_id}
                      onChange={(value) => onChange((current) => ({ ...current, rate_plan_id: value }))}
                    />
                    {fieldError('rate_plan_id')}
                  </label>
                </>
              ) : null}

              <label className={labelCls}>
                <span>Adults</span>
                <input
                  className={inputClass('adults')}
                  inputMode="numeric"
                  max={20}
                  min={1}
                  type="text"
                  value={form.adults}
                  onChange={(event) => onChange((current) => ({ ...current, adults: event.target.value }))}
                />
                {fieldError('adults')}
              </label>

              <label className={labelCls}>
                <span>Children</span>
                <input
                  className={inputClass('children')}
                  inputMode="numeric"
                  max={20}
                  min={0}
                  type="text"
                  value={form.children}
                  onChange={(event) => onChange((current) => ({ ...current, children: event.target.value }))}
                />
                {fieldError('children')}
              </label>

              <div className="flex flex-col gap-1.5">
                <CalendarDatePickerField
                  invalid={Boolean(fieldErrors.check_in_date)}
                  label="Check-in date"
                  value={form.check_in_date}
                  onChange={(value) => onChange((current) => ({ ...current, check_in_date: value }))}
                  open={openDatePicker === 'checkin'}
                  setOpen={(isOpen) => setOpenDatePicker(isOpen ? 'checkin' : null)}
                />
                {fieldError('check_in_date')}
              </div>

              <div className={labelCls}>
                <span>Check-in time</span>
                <TimePolicyPicker
                  editable
                  invalid={Boolean(fieldErrors.check_in_time)}
                  minuteStep={5}
                  showClockIcon
                  value={form.check_in_time || selectedProperty?.default_check_in_time || '12:00'}
                  onChange={(value) => onChange((current) => ({ ...current, check_in_time: value }))}
                />
                {fieldError('check_in_time')}
              </div>

              <div className="flex flex-col gap-1.5">
                <CalendarDatePickerField
                  align="right"
                  invalid={Boolean(fieldErrors.check_out_date)}
                  label="Check-out date"
                  value={form.check_out_date}
                  onChange={(value) => onChange((current) => ({ ...current, check_out_date: value }))}
                  open={openDatePicker === 'checkout'}
                  setOpen={(isOpen) => setOpenDatePicker(isOpen ? 'checkout' : null)}
                />
                {fieldError('check_out_date')}
              </div>

              <label className={labelCls}>
                <span>Check-out time</span>
                <TimePolicyPicker
                  editable
                  invalid={Boolean(fieldErrors.check_out_time)}
                  minuteStep={5}
                  showClockIcon
                  value={form.check_out_time || selectedProperty?.default_check_out_time || '11:00'}
                  onChange={(value) => onChange((current) => ({ ...current, check_out_time: value }))}
                />
                {fieldError('check_out_time')}
              </label>
            </div>

            <div className="space-y-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Primary guest</p>
                <h3 className="mt-1 text-sm font-bold text-slate-900">Capture the walk-in guest details</h3>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className={labelCls}>
                  <span>Guest name</span>
	                  <input
	                    className={inputClass('guest_name')}
	                    autoComplete="name"
	                    placeholder="e.g. Priya Sharma"
	                    value={form.guest_name}
	                    onChange={(event) => onChange((current) => ({ ...current, guest_name: event.target.value }))}
	                  />
                  {fieldError('guest_name')}
                </label>

                <label className={labelCls}>
                  <span>Phone</span>
	                  <input
	                    className={inputClass('guest_phone')}
	                    autoComplete="tel"
	                    inputMode="tel"
	                    placeholder="e.g. +91 98765 43210"
	                    value={form.guest_phone}
	                    onChange={(event) => onChange((current) => ({ ...current, guest_phone: event.target.value }))}
	                  />
                  {fieldError('guest_phone')}
                </label>

                <label className={labelCls}>
                  <span>Email</span>
	                  <input
	                    className={inputClass('guest_email')}
	                    autoComplete="email"
                      inputMode="email"
	                    placeholder="e.g. guest@example.com"
	                    type="text"
	                    value={form.guest_email}
	                    onChange={(event) => onChange((current) => ({ ...current, guest_email: event.target.value }))}
                  />
                  {fieldError('guest_email')}
                </label>

                <label className={labelCls}>
                  <span>ID proof</span>
                  <CustomSelect
                    invalid={Boolean(fieldErrors.guest_id_proof_type)}
                    options={idProofOptions}
                    placeholder="Select ID proof"
                    value={form.guest_id_proof_type}
                    onChange={(value) => onChange((current) => ({
                      ...current,
                      guest_id_proof_type: value,
                      guest_id_proof_number: '',
                    }))}
                  />
                  {fieldError('guest_id_proof_type')}
                </label>

                {form.guest_id_proof_type ? (
                  <label className={`${labelCls} md:col-span-2`}>
                    <span>{form.guest_id_proof_type} number</span>
                    <input
                      className={inputClass('guest_id_proof_number')}
                      autoComplete="off"
                      placeholder={`Enter ${form.guest_id_proof_type} number`}
                      value={form.guest_id_proof_number}
                      onChange={(event) => onChange((current) => ({ ...current, guest_id_proof_number: event.target.value }))}
                    />
                    {fieldError('guest_id_proof_number')}
                  </label>
                ) : null}

                <label className={`${labelCls} md:col-span-2`}>
                  <span>Address</span>
	                  <textarea
	                    className={inputClass('guest_address', 'min-h-[92px] resize-y')}
	                    autoComplete="street-address"
	                    placeholder="Guest address for front-desk records"
	                    value={form.guest_address}
	                    onChange={(event) => onChange((current) => ({ ...current, guest_address: event.target.value }))}
	                  />
                  {fieldError('guest_address')}
                </label>
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  Advance payment <span className="text-[9px] lowercase tracking-normal">*optional</span>
                </p>
                <h3 className="mt-1 text-sm font-bold text-slate-900">Record a partial payment</h3>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <label className={labelCls}>
                  <span>Amount</span>
                  <input
                    className={inputClass('advance_amount')}
                    inputMode="decimal"
                    min="0"
                    placeholder="0.00"
                    step="0.01"
                    type="text"
                    value={form.advance_amount}
                    onChange={(event) => onChange((current) => ({ ...current, advance_amount: event.target.value }))}
                  />
                  {fieldError('advance_amount')}
                </label>

                <label className={labelCls}>
                  <span>Mode</span>
                  <CustomSelect
                    options={advancePaymentProviderOptions}
                    value={form.advance_payment_provider}
                    onChange={(value) =>
                      onChange((current) => ({
                        ...current,
                        advance_payment_provider: value as PaymentProvider,
                        advance_payment_reference: value === 'CASH' ? '' : current.advance_payment_reference,
                      }))
                    }
                  />
                </label>

                {form.advance_payment_provider !== 'CASH' ? (
                  <label className={labelCls}>
                    <span>Reference</span>
                    <input
                      className={inputClass('advance_payment_reference')}
                      autoComplete="off"
                      placeholder="Receipt / UPI ref"
                      value={form.advance_payment_reference}
                      onChange={(event) => onChange((current) => ({ ...current, advance_payment_reference: event.target.value }))}
                    />
                    {fieldError('advance_payment_reference')}
                  </label>
                ) : null}
              </div>
            </div>

            <label className={labelCls}>
              <span>Remarks</span>
              <textarea
                className={inputClass('remarks', 'min-h-[92px] resize-y')}
                placeholder="Optional internal note for the front desk"
                value={form.remarks}
                onChange={(event) => onChange((current) => ({ ...current, remarks: event.target.value }))}
              />
              {fieldError('remarks')}
            </label>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-6 py-4">
            <p className="text-xs text-slate-500">
              Source will be saved as <span className="font-semibold text-slate-700">WALK_IN</span>.
            </p>
            <div className="flex items-center gap-2">
              <button type="button" className={secondaryBtn} onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className={primaryBtn} disabled={submitting || loading}>
                {submitting ? (editing ? 'Saving...' : 'Creating...') : (editing ? 'Save changes' : 'Create reservation')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </>,
    document.body,
  );
}

/* ══════════════════════════════════════════════════════════
   ReservationFeedDetails (ledger expand row)
══════════════════════════════════════════════════════════ */
function ReservationFeedDetails({ group, pendingId, reminderPendingId, onClose, onCheckOut, onSendReminder }: {
  group: DisplayGroup;
  pendingId: string | null;
  reminderPendingId: string | null;
  onClose: () => void;
  onCheckOut: (id: string) => Promise<void>;
  onSendReminder: (id: string) => Promise<void>;
}) {
  const assignedRooms = group.rooms.filter(r => r.room.room_number).length;
  const checkedInRooms = group.rooms.filter(r => r.reservation_status === 'CHECKED_IN').length;
  const checkedOutRooms = group.rooms.filter(r => r.reservation_status === 'CHECKED_OUT').length;
  const totalNights = group.rooms.reduce((s, r) => s + calculateNights(r.arrival_date, r.departure_date), 0);
  const groupNights = group.arrival_date && group.departure_date ? calculateNights(group.arrival_date, group.departure_date) : 0;
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">{group.import_blocked ? 'Import blocker' : 'Reservation detail'}</p>
          <h3 className="text-base font-bold text-slate-900">{capitalizeFirstLetter(group.primary_guest?.name ?? 'Imported guest')}</h3>
          <p className="text-sm text-slate-500">{group.property.name} · {group.external_reservation_id}{group.arrival_date && group.departure_date ? ` · ${group.arrival_date} to ${group.departure_date}` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            aria-label="Close reservation details"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:text-slate-700"
            onClick={onClose}
            type="button"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {group.import_blocked && (
        <div className="flex gap-3 items-start bg-rose-50 border border-rose-200 rounded-xl p-3 text-sm">
          <strong className="text-rose-800 flex-shrink-0">Import blocked</strong>
          <span className="text-rose-700 leading-relaxed">{group.import_error ?? group.remarks ?? 'Fix mapping or inventory, then rerun the provider sync.'}</span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Stay window',  value: `${groupNights} nights`, sub: `${group.arrival_date ?? '—'} to ${group.departure_date ?? '—'}` },
          { label: 'Room stays',   value: String(group.rooms.length), sub: `${totalNights} total booked nights` },
          { label: 'Assignments',  value: `${assignedRooms}/${group.rooms.length}`, sub: `${checkedInRooms} checked in · ${checkedOutRooms} checked out` },
          { label: 'Folio total',  value: group.total_amount == null ? '—' : formatCurrency(group.total_amount), sub: `${group.currency ?? '—'} · ${group.source ?? 'ZODOMUS'}` },
        ].map(s => (
          <div key={s.label} className="bg-white border border-slate-100 rounded-xl p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">{s.label}</span>
            <strong className="text-base font-extrabold text-slate-900 block">{s.value}</strong>
            <p className="text-[11px] text-slate-400 leading-relaxed">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {group.rooms.map(room => (
          <div key={room.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-0.5">Room line {room.external_room_reservation_id}</p>
                <h4 className="text-sm font-bold text-slate-900">{room.room_category.name}</h4>
                <p className="text-xs text-slate-500">Assigned: {room.room.room_number ?? 'Not assigned'}</p>
              </div>
              <StatusBadge label={room.reservation_status} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Stay',      value: `${room.arrival_date} → ${room.departure_date}`, sub: `${calculateNights(room.arrival_date, room.departure_date)} nights` },
                { label: 'Rate plan', value: room.rate_plan.name,   sub: formatCurrency(room.rate_plan.base_rate) },
                { label: 'Guests',    value: capitalizeFirstLetter(room.guest_name ?? group.primary_guest?.name ?? '—'), sub: formatGuestCount(room.adults, room.children) },
                { label: 'Total',     value: room.total_amount == null ? '—' : formatCurrency(room.total_amount), sub: room.currency ?? group.currency ?? '—' },
              ].map(chip => (
                <div key={chip.label} className="bg-slate-50 border border-slate-100 rounded-lg p-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">{chip.label}</span>
                  <strong className="text-xs font-bold text-slate-800 block truncate">{chip.value}</strong>
                  <p className="text-[11px] text-slate-400 truncate">{chip.sub}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {!group.import_blocked && room.reservation_status === 'BOOKED' && (
                <button
                  className="h-8 rounded-lg border border-sky-200 bg-sky-50 px-3.5 text-[11.5px] font-bold text-sky-700 transition-colors hover:bg-sky-100 disabled:opacity-50"
                  disabled={reminderPendingId === room.id}
                  onClick={() => void onSendReminder(room.id)}
                  type="button"
                >
                  {reminderPendingId === room.id ? 'Sending…' : 'Send reminder'}
                </button>
              )}
              {group.import_blocked && <span className="text-xs text-rose-500">{group.import_error ?? 'Import blocked'}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Duplicate grouping helpers (unchanged) ────────── */
function groupVisibleReservations(groups: ReservationGroup[]): DisplayGroup[] {
  const groupedBlocked  = new Map<string, DisplayGroup>();
  const groupedImported = new Map<string, DisplayGroup>();
  const importedSigs    = new Set(groups.filter(g => !g.import_blocked).map(buildOperationalSig));
  const visible: DisplayGroup[] = [];

  for (const g of groups) {
    if (!g.import_blocked) {
      const sig = buildDupSig(g);
      const ex  = groupedImported.get(sig);
      if (ex) { ex.duplicate_reservation_ids = [...(ex.duplicate_reservation_ids ?? [ex.external_reservation_id]), g.external_reservation_id]; ex.duplicate_count = (ex.duplicate_count ?? 1) + 1; continue; }
      const first: DisplayGroup = { ...g, duplicate_reservation_ids: [g.external_reservation_id], duplicate_count: 1 };
      groupedImported.set(sig, first); visible.push(first); continue;
    }
    const opSig = buildOperationalSig(g);
    if (importedSigs.has(opSig)) continue;
    const sig = `${opSig}::${(g.import_error ?? '').trim().toLowerCase()}`;
    const ex  = groupedBlocked.get(sig);
    if (!ex) { const first: DisplayGroup = { ...g, duplicate_reservation_ids: [g.external_reservation_id], duplicate_count: 1 }; groupedBlocked.set(sig, first); visible.push(first); continue; }
    ex.duplicate_reservation_ids = [...(ex.duplicate_reservation_ids ?? [ex.external_reservation_id]), g.external_reservation_id]; ex.duplicate_count = (ex.duplicate_count ?? 1) + 1;
  }
  return visible;
}
function buildDupSig(g: ReservationGroup) {
  const guest = (g.primary_guest?.name ?? '').trim().toLowerCase();
  const rooms = g.rooms.map(r => `${r.external_room_reservation_id}:${r.external_room_id}:${r.arrival_date}:${r.departure_date}`).sort().join('|');
  return [g.property.id, guest, g.arrival_date ?? '', g.departure_date ?? '', rooms].join('::');
}
function buildOperationalSig(g: ReservationGroup) {
  const guest = (g.primary_guest?.name ?? '').trim().toLowerCase();
  const rooms = g.rooms.map(r => `${r.external_room_id}:${r.arrival_date}:${r.departure_date}`).sort().join('|');
  return [g.property.id, guest, g.arrival_date ?? '', g.departure_date ?? '', rooms].join('::');
}
