import { FormEvent, useEffect, useMemo, useState } from 'react';
import { DayPicker } from '@daypicker/react';
import '@daypicker/react/style.css';
import { api, getApiErrorMessage } from '../api/client';
import { fetchAllPages } from '../api/pagination';
import { AvailabilitySummary, InventoryCalendarSummary, Property, RoomCategory } from '../api/types';
import { CustomSelect } from '../components/CustomSelect';
import { useAsync } from '../hooks/useAsync';
import { usePersistedPropertyId } from '../hooks/usePersistedPropertyId';
import { formatCurrency } from '../utils/format';
import { labelCls, primaryBtn, TableCard, Th, Td, ErrorMsg, LoadingMsg, SuccessMsg } from './ui';

const AVAILABILITY_STORAGE_KEY = 'hms_availability_state';
const INVENTORY_CALENDAR_DAYS = 30;
const RANGE_PRESET_OPTIONS = [
  { label: 'Next 30 days', value: 'next_30' },
  { label: 'Next 60 days', value: 'next_60' },
  { label: 'Next 90 days', value: 'next_90' },
  { label: 'This month', value: 'this_month' },
  { label: 'Next month', value: 'next_month' },
  { label: 'Custom dates', value: 'custom' },
] as const;

type RangePreset = (typeof RANGE_PRESET_OPTIONS)[number]['value'];

type PersistedAvailabilityQuery = { propertyId: string; from: string; to: string };
type PersistedAvailabilityState = { lastLoadedQuery: PersistedAvailabilityQuery; availability: AvailabilitySummary; inventoryCalendar: InventoryCalendarSummary };

