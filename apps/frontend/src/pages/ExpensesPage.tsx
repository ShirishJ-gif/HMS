import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { fetchAllPages, PaginatedResponse } from '../api/pagination';
import { Property } from '../api/types';
import { useAsync } from '../hooks/useAsync';
import { ActionBtn, ErrorMsg, Panel, SectionHeading, StatCard, inputCls, labelCls } from './ui';

type Expense = {
  id: string;
  property_id: string;
  expense_date: string;
  category: string;
  vendor: string | null;
  vendor_contact: string | null;
  description: string;
  amount: number;
  currency: string;
  payment_mode: string | null;
  property: Pick<Property, 'id' | 'name' | 'code'>;
};

type ExpenseResponse = PaginatedResponse<Expense> & { summary: { total_amount: number } };

const expenseCategories = [
  { value: 'PROPERTY_EXPENSE', label: 'Property expense' },
  { value: 'BOOKING_EXPENSE', label: 'Booking expense' },
] as const;

function expenseCategoryLabel(category: string) {
  return expenseCategories.find(option => option.value === category)?.label ?? category;
}

const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const defaultForm = {
  property_id: '',
  expense_date: today,
  category: 'PROPERTY_EXPENSE',
  vendor: '',
  vendor_contact: '',
  description: '',
  amount: '',
  currency: 'INR',
  payment_mode: 'CASH',
};

