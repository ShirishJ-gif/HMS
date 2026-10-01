import { DatePickerInput } from '../components/DatePickerInput';
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { Ban, Check, ChevronLeft, ChevronRight, Download, Pencil, Plus, ReceiptText, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown, Search, SlidersHorizontal, X } from 'lucide-react';
import { api, getApiErrorMessage } from '../api/client';
import { PaginatedResponse } from '../api/pagination';
import { Property, ReservationGroup } from '../api/types';
import { getStoredAccessToken, getStoredAuthUser } from '../api/session';
import { useWorkspaceState } from '../hooks/useWorkspaceState';
import { useAsync } from '../hooks/useAsync';
import { ExpenseActions } from '../components/ExpenseActions';
import { ActionBtn, ErrorMsg, FloatingSuccessToast, inputCls, labelCls, searchInputCls } from './ui';

type Expense = {
  id: string; property_id: string; expense_date: string; category: string;
  vendor: string | null; vendor_contact: string | null; description: string;
  amount: number; currency: string; amount_paid: number | null; balance_due: number | null;
  payment_mode: string | null; payment_status: string; invoice_number: string | null;
  reservation_group_id: string | null; reservation_reference: string | null;
  status: string; version: number; void_reason: string | null; created_by_user_id: string | null;
  receipts: Array<{ id: string; name: string }>;
  property: Pick<Property, 'id' | 'name' | 'code'>;
};
type ExpenseResponse = PaginatedResponse<Expense> & { summary: { totals: Array<{ currency: string; total_amount: number; recorded_paid: number; outstanding: number; unknown_payment_count: number; unknown_payment_amount: number }> } };
type HistoryEntry = { id: string; summary: string; createdAt: string; user: { name: string } | null; metadata: { reason?: string; before?: Record<string, unknown>; after?: Record<string, unknown> } | null };

// Survives page navigation, stays in memory, and is discarded on session change.
const expenseCache = new Map<string, { data: ExpenseResponse; loadedAt: number }>();
let expenseCacheSession: string | null = null;
const EXPENSE_CACHE_MS = 60_000;

