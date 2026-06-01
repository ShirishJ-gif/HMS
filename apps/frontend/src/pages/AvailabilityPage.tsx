import { FormEvent, useEffect, useMemo, useState } from 'react';
import { DayPicker } from '@daypicker/react';
import '@daypicker/react/style.css';
import { api } from '../api/client';
import { fetchAllPages } from '../api/pagination';
import { AvailabilitySummary, InventoryCalendarSummary, Property, RoomCategory } from '../api/types';
import { CustomSelect } from '../components/CustomSelect';
import { useAsync } from '../hooks/useAsync';
import { usePersistedPropertyId } from '../hooks/usePersistedPropertyId';
import { formatCurrency } from '../utils/format';
import { createPreviewData } from './previewData';

const AVAILABILITY_STORAGE_KEY = 'hms_availability_state';
const INVENTORY_CALENDAR_DAYS = 30;

const RANGE_CHIPS = [
  { label: 'Next 30', value: 'next_30' },
  { label: 'Next 60', value: 'next_60' },
  { label: 'Next 90', value: 'next_90' },
  { label: 'This month', value: 'this_month' },
  { label: 'Next month', value: 'next_month' },
] as const;

type RangePreset = 'next_30' | 'next_60' | 'next_90' | 'this_month' | 'next_month' | 'custom';
type ActiveTab = 'overview' | 'calendar' | 'exceptions';
type PersistedAvailabilityQuery = { propertyId: string; from: string; to: string };
type PersistedAvailabilityState = {
  lastLoadedQuery: PersistedAvailabilityQuery;
  availability: AvailabilitySummary;
  inventoryCalendar: InventoryCalendarSummary;
};