export function AvailabilityPage() {
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
  const [availability, setAvailability] = useState<AvailabilitySummary | null>(shouldRestorePersistedResults ? persistedAvailabilityState?.availability ?? null : null);
  const [inventoryCalendar, setInventoryCalendar] = useState<InventoryCalendarSummary | null>(shouldRestorePersistedResults ? persistedAvailabilityState?.inventoryCalendar ?? null : null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [lastLoadedQuery, setLastLoadedQuery] = useState<PersistedAvailabilityQuery | null>(shouldRestorePersistedResults ? restoredQuery : null);
  const [openDatePicker, setOpenDatePicker] = useState<'from' | 'to' | null>(null);
  const [rangePreset, setRangePreset] = useState<RangePreset>(
    shouldRestorePersistedResults && restoredQuery ? inferRangePreset(restoredQuery.from, restoredQuery.to, today) : 'next_30',
  );
  const propertiesState = useAsync(async () => fetchAllPages<Property>('/properties'), []);
  const categoriesState = useAsync(async () => fetchAllPages<RoomCategory>('/room-categories'), []);
  const properties = propertiesState.data ?? [];
  const roomCategories = categoriesState.data ?? [];
  const hasLoadedProperties = propertiesState.data != null;
  const selectedPropertyExists = Boolean(propertyId && properties.some((p) => p.id === propertyId));

  useEffect(() => { if (!propertyId && restoredQuery?.propertyId) setPropertyId(restoredQuery.propertyId); }, [propertyId, restoredQuery, setPropertyId]);
  useEffect(() => {
    if (!propertiesState.data) return;
    if (properties.length === 0) { if (propertyId) setPropertyId(''); setAvailability(null); setInventoryCalendar(null); setLastLoadedQuery(null); clearPersistedAvailabilityState(); return; }
    if (!propertyId || !properties.some((p) => p.id === propertyId)) { setPropertyId(properties[0].id); setAvailability(null); setInventoryCalendar(null); setLastLoadedQuery(null); clearPersistedAvailabilityState(); }
  }, [properties, propertyId, setPropertyId]);

  useEffect(() => {
    if (!hasLoadedProperties || !selectedPropertyExists || lastLoadedQuery?.propertyId === propertyId) return;
    void fetchAvailability({ propertyId, from, to });
  }, [from, hasLoadedProperties, lastLoadedQuery?.propertyId, propertyId, selectedPropertyExists, to]);

  const displayedAvailability = hasLoadedProperties && selectedPropertyExists && lastLoadedQuery?.propertyId === propertyId ? availability : null;
  const displayedInventoryCalendar = displayedAvailability ? inventoryCalendar : null;
  const totalInventory = displayedAvailability?.categories.reduce((s, c) => s + c.total_inventory, 0) ?? 0;
  const totalReservedRoomStays = displayedAvailability?.categories.reduce((s, c) => s + c.reserved_room_stays, 0) ?? 0;
  const totalOutOfService = displayedAvailability?.categories.reduce((s, c) => s + c.out_of_service, 0) ?? 0;
  const totalAvailable = displayedAvailability?.categories.reduce((s, c) => s + c.available, 0) ?? 0;
  const sellThroughRate = totalInventory === 0 ? 0 : Math.round((totalReservedRoomStays / totalInventory) * 100);
  const sellableRate = totalInventory === 0 ? 0 : Math.round((totalAvailable / totalInventory) * 100);
  const outOfServiceRate = totalInventory === 0 ? 0 : Math.round((totalOutOfService / totalInventory) * 100);
  const categoryCount = displayedAvailability?.categories.length ?? roomCategories.length;
  const stopSellCount = displayedInventoryCalendar?.categories.reduce((s, c) => s + c.rows.filter((r) => r.stop_sell).length, 0) ?? 0;
  const restrictedNightCount = displayedInventoryCalendar?.categories.reduce((s, c) => s + c.rows.filter((r) => hasRestriction(r)).length, 0) ?? 0;
  const topAvailableCategory = displayedAvailability?.categories.reduce<AvailabilitySummary['categories'][number] | null>((top, c) => (!top || c.available > top.available ? c : top), null);
  const inventoryCalendarRowCount = displayedInventoryCalendar?.categories.reduce((s, c) => s + c.rows.length, 0) ?? 0;
  const inventoryCategorySummaries = displayedInventoryCalendar?.categories.map((cat) => {
    const totalAv = cat.rows.reduce((s, r) => s + r.available_rooms, 0);
    const minAvailable = cat.rows.reduce<number | null>((m, r) => (m == null || r.available_rooms < m ? r.available_rooms : m), null);
    const restrictedRows = cat.rows.filter((r) => hasRestriction(r)).length;
    return { roomCategoryId: cat.room_category_id, name: cat.name, averageAvailable: cat.rows.length === 0 ? 0 : Math.round(totalAv / cat.rows.length), minAvailable: minAvailable ?? 0, restrictedRows };
  }) ?? [];
  const inventoryExceptionRows = displayedInventoryCalendar?.categories.flatMap((cat) => cat.rows.filter((r) => hasRestriction(r) || r.blocked_rooms > 0 || r.available_rooms <= 0).map((r) => ({ ...r, roomCategoryId: cat.room_category_id, roomCategoryName: cat.name }))) ?? [];
  const visibleInventoryExceptionRows = inventoryExceptionRows.slice(0, 12);
  const hiddenInventoryExceptionRows = Math.max(0, inventoryExceptionRows.length - visibleInventoryExceptionRows.length);
  const inventoryCalendarDates = displayedInventoryCalendar ? Array.from(new Set(displayedInventoryCalendar.categories.flatMap((c) => c.rows.map((r) => r.date)))).sort() : [];
  const inventoryDateGridTemplate = `repeat(${Math.max(inventoryCalendarDates.length, 1)}, minmax(5.25rem, 5.25rem))`;

  async function fetchAvailability(query: PersistedAvailabilityQuery) {
    setError(null); setAvailabilityLoading(true);
    try {
      if (!query.propertyId) { setError('Select a property before checking availability.'); return; }
      const [availabilityResponse, inventoryResponse] = await Promise.all([
        api.get<AvailabilitySummary>('/availability', { params: { property_id: query.propertyId, from: query.from, to: query.to } }),
        api.get<InventoryCalendarSummary>('/inventory-calendar', { params: { property_id: query.propertyId, from: query.from, to: query.to } }),
      ]);
      setAvailability(availabilityResponse.data); setInventoryCalendar(inventoryResponse.data); setLastLoadedQuery(query);
      writePersistedAvailabilityState({ lastLoadedQuery: query, availability: availabilityResponse.data, inventoryCalendar: inventoryResponse.data });
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Failed to load availability'); }
    finally { setAvailabilityLoading(false); }
  }

  function loadAvailability(event: FormEvent) {
    event.preventDefault();
    void fetchAvailability({ propertyId, from, to });
  }

  function applyRangePreset(value: string) {
    const preset = value as RangePreset;
    setRangePreset(preset);
    if (preset === 'custom') return;
    const range = getPresetRange(preset, today);
    setFrom(range.from);
    setTo(range.to);
  }

  function updateFromDate(value: string) {
    setFrom(value);
    setRangePreset('custom');
  }

  function updateToDate(value: string) {
    setTo(value);
    setRangePreset('custom');
  }

  return (
    <section className="space-y-5">
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-amber-500 mb-1">Commercial</p>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Availability &amp; Rates</h2>
        <p className="text-sm text-slate-500 mt-1 leading-relaxed max-w-2xl">Control OTA-facing sellable inventory, review rate posture, and manage internal restriction rules from one commercial workspace.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[25rem_minmax(0,1fr)] xl:grid-cols-[27rem_minmax(0,1fr)] gap-5 items-stretch">
        <form className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 min-h-[17.5rem] flex flex-col gap-4" onSubmit={loadAvailability}>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-0.5">Commercial window</p>
            <h3 className="text-base font-bold text-slate-900">Availability query</h3>
          </div>
          <div className="grid grid-cols-2 gap-4 flex-1 content-start">
            <label className={`${labelCls} col-span-2`}><span>Property</span><CustomSelect onChange={setPropertyId} options={properties.map((p) => ({ label: p.name, value: p.id }))} placeholder="Select property" value={propertyId} /></label>
            <label className={`${labelCls} col-span-2`}><span>Range</span><CustomSelect onChange={applyRangePreset} options={[...RANGE_PRESET_OPTIONS]} value={rangePreset} /></label>
            <DatePickerField label="From" onChange={updateFromDate} open={openDatePicker === 'from'} setOpen={(open) => setOpenDatePicker(open ? 'from' : null)} value={from} />
            <DatePickerField align="right" label="To" onChange={updateToDate} open={openDatePicker === 'to'} setOpen={(open) => setOpenDatePicker(open ? 'to' : null)} value={to} />
          </div>
          <button className={primaryBtn + ' w-full justify-center'} disabled={availabilityLoading} type="submit">{availabilityLoading ? 'Loading…' : 'Check availability'}</button>
        </form>

        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 min-h-[17.5rem] flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-0.5">Window posture</p>
              <h3 className="text-base font-bold text-slate-900">Availability snapshot</h3>
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700">{totalAvailable} sellable</span>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_18rem] gap-4 flex-1">
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-4 flex flex-col justify-between gap-4">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Sellable inventory</span>
                  <strong className="mt-1 block text-3xl font-extrabold leading-none text-slate-900">{totalAvailable}</strong>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-emerald-700">{sellableRate}% open</span>
                  <span className="block text-[11px] font-semibold text-slate-400">{totalInventory} total keys</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex h-2.5 overflow-hidden rounded-full bg-white">
                  <span className="bg-emerald-500" style={{ width: `${sellableRate}%` }} />
                  <span className="bg-sky-400" style={{ width: `${sellThroughRate}%` }} />
                  <span className="bg-amber-400" style={{ width: `${outOfServiceRate}%` }} />
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px] font-semibold text-slate-500">
                  <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-emerald-500 not-italic" />Open {totalAvailable}</span>
                  <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-sky-400 not-italic" />Booked {totalReservedRoomStays}</span>
                  <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-amber-400 not-italic" />Out {totalOutOfService}</span>
                </div>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-2">
              {[
                ['Room types', categoryCount.toString()],
                ['Committed', `${sellThroughRate}%`],
                ['Restricted', restrictedNightCount.toString()],
                ['Stop sell', stopSellCount.toString()],
                ['Property', displayedAvailability?.property_name ?? 'Not loaded'],
                ['Window', displayedAvailability ? `${displayedAvailability.from} to ${displayedAvailability.to}` : `${from} to ${to}`],
              ].map(([dt, dd]) => (
                <div key={String(dt)} className="rounded-lg border border-slate-100 bg-white px-3 py-2">
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{dt}</dt>
                  <dd className="mt-0.5 truncate text-xs font-semibold text-slate-700" title={String(dd)}>{dd}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>

      {(propertiesState.loading || categoriesState.loading || availabilityLoading) && <LoadingMsg>{availabilityLoading ? 'Loading 30-day availability…' : 'Loading properties and room types…'}</LoadingMsg>}
      {(propertiesState.error || categoriesState.error || error) && <ErrorMsg>{propertiesState.error ?? categoriesState.error ?? error}</ErrorMsg>}
      {actionStatus && <SuccessMsg>{actionStatus}</SuccessMsg>}
      {actionError && <ErrorMsg>{actionError}</ErrorMsg>}

      {displayedAvailability && (
        <>
          <div className="flex gap-3 items-start bg-indigo-50 border border-indigo-200 rounded-xl p-4 text-sm">
            <strong className="text-indigo-800 flex-shrink-0">Commercial view</strong>
            <span className="text-indigo-700 leading-relaxed">{sellThroughRate}% of inventory is already committed by imported room stays in this window. Use the category board below to see which room groups still have clean sellable depth.</span>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-0.5">Best remaining depth</p>
              <h3 className="text-sm font-bold text-slate-900 mb-1">{topAvailableCategory?.name ?? 'No category loaded'}</h3>
              <strong className="text-2xl font-extrabold text-slate-900 block">{topAvailableCategory?.available ?? 0}</strong>
              <span className="text-xs text-slate-500">Starting rate {topAvailableCategory?.lowest_rate == null ? '—' : formatCurrency(topAvailableCategory.lowest_rate)}</span>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-0.5">Committed inventory</p>
              <h3 className="text-sm font-bold text-slate-900 mb-1">{sellThroughRate}% sold</h3>
              <strong className="text-2xl font-extrabold text-slate-900 block">{totalReservedRoomStays}</strong>
              <span className="text-xs text-slate-500">reserved room stays · {totalAvailable} still sellable</span>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-0.5">Restriction posture</p>
              <h3 className="text-sm font-bold text-slate-900 mb-1">{stopSellCount} stop-sell nights</h3>
              <strong className="text-2xl font-extrabold text-slate-900 block">{restrictedNightCount}</strong>
              <span className="text-xs text-slate-500">restricted room nights including min/max-stay rules</span>
            </div>
          </div>

          <div className={roomCategoryGridClass(displayedAvailability.categories.length)}>
            {displayedAvailability.categories.map((cat) => {
              const committedPercent = cat.total_inventory === 0 ? 0 : Math.min(100, Math.round((cat.reserved_room_stays / cat.total_inventory) * 100));
              const maintenancePercent = cat.total_inventory === 0 ? 0 : Math.min(100, Math.round((cat.out_of_service / cat.total_inventory) * 100));
              const expandedCard = displayedAvailability.categories.length === 2;
              return (
                <article key={cat.room_category_id} className={`bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-3 ${expandedCard ? 'lg:min-h-[18rem]' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-0.5">Room category</p>
                      <h3 className="text-sm font-bold text-slate-900">{cat.name}</h3>
                    </div>
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-[11px] font-bold ${cat.available > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{cat.available} left</span>
                  </div>
                  <div className="space-y-1">
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full flex">
                        <span className="bg-sky-400 h-full transition-all" style={{ width: `${committedPercent}%` }} />
                        <span className="bg-amber-400 h-full transition-all" style={{ width: `${maintenancePercent}%` }} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>{committedPercent}% committed</span>
                      <span>{maintenancePercent}% out</span>
                    </div>
                  </div>
                  <dl className="space-y-1">
                    {[['Total', cat.total_inventory.toString()], ['Reserved stays', cat.reserved_room_stays.toString()], ['Out of service', cat.out_of_service.toString()], ['Starting rate', cat.lowest_rate == null ? '—' : formatCurrency(cat.lowest_rate)]].map(([dt, dd]) => (
                      <div key={String(dt)} className="flex items-center justify-between text-xs">
                        <dt className="text-slate-400">{dt}</dt>
                        <dd className="text-slate-700 font-semibold">{dd}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
              );
            })}
          </div>

          {displayedInventoryCalendar && (
            <>
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-slate-100">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-0.5">Inventory calendar</p>
                    <h3 className="text-sm font-bold text-slate-900">Room-type availability board</h3>
                  </div>
                  <span className="text-xs text-slate-400">{inventoryCalendarRowCount} room-night rows in this query</span>
                </div>
                <div className="grid grid-cols-[13rem_minmax(0,1fr)]">
                  <div>
                    <div className="px-4 py-2.5 min-h-[3.75rem] bg-slate-50 border-b border-r border-slate-100 text-xs font-bold text-slate-600 flex items-center">Room type</div>
                    {displayedInventoryCalendar.categories.map((cat) => {
                      const summary = inventoryCategorySummaries.find((s) => s.roomCategoryId === cat.room_category_id);
                      return (
                        <div key={cat.room_category_id} className="px-4 py-3 min-h-[4.75rem] border-b border-r border-slate-100 bg-white">
                          <strong className="text-xs font-bold text-slate-900 block">{cat.name}</strong>
                          <span className="text-[11px] text-slate-400">Avg {summary?.averageAvailable ?? 0} · Low {summary?.minAvailable ?? 0} · {summary?.restrictedRows ?? 0} restricted</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="scrollbar-none overflow-x-auto overscroll-x-contain">
                    <div className="min-w-max" style={{ display: 'grid', gridTemplateColumns: inventoryDateGridTemplate }}>
                      {inventoryCalendarDates.map((date) => (
                        <div key={date} className="px-2 py-2.5 min-h-[3.75rem] bg-slate-50 border-b border-r border-slate-100 last:border-r-0 text-center">
                          <strong className="block text-[10px] font-bold text-slate-500">{formatShortDate(date)}</strong>
                          <span className="text-[10px] text-slate-400">{formatWeekday(date)}</span>
                        </div>
                      ))}
                      {displayedInventoryCalendar.categories.map((cat) => {
                        const rowByDate = new Map(cat.rows.map((r) => [r.date, r]));
                        return inventoryCalendarDates.map((date) => {
                          const row = rowByDate.get(date);
                          if (!row) return <div key={`${cat.room_category_id}:${date}`} className="min-h-[4.75rem] border-b border-r border-slate-50 last:border-r-0 p-2 bg-white flex items-center justify-center"><strong className="text-xs text-slate-300">—</strong></div>;
                          const tone = availabilityCellTone(row);
                          const toneMap: Record<string, string> = { healthy: 'bg-emerald-50', limited: 'bg-amber-50', closed: 'bg-rose-50', restricted: 'bg-indigo-50' };
                          return (
                            <div key={`${cat.room_category_id}:${date}`} className={`min-h-[4.75rem] border-b border-r border-slate-50 last:border-r-0 p-2 ${toneMap[tone] ?? 'bg-white'}`}>
                              <strong className="text-xs font-bold text-slate-900 block text-center">{row.available_rooms}</strong>
                              <span className="text-[10px] text-slate-500 block text-center">{row.reserved_rooms} bkd</span>
                              {row.blocked_rooms > 0 && <em className="text-[10px] text-amber-600 block text-center not-italic">{row.blocked_rooms} blk</em>}
                              {hasRestriction(row) && <small className="text-[10px] text-rose-500 block text-center">{formatRestrictionSummary(row)}</small>}
                            </div>
                          );
                        });
                      })}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 px-5 py-3 border-t border-slate-100 bg-slate-50">
                  {[{ tone: 'bg-emerald-400', label: 'Healthy' }, { tone: 'bg-amber-400', label: 'Low inventory' }, { tone: 'bg-rose-400', label: 'Sold out or stop sell' }, { tone: 'bg-indigo-400', label: 'Restricted' }].map((item) => (
                    <span key={item.label} className="flex items-center gap-1.5 text-xs text-slate-500">
                      <i className={`w-2.5 h-2.5 rounded-full ${item.tone} not-italic inline-block`} />
                      {item.label}
                    </span>
                  ))}
                </div>
              </div>

              {inventoryExceptionRows.length > 0 && (
                <TableCard title={`${inventoryExceptionRows.length} attention rows`} eyebrow="Attention needed — blocked, restricted, or sold-out nights">
                  <table className="w-full min-w-[500px]">
                    <thead><tr className="bg-slate-50 border-b border-slate-100"><Th>Room type</Th><Th>Date</Th><Th>Available</Th><Th>Blocked</Th><Th>Reserved</Th><Th>Rule</Th></tr></thead>
                    <tbody>
                      {visibleInventoryExceptionRows.map((row) => (
                        <tr key={`${row.roomCategoryId}:${row.date}`} className="hover:bg-slate-50/60 border-b border-slate-50 last:border-0">
                          <Td>{row.roomCategoryName}</Td><Td>{row.date}</Td><Td>{row.available_rooms}</Td><Td>{row.blocked_rooms}</Td><Td>{row.reserved_rooms}</Td>
                          <Td className="text-xs text-rose-600">
                            {formatRestrictionSummary(row) || '—'}
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {hiddenInventoryExceptionRows > 0 && <p className="text-xs text-slate-400 px-4 py-2 border-t border-slate-100">{hiddenInventoryExceptionRows} more hidden</p>}
                </TableCard>
              )}
            </>
          )}

          <TableCard title={`${displayedAvailability.property_name}: ${displayedAvailability.from} to ${displayedAvailability.to}`} eyebrow="Rate posture">
            <table className="w-full min-w-[500px]">
              <thead><tr className="bg-slate-50 border-b border-slate-100"><Th>Category</Th><Th>Total</Th><Th>Booked</Th><Th>Out of service</Th><Th>Available</Th><Th>Starting rate</Th></tr></thead>
              <tbody>
                {displayedAvailability.categories.map((cat) => (
                  <tr key={cat.room_category_id} className="hover:bg-slate-50/60 border-b border-slate-50 last:border-0">
                    <Td className="font-medium text-slate-900">{cat.name}</Td>
                    <Td>{cat.total_inventory}</Td>
                    <Td>{cat.reserved_room_stays}</Td>
                    <Td>{cat.out_of_service}</Td>
                    <Td><span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${cat.available > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{cat.available}</span></Td>
                    <Td>{cat.lowest_rate == null ? '—' : formatCurrency(cat.lowest_rate)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>
        </>
      )}
    </section>
  );
}

type InventoryCalendarRow = InventoryCalendarSummary['categories'][number]['rows'][number];

function DatePickerField({ align = 'left', label, onChange, open, setOpen, value }: {
  align?: 'left' | 'right';
  label: string;
  onChange: (value: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  value: string;
}) {
  const selectedDate = parseDateValue(value);
  return (
    <div className={labelCls}>
      <span>{label}</span>
      <div className="relative">
        <button
          className="flex min-h-11 w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          onClick={() => setOpen(!open)}
          type="button"
        >
          <span>{value ? formatDatePickerLabel(value) : 'Pick a date'}</span>
          <CalendarIcon className="h-4 w-4 text-slate-400" />
        </button>
        {open && (
          <div className={`absolute top-[3rem] z-30 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl ${align === 'right' ? 'right-0' : 'left-0'}`}>
            <DayPicker
              animate
              className="hms-day-picker"
              defaultMonth={selectedDate ?? new Date()}
              fixedWeeks
              mode="single"
              onSelect={(date) => {
                if (!date) return;
                onChange(dateToInputValue(date));
                setOpen(false);
              }}
              selected={selectedDate}
              showOutsideDays
              weekStartsOn={1}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function roomCategoryGridClass(count: number) {
  if (count <= 1) return 'grid grid-cols-1 gap-4';
  if (count === 2) return 'grid grid-cols-1 lg:grid-cols-2 gap-4';
  if (count === 3) return 'grid grid-cols-1 lg:grid-cols-3 gap-4';
  return 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4';
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

function formatDatePickerLabel(value: string) { return new Date(`${value}T00:00:00.000Z`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); }
function parseDateValue(value: string) { if (!value) return undefined; return new Date(`${value}T00:00:00.000Z`); }
function dateToInputValue(value: Date) { return value.toISOString().slice(0, 10); }
function formatShortDate(value: string) { return new Date(`${value}T00:00:00.000Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
function formatWeekday(value: string) { return new Date(`${value}T00:00:00.000Z`).toLocaleDateString(undefined, { weekday: 'short' }); }
function addDays(value: string, days: number) { const d = new Date(`${value}T00:00:00.000Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
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
      <path d="M7 3v3M17 3v3M4.5 9.5h15M6.5 5h11A2.5 2.5 0 0 1 20 7.5v10A2.5 2.5 0 0 1 17.5 20h-11A2.5 2.5 0 0 1 4 17.5v-10A2.5 2.5 0 0 1 6.5 5Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function readPersistedAvailabilityState(): PersistedAvailabilityState | null {
  try { const raw = localStorage.getItem(AVAILABILITY_STORAGE_KEY); if (!raw) return null; return JSON.parse(raw) as PersistedAvailabilityState; }
  catch { localStorage.removeItem(AVAILABILITY_STORAGE_KEY); return null; }
}
function writePersistedAvailabilityState(state: PersistedAvailabilityState) { localStorage.setItem(AVAILABILITY_STORAGE_KEY, JSON.stringify(state)); }
function clearPersistedAvailabilityState() { localStorage.removeItem(AVAILABILITY_STORAGE_KEY); }