const categories = ['PROPERTY_EXPENSE', 'BOOKING_EXPENSE', 'UTILITIES', 'HOUSEKEEPING', 'MAINTENANCE', 'SUPPLIES', 'SALARIES', 'COMMISSIONS', 'FOOD_BEVERAGE', 'TRANSPORT', 'OTHER'];
const modes = ['CASH', 'UPI', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'OTHER'];
const label = (value: string) => value === 'UNKNOWN' ? 'Unspecified' : value.toLowerCase().replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
const money = (value: number, currency: string) => `${currency} ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => { const date = new Date(); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

function Badge({ value }: { value: string }) {
  const tone = value === 'VOID' ? 'bg-rose-50 text-rose-700' : value === 'PAID' || value === 'APPROVED' ? 'bg-emerald-50 text-emerald-700' : value === 'PENDING' || value === 'PARTIAL' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600';
  return <span className={`inline-block whitespace-nowrap rounded px-2 py-1 text-[10px] font-semibold ${tone}`}>{label(value)}</span>;
}

function ExpensePayment({ expense }: { expense: Expense }) {
  if (expense.amount_paid == null) return <span className="text-xs text-slate-400">Not recorded</span>;
  return <div className="space-y-1.5">
    <Badge value={expense.payment_status} />
    <p className={`text-[11px] tabular-nums ${expense.balance_due != null && expense.balance_due > 0 ? 'text-amber-700' : 'text-slate-500'}`}>
      {expense.balance_due != null && expense.balance_due > 0 ? `${money(expense.balance_due, expense.currency)} due` : `${money(expense.amount_paid, expense.currency)} paid`}
    </p>
    {expense.payment_status === 'PARTIAL' && <p className="text-[11px] tabular-nums text-slate-500">{money(expense.amount_paid, expense.currency)} paid</p>}
  </div>;
}

function Dialog({ title, close, children, busy = false, compact = false }: { title: string; close: () => void; children: ReactNode; busy?: boolean; compact?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} aria-label={title} onCancel={event => { event.preventDefault(); if (!busy) close(); }} className={`m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] ${compact ? 'max-w-lg' : 'max-w-2xl'} overflow-y-auto rounded-lg border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-black/30`}>
    <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4"><h2 className="text-base font-bold">{title}</h2><button type="button" onClick={close} disabled={busy} title="Close" aria-label="Close" className="grid h-8 w-8 shrink-0 place-items-center rounded hover:bg-slate-100 disabled:opacity-40"><X size={18} /></button></header>
    <div className="p-5">{children}</div>
  </dialog>;
}

function ExpenseForm({ expense, properties, propertyId, onSaved, close }: { expense?: Expense; properties: Property[]; propertyId: string; onSaved: (expense: Expense, receiptError?: string) => void; close: () => void }) {
  const [form, setForm] = useState({
    property_id: expense?.property_id || propertyId || (properties.length === 1 ? properties[0].id : ''),
    expense_date: expense?.expense_date || today(), category: expense?.category || 'PROPERTY_EXPENSE',
    description: expense?.description || '', vendor: expense?.vendor || '', vendor_contact: expense?.vendor_contact || '',
    amount: expense ? String(expense.amount) : '', currency: expense?.currency || 'INR',
    amount_paid: expense ? (expense.amount_paid == null ? '' : String(expense.amount_paid)) : '0',
    payment_mode: expense?.payment_mode ? (modes.includes(expense.payment_mode) ? expense.payment_mode : 'OTHER') : 'CASH', invoice_number: expense?.invoice_number || '',
    reservation_group_id: expense?.reservation_group_id || '', reason: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [receiptFiles, setReceiptFiles] = useState<File[]>([]);
  const [paidInFull, setPaidInFull] = useState(false);
  const [bookingSearch, setBookingSearch] = useState('');
  const [debouncedBookingSearch, setDebouncedBookingSearch] = useState('');
  const [linkReservation, setLinkReservation] = useState(Boolean(expense?.reservation_group_id));
  const [selectedReservationLabel, setSelectedReservationLabel] = useState(expense?.reservation_reference || 'Selected reservation');
  const bookingExpense = form.category === 'BOOKING_EXPENSE';
  const showReservation = bookingExpense || linkReservation;
  const reservationRequired = bookingExpense && !(expense?.category === 'BOOKING_EXPENSE' && !expense.reservation_group_id);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedBookingSearch(bookingSearch.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [bookingSearch]);
  const bookingState = useAsync(async () => {
    if (!showReservation || !form.property_id) return [];
    const response = await api.get<PaginatedResponse<ReservationGroup>>('/bookings/groups', { params: { property_id: form.property_id, search: debouncedBookingSearch || undefined, limit: 50 } });
    return response.data.data.filter(group => group.property.id === form.property_id);
  }, [form.property_id, debouncedBookingSearch, showReservation]);
  const reservations = (bookingState.data ?? []).filter(group => group.property.id === form.property_id);
  const change = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value, ...(key === 'amount' && paidInFull ? { amount_paid: value } : {}), ...(key === 'property_id' ? { reservation_group_id: '' } : {}) }));
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const { reason, ...values } = form;
      const payload = { ...values, description: values.description.trim(), reservation_group_id: values.reservation_group_id || null, amount_paid: values.amount_paid === '' ? null : values.amount_paid };
      const response = expense
        ? await api.put<Expense>(`/expenses/${expense.id}`, { ...payload, version: expense.version, reason: reason.trim() })
        : await api.post<Expense>('/expenses', payload);
      const saved = response.data;
      const failures: string[] = [];
      for (const file of receiptFiles) {
        try {
          const body = new FormData(); body.append('receipt', file);
          const receipt = await api.post<{ id: string; name: string }>(`/expenses/${saved.id}/receipts`, body, { headers: { 'Content-Type': 'multipart/form-data' } });
          saved.receipts.push(receipt.data);
        } catch (err) { failures.push(`${file.name}: ${getApiErrorMessage(err)}`); }
      }
      onSaved(saved, failures.length ? `Expense saved. Some receipts could not be attached: ${failures.join('; ')}. Attach them below; do not create the expense again.` : undefined);
    } catch (err) { setError(getApiErrorMessage(err)); }
    finally { setBusy(false); }
  }
  return <Dialog title={expense ? 'Edit expense' : 'New expense'} close={close} busy={busy}>
    <form onSubmit={save} className="space-y-4">
      {error && <ErrorMsg>{error}</ErrorMsg>}
      <fieldset disabled={busy} className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={labelCls}>Property<select required disabled={Boolean(expense || propertyId)} value={form.property_id} onChange={event => change('property_id', event.target.value)} className={inputCls}><option value="">Select property</option>{properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className={labelCls}>Date<DatePickerInput label="Expense date" required value={form.expense_date} onChange={value => change('expense_date', value)} className={inputCls} /></label>
        <label className={labelCls}>Category<select value={form.category} onChange={event => change('category', event.target.value)} className={inputCls}>{categories.map(c => <option key={c} value={c}>{label(c)}</option>)}</select></label>
        <label className={labelCls}>Invoice / reference<input maxLength={100} value={form.invoice_number} onChange={event => change('invoice_number', event.target.value)} className={inputCls} /></label>
        <label className={`${labelCls} sm:col-span-2`}>Description<input required maxLength={300} value={form.description} onChange={event => change('description', event.target.value)} className={inputCls} /></label>
        <label className={labelCls}>Amount<input required type="number" min="0.01" max="99999999.99" step="0.01" value={form.amount} onChange={event => change('amount', event.target.value)} className={inputCls} /></label>
        <label className={labelCls}>Currency<input required pattern="[A-Z]{3}" maxLength={3} title="Three-letter currency code" value={form.currency} onChange={event => change('currency', event.target.value.toUpperCase())} className={inputCls} /></label>
        <label className={labelCls}>Amount paid<input type="number" min="0" max={form.amount || undefined} step="0.01" placeholder="Unspecified" value={form.amount_paid} onChange={event => { setPaidInFull(false); change('amount_paid', event.target.value); }} className={inputCls} /></label>
        <label className={labelCls}>Payment mode<select value={form.payment_mode} onChange={event => change('payment_mode', event.target.value)} className={inputCls}>{!modes.includes(form.payment_mode) && <option value={form.payment_mode}>{form.payment_mode}</option>}{modes.map(mode => <option key={mode} value={mode}>{label(mode)}</option>)}</select></label>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3 sm:col-span-2">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={paidInFull} onChange={event => { setPaidInFull(event.target.checked); if (event.target.checked) change('amount_paid', form.amount); }} className="h-4 w-4 accent-emerald-600" />Paid in full</label>
          <p aria-live="polite" className="text-xs text-slate-600">Remaining balance: <strong className="tabular-nums">{form.amount_paid === '' ? 'Payment not recorded' : !form.amount || !Number.isFinite(Number(form.amount)) ? '—' : Number(form.amount_paid) > Number(form.amount) ? 'Paid amount exceeds expense' : money(Math.round((Number(form.amount) - Number(form.amount_paid)) * 100) / 100, form.currency)}</strong></p>
        </div>
        <label className={labelCls}>Vendor<input maxLength={160} value={form.vendor} onChange={event => change('vendor', event.target.value)} className={inputCls} /></label>
        <label className={labelCls}>Vendor contact<input maxLength={80} value={form.vendor_contact} onChange={event => change('vendor_contact', event.target.value)} className={inputCls} /></label>
        <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/60 p-4 sm:col-span-2">
          {bookingExpense ? <p className="text-xs font-semibold text-slate-700">Reservation {reservationRequired ? '(required for booking expenses)' : '(optional for this existing expense)'}</p> : <label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={linkReservation} onChange={event => { setLinkReservation(event.target.checked); if (!event.target.checked) change('reservation_group_id', ''); }} className="h-4 w-4 accent-emerald-600" />Link to a reservation <span className="font-normal text-slate-500">(optional)</span></label>}
          <p className="text-xs leading-relaxed text-slate-500">{showReservation ? 'Track a cost against a specific stay, such as a guest transfer or booking commission. This does not charge the guest or change their bill.' : 'General property costs do not need a reservation. Use this only when the cost relates to a specific stay.'}</p>
          {showReservation && <>
            {!form.property_id && <p className="text-xs text-amber-700">Select a property above to see its reservations.</p>}
            <label className={labelCls}>Search reservations <span className="font-normal text-slate-500">Optional · narrows the list below</span><input type="search" disabled={!form.property_id} value={bookingSearch} onChange={event => setBookingSearch(event.target.value)} placeholder="Guest name or reservation reference" className={`${searchInputCls} px-3`} /></label>
            <label className={labelCls}>Reservation<select required={reservationRequired} disabled={!form.property_id} value={form.reservation_group_id} onChange={event => { change('reservation_group_id', event.target.value); setSelectedReservationLabel(event.target.selectedOptions[0].text); if (event.target.value) setLinkReservation(true); }} className={inputCls}>
              <option value="">{reservationRequired ? 'Select a reservation' : 'No linked reservation'}</option>
              {form.reservation_group_id && !reservations.some(group => group.id === form.reservation_group_id) && <option value={form.reservation_group_id}>{selectedReservationLabel}</option>}
              {reservations.map(group => <option key={group.id} value={group.id}>{group.external_reservation_id} - {group.primary_guest?.name || group.rooms[0]?.guest_name || 'Guest'}</option>)}
            </select></label>
            {bookingState.loading && <p role="status" className="text-xs text-slate-500">Loading reservations...</p>}
            {!bookingState.loading && !bookingState.error && form.property_id && reservations.length === 0 && <p className="text-xs text-slate-500">No reservations found. Try another name or reference.</p>}
            {bookingState.error && <ErrorMsg>{bookingState.error}</ErrorMsg>}
          </>}
        </div>
        {!expense && <div className="space-y-2 sm:col-span-2">
          <label className={labelCls}>Receipts <span className="font-normal text-slate-500">Optional · up to 5 PDF, JPEG or PNG files · 5 MB each</span><input type="file" multiple accept="application/pdf,image/jpeg,image/png" onChange={event => {
            const files = Array.from(event.target.files ?? []); event.target.value = '';
            if (receiptFiles.length + files.length > 5) { setError('Choose up to five receipts.'); return; }
            if (files.some(file => file.size === 0 || file.size > 5 * 1024 * 1024 || !['application/pdf', 'image/jpeg', 'image/png'].includes(file.type))) { setError('Choose PDF, JPEG or PNG receipts up to 5 MB each.'); return; }
            setError(null); setReceiptFiles(current => [...current, ...files]);
          }} className="w-full min-w-0 text-xs file:mr-3 file:rounded-lg file:border file:border-slate-200 file:bg-white file:px-3 file:py-2" /></label>
          {receiptFiles.map((file, index) => <div key={`${file.name}:${index}`} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs"><ReceiptText size={14} className="shrink-0 text-slate-400" /><span className="min-w-0 flex-1 truncate">{file.name}</span><button type="button" aria-label={`Remove receipt ${file.name}`} onClick={() => setReceiptFiles(current => current.filter((_, i) => i !== index))}><X size={14} /></button></div>)}
        </div>}
        {expense && <label className={`${labelCls} sm:col-span-2`}>Reason for change<input required maxLength={300} value={form.reason} onChange={event => change('reason', event.target.value)} className={inputCls} /></label>}
      </fieldset>
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><ActionBtn onClick={close} disabled={busy}>Cancel</ActionBtn><ActionBtn type="submit" variant="primary" disabled={busy}>{busy ? 'Saving...' : expense ? 'Save changes' : 'Save expense'}</ActionBtn></div>
    </form>
  </Dialog>;
}

function ExpenseDetails({ expense, close, updated, initialWarning }: { initialWarning?: string; expense: Expense; close: () => void; updated: (expense: Expense) => void }) {
  const [error, setError] = useState<string | null>(initialWarning ?? null);
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const history = useAsync(async () => (await api.get<HistoryEntry[]>(`/expenses/${expense.id}/history`)).data, [expense.id, refresh]);
  const user = getStoredAuthUser();
  const canEdit = expense.status !== 'VOID' && (user?.role !== 'STAFF' || (expense.status === 'PENDING' && expense.created_by_user_id === user.id));
  async function upload(file: File | undefined) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError('Receipt must be no larger than 5 MB.'); return; }
    setBusy(true); setError(null);
    try {
      const body = new FormData(); body.append('receipt', file);
      const receipt = (await api.post<{ id: string; name: string }>(`/expenses/${expense.id}/receipts`, body, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
      updated({ ...expense, receipts: [...expense.receipts, receipt] }); setRefresh(value => value + 1);
    } catch (err) { setError(getApiErrorMessage(err)); }
    finally { setBusy(false); }
  }
  async function download(receipt: { id: string; name: string }) {
    setError(null);
    try { const response = await api.get(`/expenses/${expense.id}/receipts/${receipt.id}`, { responseType: 'blob' }); downloadBlob(response.data, receipt.name); }
    catch (err) { setError(getApiErrorMessage(err)); }
  }
  return <Dialog title="Expense details" close={close} busy={busy} compact>
    <div className="space-y-4">
      {error && <ErrorMsg>{error}</ErrorMsg>}
      <div><p className="break-words text-sm font-semibold">{expense.description}</p><p className="mt-1 text-xs text-slate-500">{expense.property.name} / {expense.expense_date}</p><div className="mt-3 flex flex-wrap gap-2"><Badge value={expense.status} /><Badge value={expense.payment_status} /></div></div>
      <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">{[
        ['Amount', money(expense.amount, expense.currency)], ['Paid', expense.amount_paid == null ? 'Unspecified' : money(expense.amount_paid, expense.currency)],
        ['Balance', expense.balance_due == null ? 'Unspecified' : money(expense.balance_due, expense.currency)], ['Payment mode', expense.payment_mode || '-'],
        ['Vendor', expense.vendor || '-'], ['Vendor contact', expense.vendor_contact || '-'], ['Reference', expense.invoice_number || '-'], ['Reservation', expense.reservation_reference || '-'],
      ].map(([key, value]) => <div key={key} className="min-w-0"><dt className="text-slate-500">{key}</dt><dd className="mt-1 [overflow-wrap:anywhere] font-medium">{value}</dd></div>)}</dl>
      {expense.void_reason && <p className="break-words text-xs text-rose-700">Void reason: {expense.void_reason}</p>}
      <section className="space-y-3 border-t border-slate-200 pt-4"><h3 className="text-sm font-bold">Receipts</h3>
        {expense.receipts.length === 0 && <p className="text-xs text-slate-500">No receipts attached.</p>}
        {expense.receipts.map(receipt => <button type="button" key={receipt.id} onClick={() => void download(receipt)} className="flex max-w-full items-center gap-2 text-left text-xs font-semibold text-emerald-700"><Download size={14} className="shrink-0" /><span className="break-all">{receipt.name}</span></button>)}
        {canEdit && expense.receipts.length < 5 && <label className={labelCls}>Attach receipt (PDF, JPEG or PNG, max 5 MB)<input type="file" accept="application/pdf,image/jpeg,image/png" disabled={busy} onChange={event => { void upload(event.target.files?.[0]); event.target.value = ''; }} className="w-full min-w-0 text-xs file:mr-3 file:rounded file:border file:border-slate-200 file:bg-slate-50 file:px-3 file:py-2" /></label>}
        {busy && <p className="text-xs text-slate-500">Uploading receipt...</p>}
      </section>
      <section className="space-y-3 border-t border-slate-200 pt-4"><h3 className="text-sm font-bold">History</h3>
        {history.loading && <p className="text-xs text-slate-500">Loading history...</p>}{history.error && <ErrorMsg>{history.error}</ErrorMsg>}
        {!history.loading && history.data?.length === 0 && <p className="text-xs text-slate-500">No recorded changes.</p>}
        {(history.data ?? []).map(entry => <div key={entry.id} className="border-l-2 border-slate-200 pl-3 text-xs"><p className="break-words font-semibold">{entry.summary}</p><p className="mt-1 text-slate-500">{entry.user?.name || 'System'} / {new Date(entry.createdAt).toLocaleString()}</p>{entry.metadata?.reason && <p className="mt-1 break-words">{entry.metadata.reason}</p>}
          {entry.metadata?.before && entry.metadata.after && <dl className="mt-2 space-y-1">{Object.entries(entry.metadata.after).filter(([key, value]) => entry.metadata?.before?.[key] !== value).map(([key, value]) => <div key={key} className="break-words"><dt className="inline text-slate-500">{label(key)}: </dt><dd className="inline">{String(entry.metadata?.before?.[key] ?? '-')} → {String(value ?? '-')}</dd></div>)}</dl>}
        </div>)}
      </section>
    </div>
  </Dialog>;
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ExpensesPage({ activePropertyId = '', properties }: { activePropertyId?: string; properties: Property[] }) {
  const session = getStoredAccessToken();
  if (expenseCacheSession !== session) { expenseCache.clear(); expenseCacheSession = session; }
  const stateKey = `expenses:${activePropertyId}`;
  const [filters, setFilters] = useWorkspaceState(`${stateKey}:filters`, { property_id: activePropertyId, date_from: '', date_to: '', category: '', status: 'ACTIVE', payment_status: '', search: '' });
  const [search, setSearch] = useWorkspaceState(`${stateKey}:search`, filters.search);
  const [sort, setSort] = useWorkspaceState<{ by: 'date' | 'amount' | 'vendor'; direction: 'asc' | 'desc' }>(`${stateKey}:sort`, { by: 'date', direction: 'desc' });
  const [showFilters, setShowFilters] = useWorkspaceState(`${stateKey}:moreFilters`, false);
  const [page, setPage] = useWorkspaceState(`${stateKey}:page`, 1);
  const [reload, setReload] = useState(0);
  const [editor, setEditor] = useState<Expense | 'new' | null>(null);
  const [details, setDetails] = useState<Expense | null>(null);
  const [receiptWarning, setReceiptWarning] = useState<string | undefined>();
  const [action, setAction] = useState<{ expense: Expense; type: 'approve' | 'void' } | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const user = getStoredAuthUser();
  const manager = Boolean(user && user.role !== 'STAFF');
  const params = { ...Object.fromEntries(Object.entries({ ...filters, search, property_id: activePropertyId || filters.property_id }).filter(([, value]) => value !== '')), page, limit: 25, sort_by: sort.by, sort_direction: sort.direction };
  const requestKey = JSON.stringify(params);
  const [result, setResult] = useState(() => ({ key: requestKey, data: expenseCache.get(requestKey)?.data ?? null }));
  const [loading, setLoading] = useState(!expenseCache.has(requestKey));
  const currentData = result.key === requestKey ? result.data : expenseCache.get(requestKey)?.data ?? null;
  const sameProperty = JSON.parse(result.key).property_id === (params as Record<string, unknown>).property_id;
  const data = currentData ?? (sameProperty ? result.data : null);
  const updating = loading || (!currentData && !error) || search !== filters.search.trim();
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(filters.search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [filters.search]);
  useEffect(() => { if (!toast) return; const id = window.setTimeout(() => setToast(null), 4000); return () => window.clearTimeout(id); }, [toast]);
  useEffect(() => {
    const controller = new AbortController(); setError(null);
    if (filters.date_from && filters.date_to && filters.date_from > filters.date_to) { setError('From date must be on or before To date.'); setLoading(false); return; }
    const cached = expenseCache.get(requestKey);
    if (cached) setResult({ key: requestKey, data: cached.data });
    if (cached && Date.now() - cached.loadedAt < EXPENSE_CACHE_MS) { setLoading(false); return; }
    setLoading(true);
    api.get<ExpenseResponse>('/expenses', { params, signal: controller.signal })
      .then(response => {
        if (controller.signal.aborted || getStoredAccessToken() !== session) return;
        expenseCache.set(requestKey, { data: response.data, loadedAt: Date.now() });
        if (expenseCache.size > 30) expenseCache.delete(expenseCache.keys().next().value!);
        setResult({ key: requestKey, data: response.data });
        if (page > Math.max(1, response.data.meta.total_pages)) setPage(Math.max(1, response.data.meta.total_pages));
      })
      .catch(err => { if (!controller.signal.aborted) setError(getApiErrorMessage(err)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [requestKey, reload, session]);
  useEffect(() => { setEditor(null); setDetails(null); setAction(null); }, [activePropertyId]);
  function filter(key: keyof typeof filters, value: string) { setFilters(current => ({ ...current, [key]: value })); setPage(1); }
  function refreshExpenses() { expenseCache.clear(); setReload(value => value + 1); }
  function clearFilters() { setFilters({ property_id: activePropertyId, date_from: '', date_to: '', category: '', status: 'ACTIVE', payment_status: '', search: '' }); setSearch(''); setPage(1); }
  async function exportCsv() {
    setBusy(true); setError(null);
    try { const response = await api.get('/expenses/export.csv', { params, responseType: 'blob' }); downloadBlob(response.data, `expenses-${today()}.csv`); }
    catch (err) { setError(getApiErrorMessage(err)); } finally { setBusy(false); }
  }
  async function performAction(event: FormEvent) {
    event.preventDefault(); if (!action) return; setBusy(true); setError(null);
    try {
      await api.post(`/expenses/${action.expense.id}/${action.type}`, { version: action.expense.version, reason: reason.trim() });
      setToast(action.type === 'void' ? 'Expense voided.' : 'Expense approved.'); setAction(null); refreshExpenses();
    } catch (err) { setError(getApiErrorMessage(err)); } finally { setBusy(false); }
  }
  const rows = data?.data ?? [];
  const hasFilters = Boolean(filters.search || filters.date_from || filters.date_to || filters.category || filters.payment_status || filters.status !== 'ACTIVE' || (!activePropertyId && filters.property_id));
  const advancedFilters: Array<{ key: keyof typeof filters; text: string }> = [];
  if (!activePropertyId && filters.property_id) advancedFilters.push({ key: 'property_id', text: properties.find(property => property.id === filters.property_id)?.name || 'Selected property' });
  if (filters.category) advancedFilters.push({ key: 'category', text: label(filters.category) });
  if (filters.status !== 'ACTIVE') advancedFilters.push({ key: 'status', text: filters.status === 'ALL' ? 'All entries' : label(filters.status) });
  if (filters.payment_status) advancedFilters.push({ key: 'payment_status', text: `Payment: ${label(filters.payment_status)}` });
  const showProperty = !activePropertyId && !filters.property_id;
  function rowActions(expense: Expense) {
    const items = [{ label: 'View details', icon: <ReceiptText size={15} />, onClick: () => { setDetails(expense); setReceiptWarning(undefined); } }];
    if (expense.status !== 'VOID' && (manager || (expense.status === 'PENDING' && expense.created_by_user_id === user?.id))) items.push({ label: 'Edit expense', icon: <Pencil size={15} />, onClick: () => setEditor(expense) });
    if (manager && expense.status === 'PENDING') items.push({ label: 'Approve expense', icon: <Check size={15} />, onClick: () => { setAction({ expense, type: 'approve' }); setReason(''); setError(null); } });
    return <ExpenseActions description={expense.description} items={[...items, ...(manager && expense.status !== 'VOID' ? [{ label: 'Void expense', icon: <Ban size={15} />, danger: true, onClick: () => { setAction({ expense, type: 'void' }); setReason(''); setError(null); } }] : [])]} />;
  }
  function expenseIdentity(expense: Expense) {
    return <div className="min-w-0">
      <button type="button" onClick={() => { setDetails(expense); setReceiptWarning(undefined); }} className="max-w-full rounded text-left text-[13px] font-semibold leading-5 text-slate-900 hover:text-emerald-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"><span className="line-clamp-2 break-words">{expense.description}</span></button>
      <p className="mt-1 truncate text-xs text-slate-500" title={[expense.vendor, expense.invoice_number].filter(Boolean).join(' · ')}>{expense.vendor || 'No vendor'}{expense.invoice_number ? ` · ${expense.invoice_number}` : ''}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-slate-500"><span className="rounded border border-slate-200 px-1.5 py-0.5">{label(expense.category)}</span>{expense.receipts.length > 0 && <span className="inline-flex items-center gap-1"><ReceiptText size={12} />{expense.receipts.length} {expense.receipts.length === 1 ? 'receipt' : 'receipts'}</span>}{expense.reservation_reference && <span className="max-w-full truncate" title={expense.reservation_reference}>{expense.reservation_reference}</span>}</div>
      {showProperty && <p className="mt-1.5 truncate text-[11px] text-slate-500" title={expense.property.name}>{expense.property.name}</p>}
    </div>;
  }
  const expenseDate = (expense: Expense) => new Date(`${expense.expense_date}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  function expenseAmount(expense: Expense) {
    return <p className="break-words text-sm font-semibold tabular-nums text-slate-900"><span className="mr-1.5 text-[10px] font-medium text-slate-400">{expense.currency}</span>{expense.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>;
  }
  function changeSort(by: 'date' | 'amount' | 'vendor') { setSort(current => ({ by, direction: current.by === by ? current.direction === 'asc' ? 'desc' : 'asc' : by === 'vendor' ? 'asc' : 'desc' })); setPage(1); }
  function sortHeading(by: 'date' | 'amount' | 'vendor', title: string) { const Icon = sort.by !== by ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown; return <button type="button" onClick={() => changeSort(by)} className="inline-flex items-center gap-1.5 font-semibold" aria-label={`Sort by ${title.toLowerCase()}`} title={`Sort by ${title.toLowerCase()}`} >{title}<Icon size={12} /></button>; }
  const iconButton = 'grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40';
  return <div className="mx-auto max-w-[1600px] space-y-5">
    <FloatingSuccessToast message={toast} onClose={() => setToast(null)} />
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div><p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Finance</p><h1 className="text-[24px] font-bold tracking-tight text-slate-900">Expenses</h1><p className="mt-1 text-xs text-slate-500">Track spending, payments, and receipts in one place.</p></div>
      <div className="flex flex-wrap items-center gap-2"><button type="button" title="Refresh expenses" aria-label="Refresh expenses" disabled={updating} onClick={refreshExpenses} className={iconButton}><RefreshCw size={15} className={updating ? 'animate-spin' : ''} /></button><ActionBtn icon={<Download size={14} />} disabled={busy || updating || Boolean(error)} onClick={() => void exportCsv()}>Export CSV</ActionBtn><ActionBtn icon={<Plus size={15} />} variant="primary" disabled={!properties.length} onClick={() => setEditor('new')}>New expense</ActionBtn></div>
    </header>
    {error && !action && <ErrorMsg>{error}</ErrorMsg>}
    <section aria-label="Expense filters" className="w-full max-w-4xl rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className={`${labelCls} min-w-0 basis-full sm:max-w-sm sm:flex-1 sm:basis-64`}>Search expenses<div className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="search" placeholder="Vendor, description or invoice…" value={filters.search} onChange={event => filter('search', event.target.value)} className={`${searchInputCls} pl-9 pr-3`} /></div></label>
        <div className="grid min-w-0 basis-full grid-cols-2 gap-3 sm:w-80 sm:basis-auto">
          <label className={`${labelCls} min-w-0`}>From<DatePickerInput label="From" value={filters.date_from} onChange={value => filter('date_from', value)} className={`${inputCls} min-w-0`} /></label>
          <label className={`${labelCls} min-w-0`}>To<DatePickerInput label="To" min={filters.date_from || undefined} value={filters.date_to} onChange={value => filter('date_to', value)} className={`${inputCls} min-w-0`} /></label>
        </div>
        <button type="button" aria-expanded={showFilters} aria-controls="expense-more-filters" onClick={() => setShowFilters(value => !value)} className={`flex h-[42px] items-center justify-center gap-2 rounded-lg border px-3 text-xs font-semibold transition ${showFilters ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}><SlidersHorizontal size={15} />{showFilters ? 'Hide filters' : 'More filters'}{advancedFilters.length > 0 && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800">{advancedFilters.length}</span>}</button>
      </div>
      {showFilters && <div id="expense-more-filters" className="mt-4 grid gap-4 border-t border-slate-100 pt-4 sm:grid-cols-2 xl:grid-cols-4">
        {!activePropertyId && <label className={labelCls}>Property<select value={filters.property_id} onChange={event => filter('property_id', event.target.value)} className={inputCls}><option value="">All properties</option>{properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
        <label className={labelCls}>Category<select value={filters.category} onChange={event => filter('category', event.target.value)} className={inputCls}><option value="">All categories</option>{categories.map(c => <option key={c} value={c}>{label(c)}</option>)}</select></label>
        <label className={labelCls}>Entry status<select value={filters.status} onChange={event => filter('status', event.target.value)} className={inputCls}>{['ACTIVE', 'PENDING', 'APPROVED', 'VOID', 'ALL'].map(s => <option key={s} value={s}>{s === 'ACTIVE' ? 'Active entries' : s === 'ALL' ? 'All entries' : label(s)}</option>)}</select></label>
        <label className={labelCls}>Payment status<select value={filters.payment_status} onChange={event => filter('payment_status', event.target.value)} className={inputCls}><option value="">All payments</option>{['UNPAID', 'PARTIAL', 'PAID', 'UNKNOWN'].map(s => <option key={s} value={s}>{label(s)}</option>)}</select></label>
      </div>}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
        <span>{filters.status === 'ACTIVE' ? 'Active entries · voided excluded' : filters.status === 'ALL' ? 'All entries · includes voided' : `${label(filters.status)} entries`}{!filters.date_from && !filters.date_to ? ' · All dates' : ''}</span>
        {advancedFilters.map(item => <button key={item.key} type="button" onClick={() => filter(item.key, item.key === 'status' ? 'ACTIVE' : '')} aria-label={`Remove ${item.text} filter`} className="inline-flex max-w-full items-center gap-1 rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-600 hover:bg-slate-200"><span className="truncate">{item.text}</span><X size={12} className="shrink-0" /></button>)}
        {hasFilters && <button type="button" onClick={clearFilters} className="ml-auto font-semibold text-emerald-700 hover:underline">Clear filters</button>}
      </div>
    </section>
    <fieldset disabled={updating || Boolean(error)} aria-busy={updating} className="workspace-results min-w-0 space-y-5 border-0 p-0">
    <section aria-label="Expense summary" className="workspace-panel grid divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white sm:grid-cols-2 xl:grid-cols-4 sm:divide-x sm:divide-y-0">
      <div className="px-6 py-5"><p className="text-[11px] font-semibold text-slate-500">Matching expenses</p><p className="mt-3 text-xl font-semibold tabular-nums tracking-tight text-slate-900">{data?.meta.total ?? '—'}</p></div>
      {([{ title: 'Total expenses', field: 'total_amount', tone: 'text-slate-900' }, { title: 'Recorded paid', field: 'recorded_paid', tone: 'text-emerald-700' }, { title: 'Outstanding', field: 'outstanding', tone: 'text-amber-700' }] as const).map(metric => <div key={metric.field} className="min-w-0 px-6 py-5"><p className="text-[11px] font-semibold text-slate-500">{metric.title}</p><div className={`mt-3 space-y-1 break-words text-xl font-semibold tabular-nums tracking-tight ${metric.tone}`}>{data?.summary.totals.length ? data.summary.totals.map(total => <p key={total.currency}>{money(total[metric.field], total.currency)}</p>) : <p>—</p>}</div>{metric.field === 'outstanding' && <div className="mt-2 space-y-1 text-[11px] leading-5 text-slate-500"><p>Known balances · voided excluded</p>{data?.summary.totals.filter(total => total.unknown_payment_count > 0).map(total => <p key={total.currency}>{total.unknown_payment_count} {total.unknown_payment_count === 1 ? 'entry' : 'entries'} with unknown payments ({money(total.unknown_payment_amount, total.currency)}) excluded.</p>)}</div>}</div>)}
    </section>
    <section aria-label="Expense records" className="workspace-panel overflow-hidden rounded-xl border border-slate-200 bg-white">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4"><div className="flex items-center gap-2.5"><h2 id="expense-register-heading" className="text-sm font-semibold text-slate-900">Expense register</h2><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium tabular-nums text-slate-500">{data?.meta.total ?? '—'}</span></div><p className="text-[11px] text-slate-500">{updating ? 'Updating… keeping previous results visible' : 'Select an expense to view details & receipts'}</p></div>
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3 text-xs text-slate-500 xl:hidden"><label>Sort by <select aria-label="Sort expenses by" value={sort.by} onChange={event => changeSort(event.target.value as typeof sort.by)} className="ml-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5"><option value="date">Date</option><option value="amount">Amount</option><option value="vendor">Vendor</option></select></label><button type="button" onClick={() => changeSort(sort.by)} className="rounded-lg border border-slate-200 px-2 py-1.5">{sort.direction === 'asc' ? 'Ascending ↑' : 'Descending ↓'}</button></div>
    <div aria-busy={updating} className="">
      {rows.length > 0 && <>
        <table aria-labelledby="expense-register-heading" className="hidden w-full table-fixed text-left xl:table">
          <colgroup>{[34, 13, 17, 18, 12, 6].map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}</colgroup>
          <thead className="border-b border-slate-200 bg-slate-50/80 text-[10px] uppercase tracking-wider text-slate-500"><tr>{['Expense / vendor', 'Date', 'Amount', 'Payment', 'Approval', 'Actions'].map(heading => <th scope="col" aria-sort={(heading === 'Date' && sort.by === 'date') || (heading === 'Amount' && sort.by === 'amount') || (heading === 'Expense / vendor' && sort.by === 'vendor') ? sort.direction === 'asc' ? 'ascending' : 'descending' : undefined} key={heading} className={`px-4 py-3 font-semibold first:pl-5 ${heading === 'Amount' ? 'text-right' : ''}`}>{heading === 'Date' ? sortHeading('date', heading) : heading === 'Amount' ? sortHeading('amount', heading) : heading === 'Expense / vendor' ? sortHeading('vendor', heading) : <span className={heading === 'Actions' ? 'sr-only' : ''}>{heading}</span>}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(expense => <tr key={expense.id} className={`transition-colors hover:bg-slate-50/70 focus-within:bg-slate-50/70 ${expense.status === 'VOID' ? 'bg-slate-50/60' : ''}`}>
              <td className="py-4 pl-5 pr-4">{expenseIdentity(expense)}</td>
              <td className="px-4 py-4 text-xs text-slate-600"><time dateTime={expense.expense_date}>{expenseDate(expense)}</time></td>
              <td className="px-4 py-4 text-right">{expenseAmount(expense)}</td>
              <td className="px-4 py-4"><ExpensePayment expense={expense} /></td>
              <td className="px-4 py-4"><Badge value={expense.status} /></td>
              <td className="py-4 pr-4">{rowActions(expense)}</td>
            </tr>)}
          </tbody>
        </table>
        <ul aria-label="Expense entries" className="divide-y divide-slate-100 xl:hidden">
          {rows.map(expense => <li key={expense.id} className={`space-y-4 p-5 ${expense.status === 'VOID' ? 'bg-slate-50/60' : ''}`}>
            <div className="flex items-start justify-between gap-3">{expenseIdentity(expense)}{rowActions(expense)}</div>
            <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg bg-slate-50 px-3 py-3">
              <div><p className="mb-1.5 text-[10px] font-medium text-slate-500">Amount</p>{expenseAmount(expense)}</div>
              <div className="text-right"><p className="mb-1.5 text-[10px] font-medium text-slate-500">Payment</p><ExpensePayment expense={expense} /></div>
            </div>
            <div className="flex items-center justify-between gap-3"><time dateTime={expense.expense_date} className="text-[11px] text-slate-500">{expenseDate(expense)}</time><span className="flex items-center gap-2 text-[10px] text-slate-500">Approval <Badge value={expense.status} /></span></div>
          </li>)}
        </ul>
      </>}
      {rows.length === 0 && <div className="px-5 py-14 text-center"><div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-slate-50"><ReceiptText size={24} className="text-slate-400" /></div><p className="text-sm font-semibold text-slate-700">{updating && !data ? 'Loading expenses...' : error ? 'Expenses could not be loaded.' : 'No expenses found'}</p>{!updating && !error && <><p className="mt-1.5 text-xs text-slate-500">{hasFilters ? 'Try adjusting your filters to find an expense.' : 'Add your first expense to start tracking spending.'}</p><div className="mt-4"><ActionBtn onClick={hasFilters ? clearFilters : () => setEditor('new')} disabled={!hasFilters && !properties.length}>{hasFilters ? 'Clear filters' : 'New expense'}</ActionBtn></div></>}</div>}
    </div>
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-[11px] text-slate-500"><span>{data?.meta.total ? `Showing ${(data.meta.page - 1) * data.meta.limit + 1}–${(data.meta.page - 1) * data.meta.limit + rows.length} of ${data.meta.total}` : '0 expenses'}</span><div className="flex items-center gap-3"><span>Page {data?.meta.page ?? page} of {Math.max(1, data?.meta.total_pages ?? 1)}</span><div className="flex gap-1.5"><button type="button" aria-label="Previous page" title="Previous page" disabled={updating || page <= 1} onClick={() => setPage(value => value - 1)} className={iconButton}><ChevronLeft size={16} /></button><button type="button" aria-label="Next page" title="Next page" disabled={updating || page >= (data?.meta.total_pages ?? 1)} onClick={() => setPage(value => value + 1)} className={iconButton}><ChevronRight size={16} /></button></div></div></footer>
    </section>
    </fieldset>
    {editor && <ExpenseForm expense={editor === 'new' ? undefined : editor} properties={properties} propertyId={activePropertyId || filters.property_id} close={() => setEditor(null)} onSaved={(expense, warning) => { setEditor(null); setDetails(expense); setReceiptWarning(warning); refreshExpenses(); setToast('Expense saved.'); }} />}
    {details && <ExpenseDetails initialWarning={receiptWarning} expense={details} close={() => setDetails(null)} updated={expense => { setDetails(expense); setReceiptWarning(undefined); refreshExpenses(); }} />}
    {action && <Dialog title={action.type === 'void' ? 'Void expense' : 'Approve expense'} close={() => setAction(null)} busy={busy}><form onSubmit={performAction} className="space-y-4">{error && <ErrorMsg>{error}</ErrorMsg>}<p className="break-words text-sm font-semibold">{action.expense.description} / {money(action.expense.amount, action.expense.currency)}</p><label className={labelCls}>Reason<input required maxLength={300} value={reason} onChange={event => setReason(event.target.value)} className={inputCls} /></label><div className="flex justify-end gap-2"><ActionBtn disabled={busy} onClick={() => setAction(null)}>Cancel</ActionBtn><ActionBtn type="submit" disabled={busy} variant={action.type === 'void' ? 'danger' : 'primary'}>{busy ? 'Saving...' : action.type === 'void' ? 'Void expense' : 'Approve expense'}</ActionBtn></div></form></Dialog>}
  </div>;
}