export function AvailabilityPage({ previewDataEnabled = false }: { previewDataEnabled?: boolean }) {
  const today = dateToInputValue(new Date());
  const defaultTo = addDays(today, INVENTORY_CALENDAR_DAYS - 1);
  const [propertyId, setPropertyId] = usePersistedPropertyId();
  const persistedAvailabilityState = useMemo(() => readPersistedAvailabilityState(), []);
  const restoredQuery = persistedAvailabilityState?.lastLoadedQuery ?? null;
  const shouldRestorePersistedResults =
    restoredQuery != null &&
    (!propertyId || restoredQuery.propertyId === propertyId) &&
    persistedAvailabilityState?.inventoryCalendar.from === restoredQuery.from &&
    persistedAvailabilityState?.inventoryCalendar.to === restoredQuery.to;
  const [from, setFrom] = useState(shouldRestorePersistedResults ? restoredQuery.from : today);
  const [to, setTo] = useState(shouldRestorePersistedResults ? restoredQuery.to : defaultTo);
  const [availability, setAvailability] = useState<AvailabilitySummary | null>(
    shouldRestorePersistedResults ? persistedAvailabilityState?.availability ?? null : null,
  );
  const [inventoryCalendar, setInventoryCalendar] = useState<InventoryCalendarSummary | null>(
    shouldRestorePersistedResults ? persistedAvailabilityState?.inventoryCalendar ?? null : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [lastLoadedQuery, setLastLoadedQuery] = useState<PersistedAvailabilityQuery | null>(
    shouldRestorePersistedResults ? restoredQuery : null,
  );
  const [openDatePicker, setOpenDatePicker] = useState<'from' | 'to' | null>(null);
  const [rangePreset, setRangePreset] = useState<RangePreset>(
    shouldRestorePersistedResults && restoredQuery
      ? inferRangePreset(restoredQuery.from, restoredQuery.to, today)
      : 'next_30',
  );
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);

  const propertiesState = useAsync(async () => fetchAllPages<Property>('/properties'), []);
  const categoriesState = useAsync(async () => fetchAllPages<RoomCategory>('/room-categories'), []);
  const previewData = previewDataEnabled ? createPreviewData() : null;
  const properties = previewData?.properties ?? propertiesState.data ?? [];
  const hasLoadedProperties = previewDataEnabled || propertiesState.data != null;
  const selectedPropertyExists = Boolean(propertyId && properties.some((p) => p.id === propertyId));

  useEffect(() => {
    if (!propertyId && restoredQuery?.propertyId) setPropertyId(restoredQuery.propertyId);
  }, [propertyId, restoredQuery, setPropertyId]);

  useEffect(() => {
    if (!propertiesState.data) return;
    if (properties.length === 0) {
      if (propertyId) setPropertyId('');
      setAvailability(null); setInventoryCalendar(null); setLastLoadedQuery(null);
      clearPersistedAvailabilityState(); return;
    }
    if (!propertyId || !properties.some((p) => p.id === propertyId)) {
      setPropertyId(properties[0].id);
      setAvailability(null); setInventoryCalendar(null); setLastLoadedQuery(null);
      clearPersistedAvailabilityState();
    }
  }, [properties, propertyId, setPropertyId]);

  useEffect(() => {
    if (!hasLoadedProperties || !selectedPropertyExists || lastLoadedQuery?.propertyId === propertyId) return;
    void fetchAvailability({ propertyId, from, to });
  }, [from, hasLoadedProperties, lastLoadedQuery?.propertyId, propertyId, selectedPropertyExists, to]);

  const displayedAvailability = previewData?.availability ?? (
    hasLoadedProperties && selectedPropertyExists && lastLoadedQuery?.propertyId === propertyId
      ? availability
      : null
  );
  const displayedInventoryCalendar = previewData?.inventoryCalendar ?? (displayedAvailability ? inventoryCalendar : null);
  const stopSellCount =
    displayedInventoryCalendar?.categories?.reduce(
      (s, c) => s + c.rows.filter((r) => r.stop_sell).length, 0,
    ) ?? 0;
  const restrictedNightCount =
    displayedInventoryCalendar?.categories?.reduce(
      (s, c) => s + c.rows.filter((r) => hasRestriction(r)).length, 0,
    ) ?? 0;
  const inventoryCalendarRowCount =
    displayedInventoryCalendar?.categories?.reduce((s, c) => s + c.rows.length, 0) ?? 0;

  const windowSummary = useMemo(() => {
    const rows = displayedInventoryCalendar?.categories?.flatMap((cat) => cat.rows) ?? [];
    const totalRoomNights = rows.reduce((s, r) => s + r.total_rooms, 0);
    const bookedRoomNights = rows.reduce((s, r) => s + r.reserved_rooms, 0);
    const blockedRoomNights = rows.reduce((s, r) => s + r.blocked_rooms, 0);
    const availableRoomNights = rows.reduce((s, r) => s + r.available_rooms, 0);
    const lowestAvailability =
      rows.reduce<number | null>((min, r) => (min == null || r.available_rooms < min ? r.available_rooms : min), null) ?? 0;
    const peakBooked = rows.reduce((max, r) => Math.max(max, r.reserved_rooms), 0);
    const soldOutDates = new Set(rows.filter((r) => r.available_rooms <= 0).map((r) => r.date)).size;
    const bookedRate = totalRoomNights === 0 ? 0 : Math.round((bookedRoomNights / totalRoomNights) * 100);
    const availableRate = totalRoomNights === 0 ? 0 : Math.round((availableRoomNights / totalRoomNights) * 100);
    const blockedRate = totalRoomNights === 0 ? 0 : Math.round((blockedRoomNights / totalRoomNights) * 100);
    return {
      totalRoomNights, bookedRoomNights, blockedRoomNights, availableRoomNights,
      lowestAvailability, peakBooked, soldOutDates, bookedRate, availableRate, blockedRate,
    };
  }, [displayedInventoryCalendar]);

  const inventoryCategoryById = useMemo(() => {
    const summaries = new Map<string, {
      availableRoomNights: number; bookedRoomNights: number; blockedRoomNights: number;
      totalRoomNights: number; lowestAvailability: number; peakBooked: number;
    }>();
    for (const cat of displayedInventoryCalendar?.categories ?? []) {
      const lowestAvailability =
        cat.rows.reduce<number | null>((min, r) => (min == null || r.available_rooms < min ? r.available_rooms : min), null) ?? 0;
      summaries.set(cat.room_category_id, {
        availableRoomNights: cat.rows.reduce((s, r) => s + r.available_rooms, 0),
        bookedRoomNights: cat.rows.reduce((s, r) => s + r.reserved_rooms, 0),
        blockedRoomNights: cat.rows.reduce((s, r) => s + r.blocked_rooms, 0),
        totalRoomNights: cat.rows.reduce((s, r) => s + r.total_rooms, 0),
        lowestAvailability,
        peakBooked: cat.rows.reduce((max, r) => Math.max(max, r.reserved_rooms), 0),
      });
    }
    return summaries;
  }, [displayedInventoryCalendar]);

  const inventoryCategorySummaries =
    displayedInventoryCalendar?.categories?.map((cat) => {
      const totalAv = cat.rows.reduce((s, r) => s + r.available_rooms, 0);
      const minAvailable = cat.rows.reduce<number | null>(
        (m, r) => (m == null || r.available_rooms < m ? r.available_rooms : m), null,
      );
      const restrictedRows = cat.rows.filter((r) => hasRestriction(r)).length;
      return {
        roomCategoryId: cat.room_category_id, name: cat.name,
        averageAvailable: cat.rows.length === 0 ? 0 : Math.round(totalAv / cat.rows.length),
        minAvailable: minAvailable ?? 0, restrictedRows,
      };
    }) ?? [];

  const inventoryExceptionRows =
    displayedInventoryCalendar?.categories?.flatMap((cat) =>
      cat.rows
        .filter((r) => hasRestriction(r) || r.blocked_rooms > 0 || r.available_rooms <= 0)
        .map((r) => ({ ...r, roomCategoryId: cat.room_category_id, roomCategoryName: cat.name })),
    ) ?? [];
  const visibleInventoryExceptionRows = inventoryExceptionRows.slice(0, 20);
  const hiddenInventoryExceptionRows = Math.max(0, inventoryExceptionRows.length - visibleInventoryExceptionRows.length);

  const inventoryCalendarDates = displayedInventoryCalendar?.categories
    ? Array.from(new Set(displayedInventoryCalendar.categories.flatMap((c) => c.rows.map((r) => r.date)))).sort()
    : [];
  const inventoryDateGridTemplate = `repeat(${Math.max(inventoryCalendarDates.length, 1)}, minmax(4.5rem, 4.5rem))`;

  async function fetchAvailability(query: PersistedAvailabilityQuery) {
    setError(null); setAvailabilityLoading(true);
    try {
      if (!query.propertyId) { setError('Select a property first.'); return; }
      if (previewDataEnabled) {
        const next = createPreviewData();
        setAvailability(next.availability); setInventoryCalendar(next.inventoryCalendar); setLastLoadedQuery(query);
        return;
      }
      const [availabilityResponse, inventoryResponse] = await Promise.all([
        api.get<AvailabilitySummary>('/availability', { params: { property_id: query.propertyId, from: query.from, to: query.to } }),
        api.get<InventoryCalendarSummary>('/inventory-calendar', { params: { property_id: query.propertyId, from: query.from, to: query.to } }),
      ]);
      const avail = { ...availabilityResponse.data, categories: availabilityResponse.data.categories ?? [] };
      const inv = { ...inventoryResponse.data, categories: inventoryResponse.data.categories ?? [] };
      setAvailability(avail); setInventoryCalendar(inv); setLastLoadedQuery(query);
      writePersistedAvailabilityState({ lastLoadedQuery: query, availability: avail, inventoryCalendar: inv });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load availability');
    } finally { setAvailabilityLoading(false); }
  }

  function loadAvailability(event: FormEvent) {
    event.preventDefault();
    void fetchAvailability({ propertyId, from, to });
  }

  function applyRangePreset(preset: RangePreset) {
    setRangePreset(preset);
    if (preset === 'custom') return;
    const range = getPresetRange(preset, today);
    setFrom(range.from); setTo(range.to);
  }

  function updateFromDate(value: string) { setFrom(value); setRangePreset('custom'); }
  function updateToDate(value: string) { setTo(value); setRangePreset('custom'); }

  const isLoading = propertiesState.loading || categoriesState.loading || availabilityLoading;
  const selectedProperty = properties.find((p) => p.id === propertyId);

  return (
    <div className="min-h-screen -mx-5 lg:-mx-8 -my-6 lg:-my-8 bg-[#f5f5f3] flex flex-col">

      {/* ── Sticky header with inline filter bar ── */}
      <form
        onSubmit={loadAvailability}
        className="sticky top-0 z-20 bg-white border-b border-black/[0.06]"
      >
        <div className="flex items-start justify-between gap-4 px-5 lg:px-8 pt-6 lg:pt-8 pb-4">
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Commercial</p>
            <h1 className="text-[22px] font-black text-slate-900 tracking-tight leading-none">Availability &amp; Rates</h1>
            <p className="text-[12px] text-slate-400 mt-1">Review sellable inventory, restrictions, and room-category availability</p>
          </div>
          <div className="flex-shrink-0 pt-1">
            {isLoading ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
                <span className="w-3 h-3 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
                Loading...
              </span>
            ) : displayedAvailability ? (
              <span className="bg-emerald-50 text-emerald-700 text-[11px] font-bold px-3 py-1.5 rounded-full whitespace-nowrap">
                {windowSummary.availableRate}% open · {windowSummary.availableRoomNights} room-nights
              </span>
            ) : null}
          </div>
        </div>

        {/* Filter controls */}
        <div className="px-5 lg:px-8 pb-4 overflow-visible">
          <div className="inline-flex max-w-full items-center gap-2 rounded-xl p-1.5 shadow-slate-900/[0.03]">
            <div className="w-[240px] flex-shrink-0">
              <CustomSelect
                onChange={setPropertyId}
                options={properties.map((p) => ({ label: p.name, value: p.id }))}
                placeholder="Select property"
                value={propertyId}
              />
            </div>

            <div className="flex w-[420px] items-center gap-1 rounded-lg bg-slate-100 p-1 flex-shrink-0">
              {RANGE_CHIPS.map((chip) => (
                <button
                  key={chip.value}
                  type="button"
                  onClick={() => applyRangePreset(chip.value)}
                  className={`h-8 flex-1 rounded-md text-[12px] font-semibold transition-colors ${
                    rangePreset === chip.value
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            <div className="flex w-[204px] items-center justify-center gap-1.5 bg-white border border-black/[0.07] rounded-lg px-2.5 h-9 relative flex-shrink-0">
              <CompactDateField
                label="From"
                value={from}
                onChange={updateFromDate}
                open={openDatePicker === 'from'}
                setOpen={(open) => setOpenDatePicker(open ? 'from' : null)}
              />
              <span className="text-slate-300">→</span>
              <CompactDateField
                label="To"
                value={to}
                onChange={updateToDate}
                open={openDatePicker === 'to'}
                setOpen={(open) => setOpenDatePicker(open ? 'to' : null)}
                align="right"
              />
            </div>

            <button
              className="h-9 w-[92px] flex-shrink-0 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 text-emerald-800 text-[12px] font-bold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={availabilityLoading || !propertyId}
              type="submit"
            >
              {availabilityLoading ? 'Loading...' : 'Check'}
            </button>
          </div>
        </div>
      </form>

      {/* ── Tab bar ── */}
      <div className="bg-white border-b border-black/[0.06] px-5 lg:px-8 flex-shrink-0">
        <div className="flex items-center">
          {(
            [
              { id: 'overview', label: 'Overview' },
              { id: 'calendar', label: 'Inventory calendar' },
              {
                id: 'exceptions',
                label: `Exceptions${inventoryExceptionRows.length > 0 ? ` (${inventoryExceptionRows.length})` : ''}`,
              },
            ] as { id: ActiveTab; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 text-[12px] font-semibold border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 py-5 flex flex-col gap-5">

        {/* ── Error ── */}
        {(propertiesState.error || categoriesState.error || error) && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl px-5 py-4 flex items-start gap-3">
            <svg className="w-4 h-4 text-rose-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" /><path d="m15 9-6 6M9 9l6 6" strokeLinecap="round" />
            </svg>
            <p className="text-sm text-rose-700 font-medium">{propertiesState.error ?? categoriesState.error ?? error}</p>
          </div>
        )}

        {/* ── Empty / initial state ── */}
        {!displayedAvailability && !isLoading && !error && (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
              <CalendarIcon className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-[13px] font-semibold text-slate-500">
              Select a property and date range, then click Check
            </p>
          </div>
        )}

        {displayedAvailability && (
          <>
            {/* ── KPI strip ── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'Available room-nights', value: windowSummary.availableRoomNights, sub: `${windowSummary.availableRate}% open`, dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700' },
                { label: 'Booked room-nights', value: windowSummary.bookedRoomNights, sub: `${windowSummary.bookedRate}% booked`, dot: 'bg-sky-400', badge: 'bg-sky-50 text-sky-700' },
                { label: 'Blocked room-nights', value: windowSummary.blockedRoomNights, sub: `${windowSummary.blockedRate}% blocked`, dot: 'bg-amber-400', badge: 'bg-amber-50 text-amber-700' },
                { label: 'Sold-out dates', value: windowSummary.soldOutDates, sub: `${stopSellCount} stop sell · ${restrictedNightCount} restricted`, dot: 'bg-rose-400', badge: 'bg-rose-50 text-rose-700' },
              ].map(({ label, value, sub, dot, badge }) => (
                <div key={label} className="bg-white rounded-xl border border-black/[0.06] px-5 py-4 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
                      <span className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider leading-tight">{label}</span>
                    </div>
                    <p className="text-[28px] font-extrabold text-slate-900 leading-none">{value}</p>
                    <p className="text-[11px] text-slate-400 font-medium mt-1.5">{sub}</p>
                  </div>
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full flex-shrink-0 ${badge}`}>{value}</span>
                </div>
              ))}
            </div>

            {/* ── Occupancy bar with per-category breakdown ── */}
            <div className="bg-white rounded-xl border border-black/[0.06] px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">
                  Window occupancy — {windowSummary.totalRoomNights} total room-nights
                </p>
                <div className="flex items-center gap-5">
                  {[
                    { dot: 'bg-emerald-500', label: `Open ${windowSummary.availableRoomNights}` },
                    { dot: 'bg-sky-400', label: `Booked ${windowSummary.bookedRoomNights}` },
                    { dot: 'bg-amber-400', label: `Blocked ${windowSummary.blockedRoomNights}` },
                  ].map(({ dot, label }) => (
                    <span key={label} className="flex items-center gap-1.5 text-[11px] text-slate-500 font-semibold">
                      <i className={`w-2 h-2 rounded-full not-italic ${dot}`} />
                      {label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="h-2 rounded-full overflow-hidden bg-slate-100 flex">
                <span className="bg-emerald-500 h-full" style={{ width: `${windowSummary.availableRate}%` }} />
                <span className="bg-sky-400 h-full" style={{ width: `${windowSummary.bookedRate}%` }} />
                <span className="bg-amber-400 h-full" style={{ width: `${windowSummary.blockedRate}%` }} />
              </div>

              {/* Per-category mini bars */}
              {(displayedAvailability.categories ?? []).length > 0 && (
                <div className="mt-4 space-y-2.5">
                  {(displayedAvailability.categories ?? []).map((cat) => {
                    const s = inventoryCategoryById.get(cat.room_category_id);
                    const total = s?.totalRoomNights ?? cat.total_inventory;
                    const avail = s?.availableRoomNights ?? cat.available;
                    const booked = s?.bookedRoomNights ?? cat.reserved_room_stays;
                    const blocked = s?.blockedRoomNights ?? cat.out_of_service;
                    const ap = total === 0 ? 0 : Math.round((avail / total) * 100);
                    const bp = total === 0 ? 0 : Math.round((booked / total) * 100);
                    const blp = total === 0 ? 0 : Math.round((blocked / total) * 100);
                    return (
                      <div key={cat.room_category_id} className="flex items-center gap-4">
                        <p className="w-32 text-[11px] font-semibold text-slate-600 truncate flex-shrink-0">{cat.name}</p>
                        <div className="h-1.5 rounded-full overflow-hidden bg-slate-100 flex flex-1 mr-2">
                          <span className="bg-emerald-500 h-full" style={{ width: `${ap}%` }} />
                          <span className="bg-sky-400 h-full" style={{ width: `${bp}%` }} />
                          <span className="bg-amber-400 h-full" style={{ width: `${blp}%` }} />
                        </div>
                        <div className="w-36 text-right flex-shrink-0 flex items-center justify-end gap-2">
                          <span className={`text-[11px] font-bold ${avail === 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {avail} open
                          </span>
                          {cat.lowest_rate != null && (
                            <span className="text-[11px] text-slate-400">{formatCurrency(cat.lowest_rate)}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Overview tab ── */}
            {activeTab === 'overview' && (
              <div className={roomCategoryGridClass((displayedAvailability.categories ?? []).length)}>
                {(displayedAvailability.categories ?? []).map((cat) => {
                  const s = inventoryCategoryById.get(cat.room_category_id);
                  const total = s?.totalRoomNights ?? cat.total_inventory;
                  const avail = s?.availableRoomNights ?? cat.available;
                  const booked = s?.bookedRoomNights ?? cat.reserved_room_stays;
                  const blocked = s?.blockedRoomNights ?? cat.out_of_service;
                  const ap = total === 0 ? 0 : Math.min(100, Math.round((avail / total) * 100));
                  const bp = total === 0 ? 0 : Math.min(100, Math.round((booked / total) * 100));
                  const blp = total === 0 ? 0 : Math.min(100, Math.round((blocked / total) * 100));
                  const isSel = selectedCatId === cat.room_category_id;
                  const isSoldOut = avail <= 0;

                  const catCalRows = displayedInventoryCalendar?.categories?.find(
                    (c) => c.room_category_id === cat.room_category_id,
                  )?.rows.sort((a, b) => a.date.localeCompare(b.date)) ?? [];

                  return (
                    <article
                      key={cat.room_category_id}
                      onClick={() => setSelectedCatId(isSel ? null : cat.room_category_id)}
                      className={`bg-white rounded-xl border overflow-hidden transition-all cursor-pointer ${
                        isSel
                          ? 'border-sky-200 shadow-sm ring-2 ring-sky-100'
                          : 'border-black/[0.06] hover:border-black/[0.14]'
                      }`}
                    >
                      <div className="px-5 pt-5 pb-4">
                        {/* Header row */}
                        <div className="flex items-start justify-between gap-3 mb-4">
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Room category</p>
                            <h3 className="text-[13px] font-bold text-slate-900 truncate">{cat.name}</h3>
                            {cat.lowest_rate != null && (
                              <p className="text-[11px] text-slate-400 mt-0.5">From {formatCurrency(cat.lowest_rate)} / night</p>
                            )}
                          </div>
                          <OccupancyRing pct={bp} />
                        </div>

                        {/* Stat row */}
                        <div className="grid grid-cols-3 gap-2 mb-4">
                          {[
                            { label: 'Available', value: avail, color: 'text-emerald-600' },
                            { label: 'Booked', value: booked, color: 'text-sky-600' },
                            { label: 'Blocked', value: blocked, color: 'text-amber-600' },
                          ].map(({ label, value, color }) => (
                            <div key={label} className="bg-[#f9f9f7] rounded-lg px-2 py-2 text-center">
                              <p className={`text-[15px] font-extrabold leading-none ${color}`}>{value}</p>
                              <p className="text-[10px] text-slate-400 font-semibold mt-0.5">{label}</p>
                            </div>
                          ))}
                        </div>

                        {/* Stacked bar */}
                        <div className="space-y-1.5">
                          <div className="h-1.5 rounded-full overflow-hidden bg-slate-100 flex">
                            <span className="bg-emerald-500 h-full" style={{ width: `${ap}%` }} />
                            <span className="bg-sky-400 h-full" style={{ width: `${bp}%` }} />
                            <span className="bg-amber-400 h-full" style={{ width: `${blp}%` }} />
                          </div>
                          <div className="flex items-center justify-between text-[10.5px] font-semibold text-slate-400">
                            <span>{ap}% open</span>
                            <span>{bp}% booked · {blp}% blocked</span>
                          </div>
                        </div>
                      </div>

                      {/* 30-day heatmap strip */}
                      {catCalRows.length > 0 && (
                        <div className="border-t border-black/[0.05] px-5 py-3">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                            {catCalRows.length}-day snapshot
                          </p>
                          <div className="flex gap-0.5">
                            {catCalRows.map((row) => {
                              const tone = availabilityCellTone(row);
                              const weekend = isWeekendDate(row.date);
                              return (
                                <div
                                  key={row.date}
                                  title={`${row.date}: ${row.available_rooms} open`}
                                  className={`flex-1 h-5 rounded-[3px] ${
                                    tone === 'closed' ? 'bg-rose-400' :
                                    tone === 'limited' ? 'bg-amber-300' : 'bg-emerald-300'
                                  } ${weekend ? 'opacity-100' : 'opacity-70'}`}
                                />
                              );
                            })}
                          </div>
                          <div className="flex items-center justify-between mt-1.5 text-[9px] font-semibold text-slate-400">
                            <span>{formatShortDate(catCalRows[0].date)}</span>
                            <span className={`font-bold ${isSoldOut ? 'text-rose-500' : 'text-emerald-600'}`}>
                              {isSoldOut ? 'Sold out' : `${avail} open`}
                            </span>
                            <span>{formatShortDate(catCalRows[catCalRows.length - 1].date)}</span>
                          </div>
                        </div>
                      )}

                      {/* Expanded details when selected */}
                      {isSel && (
                        <div className="border-t border-black/[0.05] px-5 py-3 bg-[#f9f9f7]">
                          <dl className="space-y-1.5">
                            {[
                              ['Total room-nights', total],
                              ['Lowest availability', s?.lowestAvailability ?? cat.available],
                              ['Peak booked', s?.peakBooked ?? cat.reserved_room_stays],
                            ].map(([label, val]) => (
                              <div key={String(label)} className="flex items-center justify-between">
                                <dt className="text-[11px] text-slate-400">{label}</dt>
                                <dd className="text-[11px] font-semibold text-slate-700">{val}</dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}

            {/* ── Calendar tab ── */}
            {activeTab === 'calendar' && displayedInventoryCalendar && (
              <div className="bg-white rounded-xl border border-black/[0.06] overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-black/[0.06]">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Inventory calendar</p>
                    <h3 className="text-[13px] font-bold text-slate-900">Room-type availability board</h3>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-[11px] text-slate-400">{inventoryCalendarRowCount} room-night rows</span>
                    {[
                      { dot: 'bg-emerald-400', label: 'Healthy' },
                      { dot: 'bg-amber-300', label: 'Low' },
                      { dot: 'bg-rose-400', label: 'Sold out' },
                      { dot: 'bg-indigo-400', label: 'Restricted' },
                    ].map(({ dot, label }) => (
                      <span key={label} className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <i className={`w-2.5 h-2.5 rounded-full not-italic ${dot}`} />
                        {label}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="grid" style={{ gridTemplateColumns: '11rem 1fr' }}>
                  {/* Label column */}
                  <div className="border-r border-black/[0.06]">
                    <div className="h-14 bg-[#f9f9f7] border-b border-black/[0.06] flex items-center px-4">
                      <span className="text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">Room type</span>
                    </div>
                    {(displayedInventoryCalendar.categories ?? []).map((cat) => {
                      const summary = inventoryCategorySummaries.find((s) => s.roomCategoryId === cat.room_category_id);
                      return (
                        <div key={cat.room_category_id} className="h-16 border-b border-black/[0.04] last:border-0 bg-white flex items-center px-4 gap-2.5">
                          <div className="min-w-0">
                            <p className="text-[12px] font-bold text-slate-900 truncate">{cat.name}</p>
                            <p className="text-[10.5px] text-slate-400">
                              Avg {summary?.averageAvailable ?? 0} · Low {summary?.minAvailable ?? 0} · {summary?.restrictedRows ?? 0} restricted
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Date grid */}
                  <div className="overflow-x-auto scrollbar-none overscroll-x-contain">
                    <div className="min-w-max" style={{ display: 'grid', gridTemplateColumns: inventoryDateGridTemplate }}>
                      {/* Date headers */}
                      {inventoryCalendarDates.map((date) => {
                        const weekend = isWeekendDate(date);
                        return (
                          <div
                            key={date}
                            className={`h-14 border-b border-r border-black/[0.06] last:border-r-0 flex flex-col items-center justify-center ${weekend ? 'bg-slate-50' : 'bg-[#f9f9f7]'}`}
                          >
                            <span className={`text-[11px] font-bold ${weekend ? 'text-indigo-500' : 'text-slate-500'}`}>
                              {formatShortDate(date)}
                            </span>
                            <span className={`text-[10px] font-medium ${weekend ? 'text-indigo-400' : 'text-slate-400'}`}>
                              {formatWeekday(date)}
                            </span>
                          </div>
                        );
                      })}

                      {/* Cells */}
                      {(displayedInventoryCalendar.categories ?? []).map((cat) => {
                        const rowByDate = new Map(cat.rows.map((r) => [r.date, r]));
                        return inventoryCalendarDates.map((date) => {
                          const row = rowByDate.get(date);
                          const weekend = isWeekendDate(date);
                          if (!row) {
                            return (
                              <div
                                key={`${cat.room_category_id}:${date}`}
                                className={`h-16 border-b border-r border-black/[0.04] last:border-r-0 flex items-center justify-center ${weekend ? 'bg-slate-50/60' : 'bg-white'}`}
                              >
                                <span className="text-xs text-slate-200">—</span>
                              </div>
                            );
                          }
                          const tone = availabilityCellTone(row);
                          const bgMap: Record<string, string> = {
                            healthy: weekend ? 'bg-emerald-50/60' : 'bg-white',
                            limited: 'bg-amber-50',
                            closed: 'bg-rose-50',
                            restricted: 'bg-indigo-50',
                          };
                          const numColor: Record<string, string> = {
                            healthy: 'text-slate-800',
                            limited: 'text-amber-700',
                            closed: 'text-rose-700',
                            restricted: 'text-indigo-700',
                          };
                          return (
                            <div
                              key={`${cat.room_category_id}:${date}`}
                              className={`h-16 border-b border-r border-black/[0.04] last:border-r-0 flex flex-col items-center justify-center gap-0.5 ${bgMap[tone] ?? 'bg-white'}`}
                            >
                              <span className={`text-[14px] font-extrabold leading-none ${numColor[tone] ?? 'text-slate-800'}`}>
                                {row.available_rooms}
                              </span>
                              <span className="text-[10px] text-slate-400 font-medium">{row.reserved_rooms} bkd</span>
                              {row.blocked_rooms > 0 && (
                                <span className="text-[10px] text-amber-600 font-semibold">{row.blocked_rooms} blk</span>
                              )}
                              {hasRestriction(row) && (
                                <span className="text-[9px] text-rose-500 font-semibold">{formatRestrictionSummary(row)}</span>
                              )}
                            </div>
                          );
                        });
                      })}
                    </div>
                  </div>
                </div>

                {/* Legend footer */}
                <div className="flex items-center gap-5 px-5 py-3 border-t border-black/[0.06] bg-[#f9f9f7]">
                  {[
                    { dot: 'bg-emerald-500', label: 'Healthy' },
                    { dot: 'bg-amber-400', label: 'Low inventory' },
                    { dot: 'bg-rose-400', label: 'Sold out / stop sell' },
                    { dot: 'bg-indigo-400', label: 'Restricted' },
                    { dot: 'bg-indigo-300 opacity-60', label: 'Weekend' },
                  ].map(({ dot, label }) => (
                    <span key={label} className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <i className={`w-2.5 h-2.5 rounded-full not-italic inline-block ${dot}`} />
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* ── Exceptions tab ── */}
            {activeTab === 'exceptions' && inventoryExceptionRows.length > 0 && (
                <div className="bg-white rounded-xl border border-black/[0.06] overflow-hidden">
                  <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-black/[0.06]">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-rose-500 mb-0.5">Attention needed</p>
                      <h3 className="text-[13px] font-bold text-slate-900">
                        {inventoryExceptionRows.length} blocked, restricted or sold-out night{inventoryExceptionRows.length !== 1 ? 's' : ''}
                      </h3>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px]">
                      <thead>
                        <tr className="bg-[#f9f9f7] border-b border-black/[0.06]">
                          {['Room type', 'Date', 'Available', 'Blocked', 'Reserved', 'Restriction'].map((h) => (
                            <th key={h} className="px-5 py-2.5 text-left text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {visibleInventoryExceptionRows.map((row) => (
                          <tr key={`${row.roomCategoryId}:${row.date}`} className="border-b border-black/[0.04] last:border-0 hover:bg-slate-50/50 transition-colors">
                            <td className="px-5 py-3.5 text-[12px] font-semibold text-slate-900">{row.roomCategoryName}</td>
                            <td className="px-5 py-3.5 text-[12px] text-slate-600">{row.date}</td>
                            <td className="px-5 py-3.5">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${row.available_rooms <= 0 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
                                {row.available_rooms}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 text-[12px] text-amber-700 font-semibold">{row.blocked_rooms || '—'}</td>
                            <td className="px-5 py-3.5 text-[12px] text-slate-600">{row.reserved_rooms}</td>
                            <td className="px-5 py-3.5">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700">
                                {formatRestrictionSummary(row) || 'Sold out'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {hiddenInventoryExceptionRows > 0 && (
                    <div className="px-5 py-3 border-t border-black/[0.06] bg-[#f9f9f7]">
                      <p className="text-[11px] text-slate-400">{hiddenInventoryExceptionRows} more rows hidden</p>
                    </div>
                  )}
                </div>
            )}

            {/* ── Summary table (always visible) ── */}
            <div className="bg-white rounded-xl border border-black/[0.06] overflow-hidden">
              <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-black/[0.06]">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Room-night summary</p>
                  <h3 className="text-[13px] font-bold text-slate-900">
                    {displayedAvailability.property_name} · {displayedAvailability.from} to {displayedAvailability.to}
                  </h3>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[540px]">
                  <thead>
                    <tr className="bg-[#f9f9f7] border-b border-black/[0.06]">
                      {['Category', 'Total', 'Booked', 'Blocked', 'Available', 'Starting rate'].map((h) => (
                        <th key={h} className="px-5 py-2.5 text-left text-[10.5px] font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(displayedAvailability.categories ?? []).map((cat) => {
                      const s = inventoryCategoryById.get(cat.room_category_id);
                      const avail = s?.availableRoomNights ?? cat.available;
                      return (
                        <tr key={cat.room_category_id} className="border-b border-black/[0.04] last:border-0 hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-3.5 text-[12px] font-semibold text-slate-900">{cat.name}</td>
                          <td className="px-5 py-3.5 text-[12px] text-slate-600">{s?.totalRoomNights ?? cat.total_inventory}</td>
                          <td className="px-5 py-3.5 text-[12px] text-sky-700 font-semibold">{s?.bookedRoomNights ?? cat.reserved_room_stays}</td>
                          <td className="px-5 py-3.5 text-[12px] text-amber-700 font-semibold">{s?.blockedRoomNights ?? cat.out_of_service}</td>
                          <td className="px-5 py-3.5">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${avail > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                              {avail}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-[12px] text-slate-600">
                            {cat.lowest_rate == null ? '—' : formatCurrency(cat.lowest_rate)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

type InventoryCalendarRow = InventoryCalendarSummary['categories'][number]['rows'][number];

function OccupancyRing({ pct }: { pct: number }) {
  const r = 26, cx = 34, cy = 34;
  const circ = 2 * Math.PI * r;
  const dash = Math.min(pct / 100, 1) * circ;
  return (
    <svg width={68} height={68} viewBox="0 0 68 68" className="flex-shrink-0">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f0f0ee" strokeWidth={7} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#38bdf8" strokeWidth={7}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeDashoffset={circ / 4}
        strokeLinecap="round"
      />
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="middle" fontSize={11} fontWeight={700} fill="#0f172a">{pct}%</text>
    </svg>
  );
}

function CompactDateField({
  align = 'left', label, value, onChange, open, setOpen,
}: {
  align?: 'left' | 'right';
  label: string;
  value: string;
  onChange: (v: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const selectedDate = value ? new Date(`${value}T00:00:00.000Z`) : undefined;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-700 hover:text-slate-900 transition-colors"
      >
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
        <span>{value ? formatDatePickerLabel(value) : 'Pick'}</span>
      </button>
      {open && (
        <div className={`absolute top-[2.5rem] z-50 rounded-2xl border border-black/[0.08] bg-white p-3 shadow-2xl ${align === 'right' ? 'right-0' : 'left-0'}`}>
          <DayPicker
            animate
            className="hms-day-picker"
            defaultMonth={selectedDate ?? new Date()}
            fixedWeeks
            mode="single"
            onSelect={(date) => { if (!date) return; onChange(dateToInputValue(date)); setOpen(false); }}
            selected={selectedDate}
            showOutsideDays
            weekStartsOn={1}
          />
        </div>
      )}
    </div>
  );
}

function roomCategoryGridClass(count: number) {
  if (count <= 1) return 'grid grid-cols-1 gap-3';
  if (count === 2) return 'grid grid-cols-1 lg:grid-cols-2 gap-3';
  if (count === 3) return 'grid grid-cols-1 lg:grid-cols-3 gap-3';
  return 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3';
}

function availabilityCellTone(row: InventoryCalendarRow) {
  if (row.stop_sell || row.available_rooms <= 0) return 'closed';
  if (hasRestriction(row)) return 'restricted';
  if (row.available_rooms <= 2 || row.blocked_rooms > 0) return 'limited';
  return 'healthy';
}

function hasRestriction(row: InventoryCalendarRow) {
  return row.stop_sell || row.closed_to_arrival || row.closed_to_departure || row.min_stay != null || row.max_stay != null;
}

function formatRestrictionSummary(row: InventoryCalendarRow) {
  return [
    row.stop_sell ? 'SS' : null,
    row.closed_to_arrival ? 'CTA' : null,
    row.closed_to_departure ? 'CTD' : null,
    row.min_stay != null ? `Min${row.min_stay}` : null,
    row.max_stay != null ? `Max${row.max_stay}` : null,
  ].filter((p): p is string => Boolean(p)).join(' · ');
}

function isWeekendDate(value: string) {
  const day = new Date(`${value}T00:00:00.000Z`).getUTCDay();
  return day === 0 || day === 6;
}

function formatDatePickerLabel(value: string) {
  return new Date(`${value}T00:00:00.000Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function dateToInputValue(value: Date) { return value.toISOString().slice(0, 10); }
function formatShortDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function formatWeekday(value: string) {
  return new Date(`${value}T00:00:00.000Z`).toLocaleDateString(undefined, { weekday: 'short' });
}
function addDays(value: string, days: number) {
  const d = new Date(`${value}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function getPresetRange(preset: Exclude<RangePreset, 'custom'>, today: string) {
  if (preset === 'next_30') return { from: today, to: addDays(today, 29) };
  if (preset === 'next_60') return { from: today, to: addDays(today, 59) };
  if (preset === 'next_90') return { from: today, to: addDays(today, 89) };
  const current = new Date(`${today}T00:00:00.000Z`);
  const monthOffset = preset === 'next_month' ? 1 : 0;
  const start = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + monthOffset, 1));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  return { from: dateToInputValue(start), to: dateToInputValue(end) };
}

function inferRangePreset(from: string, to: string, today: string): RangePreset {
  for (const preset of ['next_30', 'next_60', 'next_90', 'this_month', 'next_month'] as Exclude<RangePreset, 'custom'>[]) {
    const range = getPresetRange(preset, today);
    if (range.from === from && range.to === to) return preset;
  }
  return 'custom';
}

function CalendarIcon({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M7 3v3M17 3v3M4.5 9.5h15M6.5 5h11A2.5 2.5 0 0 1 20 7.5v10A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-10A2.5 2.5 0 0 1 6.5 5Z"
        stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function readPersistedAvailabilityState(): PersistedAvailabilityState | null {
  try {
    const raw = localStorage.getItem(AVAILABILITY_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedAvailabilityState;
  } catch { localStorage.removeItem(AVAILABILITY_STORAGE_KEY); return null; }
}
function writePersistedAvailabilityState(state: PersistedAvailabilityState) {
  localStorage.setItem(AVAILABILITY_STORAGE_KEY, JSON.stringify(state));
}
function clearPersistedAvailabilityState() {
  localStorage.removeItem(AVAILABILITY_STORAGE_KEY);
}
