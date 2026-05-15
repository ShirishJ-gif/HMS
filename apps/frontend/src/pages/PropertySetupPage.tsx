import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { api, getApiErrorMessage } from '../api/client';
import { fetchAllPages } from '../api/pagination';
import { PricingRule, Property, RatePlan, RoomCategory } from '../api/types';
import { CustomSelect } from '../components/CustomSelect';
import { useAsync } from '../hooks/useAsync';
import { formatCurrency } from '../utils/format';
import { labelCls, inputCls, primaryBtn, secondaryBtn, TableCard, SectionHeading, DetailList, Th, Td, ErrorMsg, LoadingMsg, SuccessMsg, StatusBadge } from './ui';

const defaultPropertyForm = { name: '', code: '', phone: '', email: '', address: '', timezone: 'Asia/Kolkata' };
const defaultCategoryForm = { property_id: '', name: '', code: '', description: '', max_occupancy: '2' };
const defaultRatePlanForm = { property_id: '', room_category_id: '', name: '', code: '', base_rate: '', currency: 'INR' };
const defaultPricingRuleForm = { property_id: '', rate_plan_id: '', name: '', type: 'WEEKEND', adjustment_percent: '', start_date: '', end_date: '', occupancy_threshold: '' };

export function PropertySetupPage() {
  const [reloadKey, setReloadKey] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [editingPricingRuleId, setEditingPricingRuleId] = useState<string | null>(null);
  const pricingRuleFormRef = useRef<HTMLFormElement | null>(null);
  const [propertyForm, setPropertyForm] = useState(defaultPropertyForm);
  const [categoryForm, setCategoryForm] = useState(defaultCategoryForm);
  const [ratePlanForm, setRatePlanForm] = useState(defaultRatePlanForm);
  const [pricingRuleForm, setPricingRuleForm] = useState(defaultPricingRuleForm);
  const [propertyImageForm, setPropertyImageForm] = useState({ property_id: '', caption: '', is_primary: true });
  const [roomImageForm, setRoomImageForm] = useState({ room_category_id: '', caption: '', is_primary: true });
  const [propertyImageFiles, setPropertyImageFiles] = useState<File[]>([]);
  const [roomImageFiles, setRoomImageFiles] = useState<File[]>([]);
  const [primaryPropertyImageIndex, setPrimaryPropertyImageIndex] = useState(0);
  const [primaryRoomImageIndex, setPrimaryRoomImageIndex] = useState(0);
  const [propertyImageInputKey, setPropertyImageInputKey] = useState(0);
  const [roomImageInputKey, setRoomImageInputKey] = useState(0);
  const propertiesState = useAsync(async () => fetchAllPages<Property>('/properties'), [reloadKey]);
  const categoriesState = useAsync(async () => fetchAllPages<RoomCategory>('/room-categories'), [reloadKey]);
  const ratePlansState = useAsync(async () => fetchAllPages<RatePlan>('/rate-plans'), [reloadKey]);
  const pricingRulesState = useAsync(async () => fetchAllPages<PricingRule>('/pricing-rules'), [reloadKey]);
  const properties = propertiesState.data ?? [];
  const categories = categoriesState.data ?? [];
  const ratePlans = ratePlansState.data ?? [];
  const pricingRules = pricingRulesState.data ?? [];
  const activePricingRules = pricingRules.filter((r) => r.is_active).length;
  const hasSetupMedia = properties.some((p) => p.images.length > 0) || categories.some((c) => c.images.length > 0);

  async function runAction(actionName: string, action: () => Promise<void>) {
    setActionError(null); setActionStatus(null); setPendingAction(actionName);
    try { await action(); } catch (error) { setActionError(getApiErrorMessage(error)); } finally { setPendingAction(null); }
  }

  async function submitProperty(event: FormEvent) {
    event.preventDefault();
    await runAction('create-property', async () => { await api.post('/properties', { ...propertyForm, phone: propertyForm.phone || undefined, email: propertyForm.email || undefined }); setPropertyForm(defaultPropertyForm); setActionStatus('Property created.'); setReloadKey((v) => v + 1); });
  }
  async function submitCategory(event: FormEvent) {
    event.preventDefault();
    await runAction('create-category', async () => { await api.post('/room-categories', { ...categoryForm, max_occupancy: Number(categoryForm.max_occupancy), description: categoryForm.description || undefined }); setCategoryForm((c) => ({ ...defaultCategoryForm, property_id: c.property_id })); setActionStatus('Room category created.'); setReloadKey((v) => v + 1); });
  }
  async function submitRatePlan(event: FormEvent) {
    event.preventDefault();
    await runAction('create-rate-plan', async () => { await api.post('/rate-plans', ratePlanForm); setRatePlanForm((c) => ({ ...defaultRatePlanForm, property_id: c.property_id, room_category_id: c.room_category_id, currency: c.currency })); setActionStatus('Rate plan created.'); setReloadKey((v) => v + 1); });
  }
  async function submitPricingRule(event: FormEvent) {
    event.preventDefault();
    await runAction(editingPricingRuleId ? 'update-pricing-rule' : 'create-pricing-rule', async () => {
      const payload = { property_id: pricingRuleForm.property_id, rate_plan_id: pricingRuleForm.rate_plan_id, name: pricingRuleForm.name, type: pricingRuleForm.type, adjustment_percent: pricingRuleForm.adjustment_percent, occupancy_threshold: pricingRuleForm.type === 'OCCUPANCY' && pricingRuleForm.occupancy_threshold ? Number(pricingRuleForm.occupancy_threshold) : undefined, start_date: pricingRuleForm.type === 'DATE_RANGE' ? pricingRuleForm.start_date || undefined : undefined, end_date: pricingRuleForm.type === 'DATE_RANGE' ? pricingRuleForm.end_date || undefined : undefined };
      if (editingPricingRuleId) { await api.put(`/pricing-rules/${editingPricingRuleId}`, payload); } else { await api.post('/pricing-rules', payload); }
      setPricingRuleForm((c) => ({ ...defaultPricingRuleForm, property_id: c.property_id, rate_plan_id: editingPricingRuleId ? '' : c.rate_plan_id })); setEditingPricingRuleId(null);
      setActionStatus(editingPricingRuleId ? 'Pricing rule updated.' : 'Pricing rule created.'); setReloadKey((v) => v + 1);
    });
  }
  async function togglePricingRule(rule: PricingRule) {
    await runAction(`toggle-pricing-rule:${rule.id}`, async () => { await api.put(`/pricing-rules/${rule.id}`, { is_active: !rule.is_active }); if (editingPricingRuleId === rule.id) { setEditingPricingRuleId(null); setPricingRuleForm(defaultPricingRuleForm); } setActionStatus(`Pricing rule ${!rule.is_active ? 'enabled' : 'disabled'}.`); setReloadKey((v) => v + 1); });
  }
  async function deletePricingRule(rule: PricingRule) {
    await runAction(`delete-pricing-rule:${rule.id}`, async () => { await api.delete(`/pricing-rules/${rule.id}`); if (editingPricingRuleId === rule.id) { setEditingPricingRuleId(null); setPricingRuleForm(defaultPricingRuleForm); } setActionStatus('Pricing rule deleted.'); setReloadKey((v) => v + 1); });
  }
  function startEditingPricingRule(rule: PricingRule) {
    setActionError(null); setActionStatus(null); setEditingPricingRuleId(rule.id);
    setPricingRuleForm({ property_id: rule.property_id, rate_plan_id: rule.rate_plan_id, name: rule.name, type: rule.type, adjustment_percent: String(rule.adjustment_percent), start_date: rule.start_date ?? '', end_date: rule.end_date ?? '', occupancy_threshold: rule.occupancy_threshold == null ? '' : String(rule.occupancy_threshold) });
    requestAnimationFrame(() => { pricingRuleFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  }
  function cancelEditingPricingRule() { setEditingPricingRuleId(null); setPricingRuleForm(defaultPricingRuleForm); }
  async function submitPropertyImage(event: FormEvent) {
    event.preventDefault(); if (propertyImageFiles.length === 0) return;
    const primaryIndex = Math.min(primaryPropertyImageIndex, propertyImageFiles.length - 1);
    await runAction('upload-property-image', async () => {
      for (let index = 0; index < propertyImageFiles.length; index += 1) {
        const formData = new FormData(); formData.append('image', propertyImageFiles[index]); formData.append('caption', propertyImageForm.caption); formData.append('is_primary', String(index === primaryIndex));
        await api.post(`/properties/${propertyImageForm.property_id}/images`, formData);
      }
      setPropertyImageForm({ property_id: '', caption: '', is_primary: true }); setPropertyImageFiles([]); setPrimaryPropertyImageIndex(0); setPropertyImageInputKey((v) => v + 1); setActionStatus(`${propertyImageFiles.length} property photo${propertyImageFiles.length === 1 ? '' : 's'} uploaded.`); setReloadKey((v) => v + 1);
    });
  }
  async function submitRoomImage(event: FormEvent) {
    event.preventDefault(); if (roomImageFiles.length === 0) return;
    const primaryIndex = Math.min(primaryRoomImageIndex, roomImageFiles.length - 1);
    await runAction('upload-room-image', async () => {
      for (let index = 0; index < roomImageFiles.length; index += 1) {
        const formData = new FormData(); formData.append('image', roomImageFiles[index]); formData.append('caption', roomImageForm.caption); formData.append('is_primary', String(index === primaryIndex));
        await api.post(`/room-categories/${roomImageForm.room_category_id}/images`, formData);
      }
      setRoomImageForm({ room_category_id: '', caption: '', is_primary: true }); setRoomImageFiles([]); setPrimaryRoomImageIndex(0); setRoomImageInputKey((v) => v + 1); setActionStatus(`${roomImageFiles.length} room category photo${roomImageFiles.length === 1 ? '' : 's'} uploaded.`); setReloadKey((v) => v + 1);
    });
  }
  function mediaUrl(url: string) { return `${(api.defaults.baseURL ?? '').replace(/\/$/, '')}${url}`; }

  return (
    <section className="space-y-5">
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-amber-500 mb-1">Commercial setup</p>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Property Setup</h2>
        <p className="text-sm text-slate-500 mt-1 leading-relaxed max-w-2xl">Create properties, room categories, rate plans, and pricing structure before adding physical rooms or opening OTA inventory.</p>
      </div>

      {actionStatus && <SuccessMsg>{actionStatus}</SuccessMsg>}
      {actionError && <ErrorMsg>{actionError}</ErrorMsg>}

      <div className="grid grid-cols-3 gap-4">
        {[{ label: 'Properties', value: properties.length.toString(), sub: 'Operating entities' }, { label: 'Categories', value: categories.length.toString(), sub: 'Sellable room groups' }, { label: 'Rate plans', value: ratePlans.length.toString(), sub: 'Commercial plans' }].map((s) => (
          <div key={s.label} className="bg-white border border-slate-200 rounded-xl shadow-sm p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{s.label}</p>
            <strong className="text-2xl font-extrabold text-slate-900 block">{s.value}</strong>
            <span className="text-xs text-slate-500">{s.sub}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-3 items-start bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm">
        <strong className="text-slate-800 flex-shrink-0">Commercial setup</strong>
        <span className="text-slate-500 leading-relaxed">Build the property, category, rate, media, and pricing layers in that order. This workspace defines the commercial structure that later feeds OTA mapping and sellable inventory.</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(20rem,1.1fr)] xl:grid-cols-[minmax(0,0.95fr)_minmax(22rem,1.05fr)] gap-5 items-stretch">
        <form className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-4 h-full" onSubmit={submitProperty}>
          <SectionHeading eyebrow="Property" title="Create property" />
          <div className="grid grid-cols-2 gap-4">
            <label className={labelCls}><span>Property name</span><input className={inputCls} onChange={(e) => setPropertyForm({ ...propertyForm, name: e.target.value })} placeholder="Harbour Residency" required value={propertyForm.name} /></label>
            <label className={labelCls}><span>Code</span><input className={inputCls} onChange={(e) => setPropertyForm({ ...propertyForm, code: e.target.value })} placeholder="HARBOUR-MUM" required value={propertyForm.code} /></label>
            <label className={labelCls}><span>Phone</span><input className={inputCls} onChange={(e) => setPropertyForm({ ...propertyForm, phone: e.target.value })} placeholder="+912212345678" value={propertyForm.phone} /></label>
            <label className={labelCls}><span>Email</span><input className={inputCls} onChange={(e) => setPropertyForm({ ...propertyForm, email: e.target.value })} placeholder="ops@hotel.example.com" type="email" value={propertyForm.email} /></label>
            <label className={labelCls}><span>Timezone</span><input className={inputCls} onChange={(e) => setPropertyForm({ ...propertyForm, timezone: e.target.value })} placeholder="Asia/Kolkata" required value={propertyForm.timezone} /></label>
            <label className={`${labelCls} col-span-2`}><span>Address</span><textarea className={`${inputCls} resize-none rows-2`} onChange={(e) => setPropertyForm({ ...propertyForm, address: e.target.value })} placeholder="Bandra West, Mumbai, Maharashtra" required value={propertyForm.address} /></label>
          </div>
          <button className={primaryBtn} disabled={pendingAction === 'create-property'} type="submit">{pendingAction === 'create-property' ? 'Adding…' : 'Add property'}</button>
        </form>

        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-4 h-full">
          <SectionHeading eyebrow="Setup posture" title="Commercial inventory" />
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Properties', value: properties.length, tone: 'bg-slate-100 border-slate-200 text-slate-700' },
              { label: 'Rate plans', value: ratePlans.length, tone: 'bg-emerald-50 border-emerald-100 text-emerald-700' },
              { label: 'Active rules', value: activePricingRules, tone: 'bg-amber-50 border-amber-100 text-amber-700' },
            ].map((s) => (
              <div key={s.label} className={`rounded-lg border p-3 min-h-20 flex flex-col justify-between ${s.tone}`}>
                <span className="text-[10px] font-bold uppercase tracking-wide opacity-80">{s.label}</span>
                <strong className="text-2xl font-extrabold leading-none">{s.value}</strong>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Setup coverage</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Room types', value: categories.length.toString() },
                { label: 'Rules', value: pricingRules.length.toString() },
                { label: 'Media', value: (properties.flatMap((p) => p.images).length + categories.flatMap((c) => c.images).length).toString() },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-slate-100 bg-white px-3 py-2">
                  <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">{item.label}</span>
                  <strong className="mt-0.5 block text-sm font-extrabold text-slate-800">{item.value}</strong>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Setup order</p>
            <ol className="space-y-2 text-sm font-semibold leading-relaxed text-slate-600">
              <li>1. Complete property details.</li>
              <li>2. Add room types and rate plans.</li>
              <li>3. Configure pricing rules and media.</li>
              <li>4. Continue to OTA mapping.</li>
            </ol>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(20rem,1.1fr)] xl:grid-cols-[minmax(0,0.95fr)_minmax(22rem,1.05fr)] gap-5 items-stretch">
        <form className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-4 h-full" onSubmit={submitCategory}>
          <SectionHeading eyebrow="Inventory" title="Create room category" />
          <label className={labelCls}><span>Property</span><CustomSelect onChange={(v) => setCategoryForm({ ...categoryForm, property_id: v })} options={properties.map((p) => ({ label: p.name, value: p.id }))} placeholder="Select property" value={categoryForm.property_id} /></label>
          <div className="grid grid-cols-2 gap-4">
            <label className={labelCls}><span>Category name</span><input className={inputCls} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })} placeholder="Deluxe" required value={categoryForm.name} /></label>
            <label className={labelCls}><span>Code</span><input className={inputCls} onChange={(e) => setCategoryForm({ ...categoryForm, code: e.target.value })} placeholder="DELUXE" required value={categoryForm.code} /></label>
            <label className={labelCls}><span>Max occupancy</span><input className={inputCls} min="1" onChange={(e) => setCategoryForm({ ...categoryForm, max_occupancy: e.target.value })} placeholder="3" required type="number" value={categoryForm.max_occupancy} /></label>
            <label className={`${labelCls} col-span-2`}><span>Description</span><textarea className={`${inputCls} resize-none`} onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })} placeholder="Premium room with upgraded amenities" value={categoryForm.description} /></label>
          </div>
          <button className={primaryBtn} disabled={pendingAction === 'create-category'} type="submit">{pendingAction === 'create-category' ? 'Adding…' : 'Add category'}</button>
        </form>

        <form className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-4 h-full" onSubmit={submitRatePlan}>
          <SectionHeading eyebrow="Rates" title="Create rate plan" />
          <label className={labelCls}><span>Property</span><CustomSelect onChange={(v) => setRatePlanForm({ ...ratePlanForm, property_id: v })} options={properties.map((p) => ({ label: p.name, value: p.id }))} placeholder="Select property" value={ratePlanForm.property_id} /></label>
          <label className={labelCls}><span>Room category</span><CustomSelect onChange={(v) => setRatePlanForm({ ...ratePlanForm, room_category_id: v })} options={categories.filter((c) => !ratePlanForm.property_id || c.property_id === ratePlanForm.property_id).map((c) => ({ label: c.name, value: c.id }))} placeholder="Select category" value={ratePlanForm.room_category_id} /></label>
          <div className="grid grid-cols-2 gap-4">
            <label className={labelCls}><span>Plan name</span><input className={inputCls} onChange={(e) => setRatePlanForm({ ...ratePlanForm, name: e.target.value })} placeholder="Deluxe Flexible" required value={ratePlanForm.name} /></label>
            <label className={labelCls}><span>Code</span><input className={inputCls} onChange={(e) => setRatePlanForm({ ...ratePlanForm, code: e.target.value })} placeholder="DELUXE-FLEX" required value={ratePlanForm.code} /></label>
            <label className={labelCls}><span>Base rate</span><input className={inputCls} min="0" onChange={(e) => setRatePlanForm({ ...ratePlanForm, base_rate: e.target.value })} placeholder="7500.00" required step="0.01" type="number" value={ratePlanForm.base_rate} /></label>
            <label className={labelCls}><span>Currency</span><input className={inputCls} onChange={(e) => setRatePlanForm({ ...ratePlanForm, currency: e.target.value })} placeholder="INR" required value={ratePlanForm.currency} /></label>
          </div>
          <button className={primaryBtn} disabled={pendingAction === 'create-rate-plan'} type="submit">{pendingAction === 'create-rate-plan' ? 'Adding…' : 'Add rate plan'}</button>
        </form>
      </div>

      <form className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-4" onSubmit={submitPricingRule} ref={pricingRuleFormRef}>
        <div className="flex items-start justify-between gap-4">
          <SectionHeading eyebrow="Dynamic pricing" title={editingPricingRuleId ? 'Edit pricing rule' : 'Create pricing rule'} />
          {editingPricingRuleId && <button className={secondaryBtn} onClick={cancelEditingPricingRule} type="button">Cancel editing</button>}
        </div>
        {editingPricingRuleId && <div className="flex gap-2 items-center bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-sm text-amber-700"><strong className="text-amber-800">Editing existing rule.</strong> Update the fields below and save.</div>}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <label className={labelCls}><span>Property</span><CustomSelect disabled={!!editingPricingRuleId} onChange={(v) => setPricingRuleForm({ ...pricingRuleForm, property_id: v, rate_plan_id: '' })} options={properties.map((p) => ({ label: p.name, value: p.id }))} placeholder="Select property" value={pricingRuleForm.property_id} /></label>
          <label className={labelCls}><span>Rate plan</span><CustomSelect disabled={!!editingPricingRuleId} onChange={(v) => setPricingRuleForm({ ...pricingRuleForm, rate_plan_id: v })} options={ratePlans.filter((r) => !pricingRuleForm.property_id || r.property_id === pricingRuleForm.property_id).map((r) => ({ label: `${r.room_category.name} · ${r.name}`, value: r.id }))} placeholder="Select rate plan" value={pricingRuleForm.rate_plan_id} /></label>
          <label className={labelCls}><span>Rule name</span><input className={inputCls} onChange={(e) => setPricingRuleForm({ ...pricingRuleForm, name: e.target.value })} placeholder="Weekend surcharge" required value={pricingRuleForm.name} /></label>
          <label className={labelCls}><span>Rule type</span><CustomSelect onChange={(v) => setPricingRuleForm({ ...pricingRuleForm, type: v, start_date: '', end_date: '', occupancy_threshold: '' })} options={[{ label: 'Weekend', value: 'WEEKEND' }, { label: 'Festival / date range', value: 'DATE_RANGE' }, { label: 'Occupancy surge', value: 'OCCUPANCY' }]} value={pricingRuleForm.type} /></label>
          <label className={labelCls}><span>Adjustment %</span><input className={inputCls} min="0" onChange={(e) => setPricingRuleForm({ ...pricingRuleForm, adjustment_percent: e.target.value })} placeholder="20" required step="0.01" type="number" value={pricingRuleForm.adjustment_percent} /></label>
          {pricingRuleForm.type === 'DATE_RANGE' && (
            <>
              <label className={labelCls}><span>Start date</span><input className={inputCls} onChange={(e) => setPricingRuleForm({ ...pricingRuleForm, start_date: e.target.value })} required type="date" value={pricingRuleForm.start_date} /></label>
              <label className={labelCls}><span>End date</span><input className={inputCls} onChange={(e) => setPricingRuleForm({ ...pricingRuleForm, end_date: e.target.value })} required type="date" value={pricingRuleForm.end_date} /></label>
            </>
          )}
          {pricingRuleForm.type === 'OCCUPANCY' && (
            <label className={labelCls}><span>Occupancy threshold %</span><input className={inputCls} max="100" min="1" onChange={(e) => setPricingRuleForm({ ...pricingRuleForm, occupancy_threshold: e.target.value })} placeholder="70" required type="number" value={pricingRuleForm.occupancy_threshold} /></label>
          )}
        </div>
        <button className={primaryBtn} disabled={pendingAction === 'create-pricing-rule' || pendingAction === 'update-pricing-rule'} type="submit">{pendingAction === 'update-pricing-rule' ? 'Updating…' : pendingAction === 'create-pricing-rule' ? 'Adding…' : editingPricingRuleId ? 'Update pricing rule' : 'Add pricing rule'}</button>
      </form>

      {(propertiesState.loading || categoriesState.loading || ratePlansState.loading || pricingRulesState.loading) && <LoadingMsg>Loading setup data…</LoadingMsg>}
      {(propertiesState.error || categoriesState.error || ratePlansState.error || pricingRulesState.error) && <ErrorMsg>{propertiesState.error ?? categoriesState.error ?? ratePlansState.error ?? pricingRulesState.error}</ErrorMsg>}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.05fr)_minmax(20rem,1.1fr)] xl:grid-cols-[minmax(0,0.95fr)_minmax(22rem,1.05fr)] gap-5 items-stretch">
        <form className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-4 h-full" onSubmit={submitPropertyImage}>
          <SectionHeading eyebrow="Media" title="Property photos" />
          <label className={labelCls}><span>Property</span><CustomSelect onChange={(v) => setPropertyImageForm({ ...propertyImageForm, property_id: v })} options={properties.map((p) => ({ label: p.name, value: p.id }))} placeholder="Select property" value={propertyImageForm.property_id} /></label>
          <label className={labelCls}><span>Caption</span><input className={inputCls} onChange={(e) => setPropertyImageForm({ ...propertyImageForm, caption: e.target.value })} placeholder="Front exterior" value={propertyImageForm.caption} /></label>
          <div className={labelCls}>
            <span>Image</span>
            <FileUploadBox files={propertyImageFiles} id="property-image-upload" inputKey={propertyImageInputKey} onFilesChange={(files) => { setPropertyImageFiles(files); setPrimaryPropertyImageIndex(0); }} onPrimaryIndexChange={setPrimaryPropertyImageIndex} primaryIndex={primaryPropertyImageIndex} />
          </div>
          <button className={primaryBtn} disabled={pendingAction === 'upload-property-image' || propertyImageFiles.length === 0} type="submit">{pendingAction === 'upload-property-image' ? 'Uploading…' : propertyImageFiles.length > 1 ? `Upload ${propertyImageFiles.length} photos` : 'Upload property photo'}</button>
        </form>

        <form className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-4 h-full" onSubmit={submitRoomImage}>
          <SectionHeading eyebrow="Media" title="Room category photos" />
          <label className={labelCls}><span>Room category</span><CustomSelect onChange={(v) => setRoomImageForm({ ...roomImageForm, room_category_id: v })} options={categories.map((c) => ({ label: `${c.property.name} · ${c.name}`, value: c.id }))} placeholder="Select category" value={roomImageForm.room_category_id} /></label>
          <label className={labelCls}><span>Caption</span><input className={inputCls} onChange={(e) => setRoomImageForm({ ...roomImageForm, caption: e.target.value })} placeholder="Deluxe king bed" value={roomImageForm.caption} /></label>
          <div className={labelCls}>
            <span>Image</span>
            <FileUploadBox files={roomImageFiles} id="room-image-upload" inputKey={roomImageInputKey} onFilesChange={(files) => { setRoomImageFiles(files); setPrimaryRoomImageIndex(0); }} onPrimaryIndexChange={setPrimaryRoomImageIndex} primaryIndex={primaryRoomImageIndex} />
          </div>
          <button className={primaryBtn} disabled={pendingAction === 'upload-room-image' || roomImageFiles.length === 0} type="submit">{pendingAction === 'upload-room-image' ? 'Uploading…' : roomImageFiles.length > 1 ? `Upload ${roomImageFiles.length} photos` : 'Upload room photo'}</button>
        </form>
      </div>

      {hasSetupMedia && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-3">Media library</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {properties.flatMap((property) => property.images.map((image) => (
              <article key={image.id} className="group rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                <img alt={image.caption ?? property.name} className="w-full h-28 object-cover" src={mediaUrl(image.url)} />
                <div className="p-2.5">
                  <strong className="text-xs font-bold text-slate-900 block truncate">{property.name}</strong>
                  <span className="text-[11px] text-slate-500 truncate block">{image.caption ?? 'Property photo'}{image.is_primary ? ' · Primary' : ''}</span>
                </div>
              </article>
            )))}
            {categories.flatMap((category) => category.images.map((image) => (
              <article key={image.id} className="group rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                <img alt={image.caption ?? category.name} className="w-full h-28 object-cover" src={mediaUrl(image.url)} />
                <div className="p-2.5">
                  <strong className="text-xs font-bold text-slate-900 block truncate">{category.property.name} · {category.name}</strong>
                  <span className="text-[11px] text-slate-500 truncate block">{image.caption ?? 'Room category photo'}{image.is_primary ? ' · Primary' : ''}</span>
                </div>
              </article>
            )))}
          </div>
        </div>
      )}

      <TableCard title={`${ratePlans.length} rate plans configured`} eyebrow="Rate inventory">
        <table className="w-full min-w-[500px]">
          <thead><tr className="bg-slate-50 border-b border-slate-100"><Th>Property</Th><Th>Category</Th><Th>Rate plan</Th><Th>Base rate</Th><Th>Status</Th></tr></thead>
          <tbody>
            {ratePlans.map((rp) => (
              <tr key={rp.id} className="hover:bg-slate-50/60 border-b border-slate-50 last:border-0">
                <Td>{rp.property.name}</Td>
                <Td>{rp.room_category.name}</Td>
                <Td><span className="font-medium text-slate-900 block">{rp.name}</span><span className="text-xs text-slate-400 font-mono">{rp.code}</span></Td>
                <Td>{formatCurrency(rp.base_rate)}</Td>
                <Td><StatusBadge label={rp.is_active ? 'ACTIVE' : 'INACTIVE'} tone={rp.is_active ? 'green' : 'default'} /></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>

      <TableCard title={`${pricingRules.length} pricing rules configured`} eyebrow="Dynamic pricing">
        <table className="w-full min-w-[600px]">
          <thead><tr className="bg-slate-50 border-b border-slate-100"><Th>Property</Th><Th>Rate plan</Th><Th>Rule</Th><Th>Adjustment</Th><Th>Condition</Th><Th>Status</Th><Th>Actions</Th></tr></thead>
          <tbody>
            {pricingRules.map((rule) => (
              <tr key={rule.id} className={`hover:bg-slate-50/60 border-b border-slate-50 last:border-0 ${editingPricingRuleId === rule.id ? 'bg-amber-50/40' : ''}`}>
                <Td>{rule.property.name}</Td>
                <Td><span className="font-medium text-slate-900 block">{rule.rate_plan.room_category.name} · {rule.rate_plan.name}</span><span className="text-xs text-slate-400 font-mono">{rule.rate_plan.code}</span></Td>
                <Td className="font-medium text-slate-900">{rule.name}</Td>
                <Td>+{rule.adjustment_percent}%</Td>
                <Td className="text-xs">
                  {rule.type === 'WEEKEND' && 'Saturday / Sunday'}
                  {rule.type === 'DATE_RANGE' && `${rule.start_date} to ${rule.end_date}`}
                  {rule.type === 'OCCUPANCY' && `Occupancy ≥ ${rule.occupancy_threshold}%`}
                </Td>
                <Td><StatusBadge label={rule.is_active ? 'ACTIVE' : 'INACTIVE'} tone={rule.is_active ? 'green' : 'default'} /></Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <button className={`${secondaryBtn} !text-xs !px-2.5 !py-1.5`} onClick={() => startEditingPricingRule(rule)} type="button">Edit</button>
                    <button className={`${secondaryBtn} !text-xs !px-2.5 !py-1.5`} disabled={pendingAction === `toggle-pricing-rule:${rule.id}`} onClick={() => void togglePricingRule(rule)} type="button">{pendingAction === `toggle-pricing-rule:${rule.id}` ? 'Saving…' : rule.is_active ? 'Disable' : 'Enable'}</button>
                    <button className={`${secondaryBtn} !text-xs !px-2.5 !py-1.5 !text-rose-600 hover:!bg-rose-50 hover:!border-rose-200`} disabled={pendingAction === `delete-pricing-rule:${rule.id}`} onClick={() => void deletePricingRule(rule)} type="button">{pendingAction === `delete-pricing-rule:${rule.id}` ? 'Deleting…' : 'Delete'}</button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableCard>
    </section>
  );
}

function FileUploadBox({ files, id, inputKey, onFilesChange, onPrimaryIndexChange, primaryIndex }: { files: File[]; id: string; inputKey: number; onFilesChange: (files: File[]) => void; onPrimaryIndexChange: (index: number) => void; primaryIndex: number }) {
  const inputId = `${id}-${inputKey}`;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previews = useMemo(() => files.map((file) => ({ file, url: URL.createObjectURL(file) })), [files]);

  useEffect(() => () => { previews.forEach((preview) => URL.revokeObjectURL(preview.url)); }, [previews]);

  return (
    <div className="space-y-3">
      <input
        accept="image/*"
        className="sr-only"
        id={inputId}
        key={inputKey}
        ref={inputRef}
        multiple
        onChange={(event) => onFilesChange(Array.from(event.target.files ?? []))}
        type="file"
      />
      <div className="rounded-xl border border-slate-100 bg-white p-2">
        {files.length > 0 && <p className="px-1 pb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400"></p>}
        <div className="grid grid-cols-3 gap-2">
          {files.length === 0 ? (
            <button
              className="col-span-full flex min-h-24 w-full cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-center transition hover:border-emerald-300 hover:bg-emerald-50/50"
              onClick={() => inputRef.current?.click()}
              type="button"
            >
              <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-lg font-semibold leading-none text-slate-500">+</span>
              <span className="text-sm font-bold text-slate-700">Add images</span>
              <span className="mt-1 text-[11px] font-medium text-slate-400">Upload JPG or PNG</span>
            </button>
          ) : previews.map((preview, index) => (
            <button className={`group relative min-h-20 cursor-pointer overflow-hidden rounded-lg border bg-slate-50 text-left ${primaryIndex === index ? 'border-emerald-300 ring-2 ring-emerald-100' : 'border-slate-100'}`} key={`${preview.file.name}-${preview.file.size}-${index}`} onClick={() => onPrimaryIndexChange(index)} type="button">
              <img alt={preview.file.name} className="h-20 w-full object-cover" src={preview.url} />
              <span className="absolute inset-x-0 bottom-0 bg-slate-950/65 px-2 py-1.5 text-[11px] font-semibold text-white">
                <span className="block truncate">{preview.file.name}</span>
              </span>
              <a aria-label={`Review ${preview.file.name}`} className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow-sm hover:bg-slate-100" href={preview.url} onClick={(event) => event.stopPropagation()} rel="noreferrer" target="_blank">
                <EyeIcon className="h-3.5 w-3.5" />
              </a>
            </button>
          ))}
        </div>
        {files.length > 0 && <p className="px-1 pt-2 text-[11px] font-medium text-slate-400">Select one image as primary before uploading.</p>}
      </div>
    </div>
  );
}

function EyeIcon({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24">
      <path d="M2.8 12s3.4-6 9.2-6 9.2 6 9.2 6-3.4 6-9.2 6-9.2-6-9.2-6Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      <path d="M12 14.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}