export function ExpensesPage({ activePropertyId = '' }: { activePropertyId?: string }) {
  const propertiesState = useAsync(async () => fetchAllPages<Property>('/properties'), []);
  const properties = propertiesState.data ?? [];
  const [form, setForm] = useState(defaultForm);
  const [propertyFilter, setPropertyFilter] = useState(activePropertyId || '');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ExpenseResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const params = useMemo(() => ({
    page,
    limit: 50,
    property_id: propertyFilter || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    category: categoryFilter.trim() || undefined,
  }), [categoryFilter, dateFrom, dateTo, page, propertyFilter]);

  useEffect(() => {
    if (activePropertyId) {
      setPropertyFilter(activePropertyId);
      setForm(current => ({ ...current, property_id: activePropertyId }));
    }
  }, [activePropertyId]);

  useEffect(() => {
    if (!form.property_id && properties.length === 1) {
      setForm(current => ({ ...current, property_id: properties[0].id }));
    }
  }, [form.property_id, properties]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api.get<ExpenseResponse>('/expenses', { params })
      .then(response => { if (active) setData(response.data); })
      .catch(loadError => { if (active) setError(getApiErrorMessage(loadError)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [params]);

  async function saveExpense(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!form.property_id || !form.expense_date || !form.category || !form.description.trim() || !form.amount.trim()) {
      setError('Property, date, category, description, and amount are required.');
      return;
    }
    setSaving(true);
    try {
      await api.post('/expenses', {
        property_id: form.property_id,
        expense_date: form.expense_date,
        category: form.category,
        vendor: form.vendor.trim() || undefined,
        vendor_contact: form.vendor_contact.trim() || undefined,
        description: form.description.trim(),
        amount: form.amount.trim(),
        currency: form.currency.trim() || 'INR',
        payment_mode: form.payment_mode.trim() || undefined,
      });
      setForm({ ...defaultForm, property_id: activePropertyId || form.property_id });
      setPage(1);
      const response = await api.get<ExpenseResponse>('/expenses', { params: { ...params, page: 1 } });
      setData(response.data);
    } catch (saveError) {
      setError(getApiErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function exportCsv() {
    setError(null);
    try {
      const response = await api.get('/expenses/export.csv', { params, responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'expenses.csv';
      link.click();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(getApiErrorMessage(exportError));
    }
  }

  const expenses = data?.data ?? [];
  const meta = data?.meta ?? { page: 1, total_pages: 1, total: 0, limit: 50 };

  return (
    <div className="-mx-5 -my-6 min-h-screen bg-[#f7f7f5] px-5 py-6 lg:-mx-8 lg:-my-8 lg:px-8 lg:py-8">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400">Finance</p>
          <h1 className="text-[22px] font-black leading-none tracking-tight text-slate-900">Expenses</h1>
          <p className="mt-1 text-[12px] text-slate-400">Record property expenses and export filtered rows as CSV.</p>
        </div>
        <ActionBtn onClick={exportCsv}>Export CSV</ActionBtn>
      </div>

      {error && <div className="mb-4"><ErrorMsg>{error}</ErrorMsg></div>}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[24rem_minmax(0,1fr)]">
        <Panel className="p-4">
          <SectionHeading title="Add expense" eyebrow="Manual entry" />
          <form className="mt-3 space-y-3" onSubmit={saveExpense}>
            <label className={labelCls}>
              <span>Property</span>
              <select className={inputCls} value={form.property_id} disabled={Boolean(activePropertyId)} onChange={event => setForm(current => ({ ...current, property_id: event.target.value }))}>
                <option value="">Select property</option>
                {properties.map(property => <option key={property.id} value={property.id}>{property.name}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className={labelCls}>
                <span>Date</span>
                <input className={inputCls} type="date" value={form.expense_date} onChange={event => setForm(current => ({ ...current, expense_date: event.target.value }))} />
              </label>
              <label className={labelCls}>
                <span>Amount</span>
                <input className={inputCls} inputMode="decimal" value={form.amount} onChange={event => setForm(current => ({ ...current, amount: event.target.value }))} />
              </label>
            </div>
            <label className={labelCls}>
              <span>Category</span>
              <select className={inputCls} value={form.category} onChange={event => setForm(current => ({ ...current, category: event.target.value }))}>
                {expenseCategories.map(category => <option key={category.value} value={category.value}>{category.label}</option>)}
              </select>
            </label>
            <label className={labelCls}><span>Description</span><input className={inputCls} value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className={labelCls}><span>Vendor</span><input className={inputCls} value={form.vendor} onChange={event => setForm(current => ({ ...current, vendor: event.target.value }))} /></label>
              <label className={labelCls}><span>Vendor contact</span><input className={inputCls} value={form.vendor_contact} onChange={event => setForm(current => ({ ...current, vendor_contact: event.target.value }))} /></label>
            </div>
            <label className={labelCls}><span>Mode</span><input className={inputCls} value={form.payment_mode} onChange={event => setForm(current => ({ ...current, payment_mode: event.target.value }))} /></label>
            <ActionBtn type="submit" variant="primary" disabled={saving}>{saving ? 'Saving...' : 'Save expense'}</ActionBtn>
          </form>
        </Panel>

        <div className="space-y-4 min-w-0">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatCard label="Rows" value={meta.total} />
            <StatCard label="Total" value={`INR ${(data?.summary.total_amount ?? 0).toLocaleString()}`} />
            <StatCard label="Page" value={`${meta.page}/${meta.total_pages}`} />
          </div>
          <Panel className="p-4">
            <SectionHeading title="Expense register" eyebrow={loading ? 'Loading' : `${expenses.length} shown`} />
            <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-4">
              <select className={inputCls} value={propertyFilter} disabled={Boolean(activePropertyId)} onChange={event => setPropertyFilter(event.target.value)}>
                <option value="">All properties</option>
                {properties.map(property => <option key={property.id} value={property.id}>{property.name}</option>)}
              </select>
              <input className={inputCls} type="date" value={dateFrom} onChange={event => setDateFrom(event.target.value)} />
              <input className={inputCls} type="date" value={dateTo} onChange={event => setDateTo(event.target.value)} />
              <select className={inputCls} value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}>
                <option value="">All categories</option>
                {expenseCategories.map(category => <option key={category.value} value={category.value}>{category.label}</option>)}
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead><tr className="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400"><th className="py-2 pr-3">Date</th><th className="py-2 pr-3">Property</th><th className="py-2 pr-3">Category</th><th className="py-2 pr-3">Description</th><th className="py-2 pr-3">Vendor</th><th className="py-2 pr-3">Contact</th><th className="py-2 pr-3 text-right">Amount</th></tr></thead>
                <tbody>
                  {expenses.map(expense => (
                    <tr key={expense.id} className="border-b border-slate-50">
                      <td className="py-3 pr-3 font-semibold text-slate-700">{expense.expense_date}</td>
                      <td className="py-3 pr-3 text-slate-600">{expense.property.name}</td>
                      <td className="py-3 pr-3 text-slate-600">{expenseCategoryLabel(expense.category)}</td>
                      <td className="py-3 pr-3 text-slate-800">{expense.description}</td>
                      <td className="py-3 pr-3 text-slate-500">{expense.vendor ?? '-'}</td>
                      <td className="py-3 pr-3 text-slate-500">{expense.vendor_contact ?? '-'}</td>
                      <td className="py-3 pr-3 text-right font-bold text-slate-900">{expense.currency} {expense.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                  {!loading && expenses.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-sm font-medium text-slate-400">No expenses found.</td></tr>}
                </tbody>
              </table>
            </div>
            {meta.total_pages > 1 && (
              <div className="mt-4 flex items-center justify-end gap-2">
                <ActionBtn size="sm" disabled={page <= 1} onClick={() => setPage(current => current - 1)}>Prev</ActionBtn>
                <ActionBtn size="sm" disabled={page >= meta.total_pages} onClick={() => setPage(current => current + 1)}>Next</ActionBtn>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
